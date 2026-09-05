"""Unit tests for the adaptive composer domain rule (app.rules.composer)."""

import ast
import inspect
import pytest

import app.rules.composer as composer_module
from app.rules.composer import (
    AdvanceOrHoldDecision,
    ComposerPlanResult,
    advance_or_hold,
    compose,
    compute_difficulty_band,
    compute_scaffold_level,
)
from app.schemas.common import DecidedBy, ScaffoldLevel, SkillBand
from app.schemas.missions import ScaffoldPlan


def test_compute_scaffold_level_thresholds():
    """Verify scaffold level assignment follows pedagogical mastery tiers."""
    # Strong mastery (>= 0.7): FULL
    assert compute_scaffold_level(0.70) == ScaffoldLevel.FULL
    assert compute_scaffold_level(0.95) == ScaffoldLevel.FULL

    # Moderate mastery (0.4 <= m < 0.7): PARTIAL
    assert compute_scaffold_level(0.69) == ScaffoldLevel.PARTIAL
    assert compute_scaffold_level(0.40) == ScaffoldLevel.PARTIAL

    # Shaky / weak mastery (< 0.4): NONE
    assert compute_scaffold_level(0.39) == ScaffoldLevel.NONE
    assert compute_scaffold_level(0.10) == ScaffoldLevel.NONE
    assert compute_scaffold_level(0.00) == ScaffoldLevel.NONE


def test_compute_scaffold_level_arena_never_scaffolds():
    """In challenge arena mode, scaffolding is strictly NONE regardless of mastery."""
    for m in (0.0, 0.4, 0.7, 1.0):
        assert compute_scaffold_level(m, is_arena=True) == ScaffoldLevel.NONE


def test_compute_difficulty_band_bounds_and_adjustments():
    """Verify difficulty band is always an integer between 1 and 10."""
    for band in (SkillBand.STRUGGLING, SkillBand.ON_LEVEL, SkillBand.READY_TO_STRETCH):
        for mastery in (0.1, 0.5, 0.9):
            for attempts in (0, 1, 3):
                diff = compute_difficulty_band(
                    skill_band=band,
                    target_mastery=mastery,
                    prior_attempts=attempts,
                )
                assert isinstance(diff, int)
                assert 1 <= diff <= 10

    # Skill band hierarchy
    diff_struggling = compute_difficulty_band(skill_band=SkillBand.STRUGGLING, target_mastery=0.5)
    diff_on_level = compute_difficulty_band(skill_band=SkillBand.ON_LEVEL, target_mastery=0.5)
    diff_stretch = compute_difficulty_band(skill_band=SkillBand.READY_TO_STRETCH, target_mastery=0.5)
    assert diff_struggling < diff_on_level < diff_stretch

    # Repeated attempts ease difficulty
    diff_att0 = compute_difficulty_band(skill_band=SkillBand.ON_LEVEL, prior_attempts=0)
    diff_att2 = compute_difficulty_band(skill_band=SkillBand.ON_LEVEL, prior_attempts=2)
    assert diff_att2 < diff_att0

    # Arena mode sets high difficulty (min 7)
    diff_arena = compute_difficulty_band(is_arena=True, target_mastery=0.5)
    assert diff_arena >= 7


def test_compose_normal_flow_and_scaffold_plan_validity():
    """Verify compose returns a valid Pydantic ScaffoldPlan and expected assignments."""
    result = compose(
        target_concept_id="conditionals",
        carried_concept_ids=["variables", "output"],
        carried_concept_masteries={"variables": 0.85, "output": 0.50},
        target_concept_mastery=0.30,
        prior_attempts=0,
        skill_band=SkillBand.ON_LEVEL,
    )

    assert isinstance(result, ComposerPlanResult)
    assert isinstance(result.scaffold_plan, ScaffoldPlan)
    assert result.scaffold_plan.rep_number == 1
    assert result.scaffold_plan.scaffold["variables"] == ScaffoldLevel.FULL
    assert result.scaffold_plan.scaffold["output"] == ScaffoldLevel.PARTIAL
    assert result.has_conflict is False
    assert result.confidence >= 0.85


def test_compose_sanity_weak_carried_never_scaffolded_away():
    """Composer sanity invariant: weak carried concept is never assigned FULL scaffolding."""
    result = compose(
        target_concept_id="conditionals",
        carried_concept_ids=["variables"],
        carried_concept_masteries={"variables": 0.20},  # weak carried
        target_concept_mastery=0.10,
    )

    assert result.scaffold_plan.scaffold["variables"] != ScaffoldLevel.FULL
    assert result.scaffold_plan.scaffold["variables"] == ScaffoldLevel.NONE


def test_compose_flags_conflict_on_contradictory_profile():
    """Verify compose flags conflict when learner skill band conflicts with mastery evidence."""
    # Advanced band student with multiple shaky carried concepts
    result_stretch = compose(
        target_concept_id="loops",
        carried_concept_ids=["variables", "conditionals"],
        carried_concept_masteries={"variables": 0.15, "conditionals": 0.25},
        skill_band=SkillBand.READY_TO_STRETCH,
    )
    assert result_stretch.has_conflict is True
    assert result_stretch.conflict_type == "ADVANCED_BAND_WEAK_CARRIED"
    assert result_stretch.confidence < 0.6

    # Struggling band student with already high mastery on target
    result_struggling = compose(
        target_concept_id="variables",
        carried_concept_ids=[],
        target_concept_mastery=0.90,
        skill_band=SkillBand.STRUGGLING,
    )
    assert result_struggling.has_conflict is True
    assert result_struggling.conflict_type == "STRUGGLING_BAND_HIGH_TARGET"
    assert result_struggling.confidence < 0.6


def test_advance_or_hold_clear_cut_cases():
    """Clear-cut pass and hold cases require no model review (has_conflict = False)."""
    # Decisive pass: mastery 0.85, 0 hints, 1 attempt
    pass_decision = advance_or_hold(
        target_mastery=0.85,
        hints_used=0,
        attempt_number=1,
    )
    assert pass_decision.advanced is True
    assert pass_decision.decided_by == DecidedBy.RULE
    assert pass_decision.has_conflict is False
    assert pass_decision.confidence >= 0.85
    assert pass_decision.conflict_type is None

    # Decisive hold: mastery 0.35, 2 hints, 2 attempts
    hold_decision = advance_or_hold(
        target_mastery=0.35,
        hints_used=2,
        attempt_number=2,
    )
    assert hold_decision.advanced is False
    assert hold_decision.decided_by == DecidedBy.RULE
    assert hold_decision.has_conflict is False
    assert hold_decision.confidence >= 0.85


def test_advance_or_hold_conflicting_cases_flagged_for_escalation():
    """Verify that conflicting evidence cases are flagged for escalation review."""
    # Conflict 1: High mastery but leaned on every hint
    c1 = advance_or_hold(
        target_mastery=0.80,
        hints_used=3,
        attempt_number=1,
    )
    assert c1.has_conflict is True
    assert c1.conflict_type == "HIGH_MASTERY_HEAVY_HINTS"
    assert c1.confidence < 0.6

    # Conflict 2: Moderate mastery, clean first-attempt solve with 0 hints
    c2 = advance_or_hold(
        target_mastery=0.60,
        hints_used=0,
        attempt_number=1,
    )
    assert c2.has_conflict is True
    assert c2.conflict_type == "MODERATE_MASTERY_CLEAN_PASS"
    assert c2.confidence < 0.6

    # Conflict 3: High mastery but required 3+ attempts
    c3 = advance_or_hold(
        target_mastery=0.75,
        hints_used=1,
        attempt_number=3,
    )
    assert c3.has_conflict is True
    assert c3.conflict_type == "HIGH_MASTERY_MANY_ATTEMPTS"
    assert c3.confidence < 0.6

    # Conflict 4: Borderline mastery with low evidence confidence
    c4 = advance_or_hold(
        target_mastery=0.71,
        hints_used=1,
        attempt_number=1,
        evidence_confidence=0.35,
    )
    assert c4.has_conflict is True
    assert c4.conflict_type == "BORDERLINE_LOW_CONFIDENCE"
    assert c4.confidence < 0.6


def test_composer_pure_python_zero_io():
    """Verify rules/composer contains zero I/O and no framework imports."""
    source = inspect.getsource(composer_module)
    tree = ast.parse(source)

    forbidden = (
        "langchain",
        "sqlalchemy",
        "httpx",
        "requests",
        "psycopg",
        "urllib",
        "aiohttp",
        "fastapi",
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                for f in forbidden:
                    assert not alias.name.startswith(f), f"Forbidden import: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                for f in forbidden:
                    assert not node.module.startswith(f), f"Forbidden import: {node.module}"
