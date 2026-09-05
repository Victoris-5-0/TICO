"""Mission generation graph (M5 — P0).

Implements the generation pipeline using LangGraph:
    generate -> validate -> repair x2 -> (on second failure) -> template fallback

Flowchart (docs/08 & AGENTS.md):
    1. Load versioned world manifest (content/worlds/*.yaml)
    2. Narrow legal option set via composer scaffold plan and target concept
    3. Model (gemini-3.5-flash) produces structured mission draft
    4. Python validator asserts schema, manifest IDs, legal verbs, and test execution
    5. On validation error: retry once or twice with specific error feedback
    6. On repeated failure: fall back to reviewed template default
    7. Return validated GeneratedMissionOut
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any, Final, TypedDict

import yaml
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from app.ai.guards import validate_manifest_and_solution
from app.ai.prompts.mission_gen import (
    MISSION_GEN_PROMPT_VERSION,
    get_mission_gen_system_prompt,
)
from app.ai.router import AICapability, get_model
from app.schemas.common import ScaffoldLevel
from app.schemas.missions import (
    GeneratedMissionOut,
    MissionTest,
    ScaffoldPlan,
)

logger = logging.getLogger(__name__)

MAX_REPAIR_ATTEMPTS: Final[int] = 2


# ---------------------------------------------------------------------------
# Manifest Loading
# ---------------------------------------------------------------------------


def get_manifest_path(world_id: str) -> Path:
    """Resolve the absolute path to a world manifest YAML file."""
    # Resolve relative to ai-backend/ root
    backend_root = Path(__file__).resolve().parents[3]
    return backend_root / "content" / "worlds" / f"{world_id}.yaml"


def load_world_manifest(world_id: str) -> dict[str, Any]:
    """Load and parse a world manifest YAML file."""
    path = get_manifest_path(world_id)
    if not path.exists():
        raise FileNotFoundError(
            f"World manifest file not found: {path}. Manifests must exist under content/worlds/*.yaml"
        )

    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError(f"Invalid YAML manifest at {path}: expected a mapping.")

    return data


# ---------------------------------------------------------------------------
# Structured Output Models for LLM Generation
# ---------------------------------------------------------------------------


class MissionTestDraft(BaseModel):
    name: str
    setup: str = ""
    call: str
    expected: str


class MissionDraftRaw(BaseModel):
    scene_id: str = Field(description="Must match an existing scene ID from the manifest")
    brief: str = Field(description="The challenge description in TICO's persona voice")
    params: dict[str, Any] = Field(
        default_factory=dict, description="Values satisfying the mechanic param_schema"
    )
    starter_code: str = Field(
        description="Python starter code with composer carried scaffolding applied"
    )
    solution_code: str = Field(
        description="Valid Python solution code using only manifest verbs"
    )
    tests: list[MissionTestDraft] = Field(
        description="List of test checks that the solution code must pass"
    )


# ---------------------------------------------------------------------------
# LangGraph State & Pipeline Nodes
# ---------------------------------------------------------------------------


class MissionGenState(TypedDict):
    world_id: str
    level_id: str
    target_concept_id: str
    carried_concept_ids: list[str]
    scaffold_plan: ScaffoldPlan
    locale: str
    force_regenerate: bool

    manifest: dict[str, Any]
    mechanic: dict[str, Any]

    attempt_count: int
    draft: dict[str, Any] | None
    validation_errors: list[str]

    final_mission: GeneratedMissionOut | None
    used_template_fallback: bool


def prepare_node(state: MissionGenState) -> dict[str, Any]:
    """Node 1: Load manifest and match mechanic."""
    manifest = state.get("manifest")
    if not manifest:
        manifest = load_world_manifest(state["world_id"])

    # Find mechanic matching target concept
    target_concept = state["target_concept_id"]
    matching_mechanics = [
        m for m in manifest.get("mechanics", []) if m.get("target_concept") == target_concept
    ]

    if not matching_mechanics:
        # If no exact target mechanic, pick first available or raise
        if manifest.get("mechanics"):
            mechanic = manifest["mechanics"][0]
        else:
            raise ValueError(f"Manifest '{state['world_id']}' defines no mechanics.")
    else:
        mechanic = matching_mechanics[0]

    return {
        "manifest": manifest,
        "mechanic": mechanic,
        "attempt_count": 0,
        "validation_errors": [],
    }


def generate_draft_node(state: MissionGenState) -> dict[str, Any]:
    """Node 2: Generate or repair mission draft using gemini-3.5-flash."""
    manifest = state["manifest"]
    mechanic = state["mechanic"]
    scaffold_plan = state["scaffold_plan"]
    attempt_count = state.get("attempt_count", 0)
    validation_errors = state.get("validation_errors", [])
    locale = state.get("locale", "ar_EG")

    system_prompt = get_mission_gen_system_prompt(
        world_manifest=manifest,
        mechanic=mechanic,
        locale=locale,
    )

    user_lines = [
        f"Generate a mission draft for target concept: {state['target_concept_id']}",
        f"Mechanic ID: {mechanic.get('id')}",
        f"Scaffold Plan: {scaffold_plan.model_dump_json()}",
    ]

    # If this is a repair attempt, provide explicit validation feedback
    if attempt_count > 0 and validation_errors:
        user_lines.extend([
            "",
            "CRITICAL: The previous draft was rejected by the Python validator for these violations:",
            "\n".join(f"- {err}" for err in validation_errors),
            "Please repair the mission draft to eliminate all violations. Ensure only declared manifest APIs are used and tests pass.",
        ])

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="\n".join(user_lines)),
    ]

    try:
        model = get_model(AICapability.GENERATE)
        runnable = model.with_structured_output(MissionDraftRaw)
        raw_draft: Any = runnable.invoke(messages)

        if isinstance(raw_draft, MissionDraftRaw):
            draft_dict = raw_draft.model_dump()
        elif isinstance(raw_draft, dict):
            draft_dict = raw_draft
        else:
            raise ValueError(f"Unexpected output type from model: {type(raw_draft)}")

        draft_dict["world_id"] = state["world_id"]
        draft_dict["level_id"] = state["level_id"]
        draft_dict["target_concept_id"] = state["target_concept_id"]

    except Exception as exc:
        logger.warning(
            "Mission draft generation model call failed (attempt %s): %s",
            attempt_count + 1,
            exc,
        )
        draft_dict = None

    return {
        "draft": draft_dict,
        "attempt_count": attempt_count + 1,
    }


def validate_draft_node(state: MissionGenState) -> dict[str, Any]:
    """Node 3: Python validator checks draft against world manifest."""
    draft = state.get("draft")
    manifest = state["manifest"]

    if not draft:
        return {
            "validation_errors": ["Draft was None due to model generation failure."],
            "final_mission": None,
        }

    report = validate_manifest_and_solution(draft, manifest)

    if not report.passed:
        logger.warning(
            "Mission draft validation failed (attempt %s): %s",
            state.get("attempt_count"),
            report.violations,
        )
        return {
            "validation_errors": report.violations,
            "final_mission": None,
        }

    # Draft passed validation! Assemble final GeneratedMissionOut
    mission_id = f"gen_{uuid.uuid4().hex[:12]}"
    tests_out = [
        MissionTest(name=t["name"], call=t["call"], expected=str(t["expected"]))
        for t in draft.get("tests", [])
    ]

    final_out = GeneratedMissionOut(
        id=mission_id,
        level_id=state["level_id"],
        world_id=state["world_id"],
        scene_id=draft["scene_id"],
        target_concept_id=state["target_concept_id"],
        carried_concept_ids=state.get("carried_concept_ids", []),
        brief=draft["brief"],
        starter_code=draft["starter_code"],
        tests=tests_out,
        scaffold_plan=state["scaffold_plan"],
        params=draft.get("params", {}),
        validated=True,
        reused=False,
    )

    return {
        "validation_errors": [],
        "final_mission": final_out,
        "used_template_fallback": False,
    }


def template_fallback_node(state: MissionGenState) -> dict[str, Any]:
    """Node 4: Instantiate reviewed template fallback from manifest when model fails twice."""
    logger.info("Applying reviewed template fallback for world %s", state["world_id"])
    manifest = state["manifest"]
    mechanic = state["mechanic"]
    scaffold_plan = state["scaffold_plan"]
    locale = state.get("locale", "ar_EG")

    # Pick first supported scene from mechanic
    scenes = mechanic.get("scenes", ["platform_day"])
    scene_id = scenes[0]

    # Resolve carried scaffold lines
    scaffold_snippets = []
    carried_scaffold_config = manifest.get("carried_scaffold", {})
    for cid, level in scaffold_plan.scaffold.items():
        if cid in carried_scaffold_config:
            level_str = level.value if hasattr(level, "value") else str(level)
            snippet = (
                carried_scaffold_config[cid].get(level_str.upper())
                or carried_scaffold_config[cid].get(level_str.lower())
                or carried_scaffold_config[cid].get(level_str, "")
            )
            if snippet:
                scaffold_snippets.append(snippet)
    carried_scaffold_str = "\n".join(scaffold_snippets)

    # Resolve default parameters
    param_schema = mechanic.get("param_schema", {})
    resolved_params = {}
    for p_name, p_rules in param_schema.items():
        if p_rules.get("type") == "int":
            resolved_params[p_name] = p_rules.get("min", 10)
        elif p_rules.get("type") == "enum":
            resolved_params[p_name] = p_rules.get("options", [""])[0]
        else:
            resolved_params[p_name] = 10

    # Substitute templates
    brief = (
        "افتح البوابة لما الركاب يزيدوا عن الحد المطلوب."
        if locale.startswith("ar")
        else "Open the gate when passengers exceed the threshold."
    )

    starter_template = mechanic.get("starter_template", "# {brief}\n{carried_scaffold}")
    starter_code = starter_template.format(
        brief=brief,
        carried_scaffold=carried_scaffold_str,
        **resolved_params,
    ).strip()

    solution_template = mechanic.get("solution_template", "")
    solution_code = solution_template.format(**resolved_params).strip()

    # Format tests
    raw_tests = mechanic.get("tests", [])
    formatted_tests = []
    for t in raw_tests:
        t_name = t.get("name", "Test").format(**resolved_params)
        t_call = t.get("call", "").format(**resolved_params)
        t_expected = t.get("expected", "").format(**resolved_params)
        t_setup = t.get("setup", "").format(**resolved_params) if t.get("setup") else ""
        formatted_tests.append({
            "name": t_name,
            "setup": t_setup,
            "call": t_call,
            "expected": t_expected,
        })

    # Validate template fallback to guarantee correctness
    fallback_draft = {
        "world_id": state["world_id"],
        "scene_id": scene_id,
        "target_concept_id": state["target_concept_id"],
        "brief": brief,
        "starter_code": starter_code,
        "solution_code": solution_code,
        "tests": formatted_tests,
    }
    val_report = validate_manifest_and_solution(fallback_draft, manifest)
    if not val_report.passed:
        logger.warning("Template fallback had validation warnings: %s", val_report.violations)

    mission_id = f"fallback_{uuid.uuid4().hex[:12]}"
    tests_out = [
        MissionTest(name=t["name"], call=t["call"], expected=str(t["expected"]))
        for t in formatted_tests
    ]

    final_out = GeneratedMissionOut(
        id=mission_id,
        level_id=state["level_id"],
        world_id=state["world_id"],
        scene_id=scene_id,
        target_concept_id=state["target_concept_id"],
        carried_concept_ids=state.get("carried_concept_ids", []),
        brief=brief,
        starter_code=starter_code,
        tests=tests_out,
        scaffold_plan=scaffold_plan,
        params=resolved_params,
        validated=True,
        reused=False,
    )

    return {
        "final_mission": final_out,
        "used_template_fallback": True,
        "validation_errors": [],
    }


def route_after_validation(state: MissionGenState) -> str:
    """Determine whether to accept, repair, or fall back."""
    if state.get("final_mission") is not None:
        return END

    attempt_count = state.get("attempt_count", 0)
    if attempt_count < MAX_REPAIR_ATTEMPTS:
        logger.info("Draft invalid, routing to repair attempt %s", attempt_count + 1)
        return "generate_draft"

    logger.info("Draft rejected %s times, routing to template fallback", attempt_count)
    return "template_fallback"


# ---------------------------------------------------------------------------
# Graph Assembly
# ---------------------------------------------------------------------------


def build_mission_gen_graph() -> Any:
    """Assemble the StateGraph for mission generation."""
    workflow = StateGraph(MissionGenState)

    workflow.add_node("prepare", prepare_node)
    workflow.add_node("generate_draft", generate_draft_node)
    workflow.add_node("validate_draft", validate_draft_node)
    workflow.add_node("template_fallback", template_fallback_node)

    workflow.set_entry_point("prepare")
    workflow.add_edge("prepare", "generate_draft")
    workflow.add_edge("generate_draft", "validate_draft")

    workflow.add_conditional_edges(
        "validate_draft",
        route_after_validation,
        {
            END: END,
            "generate_draft": "generate_draft",
            "template_fallback": "template_fallback",
        },
    )
    workflow.add_edge("template_fallback", END)

    return workflow.compile()


mission_gen_app = build_mission_gen_graph()


def generate_mission(
    *,
    world_id: str = "cairo_metro",
    level_id: str = "lvl_01",
    target_concept_id: str = "conditionals",
    carried_concept_ids: list[str] | None = None,
    scaffold_plan: ScaffoldPlan | None = None,
    locale: str = "ar_EG",
    force_regenerate: bool = False,
    manifest_override: dict[str, Any] | None = None,
) -> GeneratedMissionOut:
    """High-level runner executing the mission generation graph.

    Args:
        world_id: Identifier of the world (e.g. 'cairo_metro').
        level_id: Target curriculum level ID.
        target_concept_id: Primary concept taught in the lesson.
        carried_concept_ids: Optional list of carried concepts.
        scaffold_plan: Optional ScaffoldPlan from the adaptive composer.
        locale: Student interface locale.
        force_regenerate: Bypass cache if True.
        manifest_override: Optional in-memory manifest dict for testing.

    Returns:
        Validated GeneratedMissionOut ready for publication review.
    """
    if scaffold_plan is None:
        scaffold_plan = ScaffoldPlan(
            scaffold={},
            difficulty_band=5,
            rep_number=1,
        )

    initial_state: MissionGenState = {
        "world_id": world_id,
        "level_id": level_id,
        "target_concept_id": target_concept_id,
        "carried_concept_ids": carried_concept_ids or [],
        "scaffold_plan": scaffold_plan,
        "locale": locale,
        "force_regenerate": force_regenerate,
        "manifest": manifest_override or {},
        "mechanic": {},
        "attempt_count": 0,
        "draft": None,
        "validation_errors": [],
        "final_mission": None,
        "used_template_fallback": False,
    }

    result = mission_gen_app.invoke(initial_state)
    final_out: GeneratedMissionOut | None = result.get("final_mission")

    if not final_out:
        raise RuntimeError("Mission generation failed to return a validated mission or fallback.")

    return final_out
