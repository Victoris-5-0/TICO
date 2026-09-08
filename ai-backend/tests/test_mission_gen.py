"""Unit tests for LangGraph mission generation pipeline (app.ai.graphs.mission_gen)."""

import copy
from unittest.mock import MagicMock, patch
import signal

import pytest

from app.ai.graphs.mission_gen import (
    MissionDraftRaw,
    MissionTestDraft,
    TemplateFallbackValidationError,
    generate_mission,
    load_world_manifest,
)
from app.ai.router import AICapability
from app.schemas.common import ScaffoldLevel
from app.schemas.missions import GeneratedMissionOut, ScaffoldPlan

#: Their execution sandbox is SIGALRM-based and fail-closed — no timer, no execution — so
#: every test below that actually runs a solution is Unix-only. See `execution_timeout` in
#: the LEGACY section of `app/ai/guards.py`.
requires_sigalrm = pytest.mark.skipif(
    not hasattr(signal, "SIGALRM"),
    reason="the manifest sandbox needs SIGALRM to guarantee a timeout; it refuses to run without one",
)


def test_load_world_manifest_cairo_metro():
    """Verify loading real world manifest from content/worlds/cairo_metro.yaml."""
    manifest = load_world_manifest("cairo_metro")
    assert manifest["world"]["id"] == "cairo_metro"
    assert len(manifest["scenes"]) >= 3
    assert len(manifest["props"]) >= 4
    assert len(manifest["mechanics"]) >= 2


def test_load_world_manifest_non_existent_raises():
    """Verify loading unknown manifest raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError, match="not found"):
        load_world_manifest("non_existent_world_xyz")


@requires_sigalrm
def test_mission_gen_first_attempt_valid_flow():
    """Model generates valid draft on first attempt; graph immediately validates and returns."""
    valid_draft = MissionDraftRaw(
        scene_id="platform_day",
        brief="الرصيف زحمة يا بطل، افتح الباب لما عدد الركاب يزيد عن 30",
        params={"reading": "station.passengers", "threshold": 30, "comparison": ">"},
        starter_code="waiting = station.passengers\n# TODO: open gate if waiting > 30",
        solution_code="waiting = station.passengers\nif waiting > 30:\n    gate.open()",
        tests=[
            MissionTestDraft(
                name="gate opens above threshold",
                setup="station.passengers = 35",
                call="gate.state",
                expected="open",
            ),
            MissionTestDraft(
                name="gate shut below threshold",
                setup="station.passengers = 25",
                call="gate.state",
                expected="closed",
            ),
        ],
    )

    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = valid_draft

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.graphs.mission_gen.get_model", return_value=mock_model):
        mission = generate_mission(
            world_id="cairo_metro",
            level_id="lvl_04_conditionals",
            target_concept_id="conditionals",
            carried_concept_ids=["variables"],
            scaffold_plan=ScaffoldPlan(
                scaffold={"variables": ScaffoldLevel.FULL},
                difficulty_band=5,
                rep_number=1,
            ),
        )

        assert isinstance(mission, GeneratedMissionOut)
        assert mission.validated is True
        assert mission.scene_id == "platform_day"
        assert mission.target_concept_id == "conditionals"
        assert len(mission.tests) == 2
        assert mock_runnable.invoke.call_count == 1


@requires_sigalrm
def test_mission_gen_repair_loop_succeeds_on_second_attempt():
    """Model produces invalid draft on first attempt, then repairs it on second attempt."""
    # First attempt has an illegal invented verb `gate.unlock()`
    invalid_draft = MissionDraftRaw(
        scene_id="platform_day",
        brief="Open gate",
        params={},
        starter_code="",
        solution_code="gate.unlock()",  # ILLEGAL VERB!
        tests=[
            MissionTestDraft(
                name="test",
                call="gate.state",
                expected="open",
            )
        ],
    )

    # Second attempt repairs the verb to `gate.open()`
    repaired_draft = MissionDraftRaw(
        scene_id="platform_day",
        brief="Open gate properly",
        params={"reading": "station.passengers", "threshold": 30, "comparison": ">"},
        starter_code="waiting = station.passengers",
        solution_code="waiting = station.passengers\nif waiting > 30:\n    gate.open()",
        tests=[
            MissionTestDraft(
                name="test_open",
                setup="station.passengers = 40",
                call="gate.state",
                expected="open",
            )
        ],
    )

    mock_runnable = MagicMock()
    mock_runnable.invoke.side_effect = [invalid_draft, repaired_draft]

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.graphs.mission_gen.get_model", return_value=mock_model):
        mission = generate_mission(
            world_id="cairo_metro",
            level_id="lvl_04_conditionals",
            target_concept_id="conditionals",
        )

        assert isinstance(mission, GeneratedMissionOut)
        assert mission.validated is True
        assert mock_runnable.invoke.call_count == 2
        # Check that second call included validation error feedback
        second_call_messages = mock_runnable.invoke.call_args_list[1][0][0]
        user_msg = second_call_messages[1].content
        assert "CRITICAL: The previous draft was rejected" in user_msg
        assert "illegal API call" in user_msg


@requires_sigalrm
def test_mission_gen_falls_back_to_template_after_two_failed_attempts():
    """When both generation attempts fail, pipeline falls back to reviewed template default."""
    # Invalid draft that fails validation every time
    stubbornly_invalid_draft = MissionDraftRaw(
        scene_id="platform_day",
        brief="Bad draft",
        params={},
        starter_code="",
        solution_code="station.teleport()",  # Not in manifest!
        tests=[],
    )

    mock_runnable = MagicMock()
    mock_runnable.invoke.side_effect = [
        stubbornly_invalid_draft,
        stubbornly_invalid_draft,
    ]

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.graphs.mission_gen.get_model", return_value=mock_model):
        mission = generate_mission(
            world_id="cairo_metro",
            level_id="lvl_04_conditionals",
            target_concept_id="conditionals",
            scaffold_plan=ScaffoldPlan(
                scaffold={"variables": ScaffoldLevel.FULL},
                difficulty_band=4,
                rep_number=1,
            ),
        )

        assert isinstance(mission, GeneratedMissionOut)
        assert mission.validated is True
        assert "fallback" in mission.id
        assert mission.scene_id in ["platform_day", "ticket_hall"]
        # Starter code must contain the substituted scaffold line
        assert "waiting = station.passengers" in mission.starter_code
        assert len(mission.tests) >= 1
        assert mock_runnable.invoke.call_count == 2



@pytest.fixture
def inconsistent_manifest():
    """Manifest fixture where a mechanic's solution fails its own tests."""
    manifest = copy.deepcopy(load_world_manifest("cairo_metro"))
    for mechanic in manifest["mechanics"]:
        if mechanic.get("target_concept") == "conditionals":
            # Broken template: does not perform the required gate.open()
            mechanic["solution_template"] = "pass"
    return manifest


def test_mission_gen_raises_when_template_fallback_fails_validation(inconsistent_manifest):
    """When generation fails twice and fallback fails validation, pipeline raises TemplateFallbackValidationError."""
    stubbornly_invalid_draft = MissionDraftRaw(
        scene_id="platform_day",
        brief="Bad draft",
        params={},
        starter_code="",
        solution_code="station.teleport()",  # Not in manifest
        tests=[],
    )

    mock_runnable = MagicMock()
    mock_runnable.invoke.side_effect = [
        stubbornly_invalid_draft,
        stubbornly_invalid_draft,
    ]

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.graphs.mission_gen.get_model", return_value=mock_model):
        with pytest.raises(
            TemplateFallbackValidationError, match="conditional_gate"
        ) as exc_info:
            generate_mission(
                world_id="cairo_metro",
                level_id="lvl_04_conditionals",
                target_concept_id="conditionals",
                manifest_override=inconsistent_manifest,
            )

        err_msg = str(exc_info.value)
        assert "cairo_metro" in err_msg
        assert "conditional_gate" in err_msg
        assert "failed validation" in err_msg

