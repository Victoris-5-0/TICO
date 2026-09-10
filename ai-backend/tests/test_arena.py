"""Unit tests for challenge arena concept selection (app.rules.arena).

Strictly pure Python: zero I/O, zero database access, zero network calls.
Tests assert eligibility filtering, ascending-mastery weighting, deterministic tie-breaking,
exception handling, threshold equivalence with composer.py, and AST-level import purity.
"""

import ast
import inspect

import pytest

import app.rules.arena as arena_module
from app.rules.arena import (
    ArenaSelectionResult,
    InsufficientMasteredConceptsError,
    prepare_arena_composition_args,
    select_arena_concepts,
)
from app.rules.composer import compose
from app.rules.mastery import MASTERY_THRESHOLD
from app.schemas.common import ScaffoldLevel, SkillBand


def test_arena_below_threshold_never_eligible():
    """Verify concepts below MASTERY_THRESHOLD are never selected into the arena."""
    mastery_map = {
        "variables": 0.95,       # Eligible
        "conditionals": 0.85,    # Eligible
        "while_loops": MASTERY_THRESHOLD - 0.01,  # Ineligible, just under the bar
        "for_loops": 0.40,       # Ineligible
        "functions": 0.15,       # Ineligible
    }

    result = select_arena_concepts(mastery_map, count=2)

    assert result.eligible_concept_count == 2
    assert "while_loops" not in result.selected_concept_ids
    assert "for_loops" not in result.selected_concept_ids
    assert "functions" not in result.selected_concept_ids
    assert result.selected_concept_ids == ["conditionals", "variables"]


def test_arena_weighted_ascending_order_hand_computed():
    """Verify weakest-mastered concepts are prioritized to stretch the learner.

    Hand-computed test case:
      Threshold: MASTERY_THRESHOLD
      Concepts:
        - variables:    0.77  (Weakest mastered -> closest to threshold -> highest stretch)
        - conditionals: 0.85  (Moderately mastered)
        - loops:        0.99  (Rock-solid mastered -> lowest stretch)
      Expected ascending order: ['variables', 'conditionals', 'loops']
      With count=2:
        - selected_concept_ids: ['variables', 'conditionals']
        - target_concept_id: 'variables'
        - carried_concept_ids: ['conditionals']
    """
    mastery_map = {
        "loops": 0.99,
        "variables": 0.77,
        "conditionals": 0.85,
    }

    result = select_arena_concepts(mastery_map, count=2)

    assert result.selected_concept_ids == ["variables", "conditionals"]
    assert result.target_concept_id == "variables"
    assert result.carried_concept_ids == ["conditionals"]
    assert result.concept_masteries == {"variables": 0.77, "conditionals": 0.85}
    assert "variables" in result.reason
    assert "0.77" in result.reason


def test_arena_exact_tie_deterministic_alphabetical():
    """Verify exact mastery ties are broken deterministically by concept_id alphabetically."""
    # Both concepts have identical mastery 0.80
    mastery_map_1 = {
        "while_loops": 0.80,
        "for_loops": 0.80,
    }
    # Reverse dictionary insertion order to verify independence of dict order
    mastery_map_2 = {
        "for_loops": 0.80,
        "while_loops": 0.80,
    }

    res1 = select_arena_concepts(mastery_map_1, count=2)
    res2 = select_arena_concepts(mastery_map_2, count=2)

    # 'for_loops' < 'while_loops' alphabetically
    assert res1.selected_concept_ids == ["for_loops", "while_loops"]
    assert res2.selected_concept_ids == ["for_loops", "while_loops"]
    assert res1.target_concept_id == "for_loops"
    assert res1.carried_concept_ids == ["while_loops"]


def test_arena_insufficient_mastered_concepts_raises_error():
    """Verify InsufficientMasteredConceptsError is raised when eligible count < required count."""
    mastery_map = {
        "variables": 0.85,    # 1 eligible
        "conditionals": 0.50, # ineligible
    }

    with pytest.raises(InsufficientMasteredConceptsError) as exc_info:
        select_arena_concepts(mastery_map, count=2)

    assert "required 2" in str(exc_info.value)
    assert "learner only has 1" in str(exc_info.value)
    assert issubclass(InsufficientMasteredConceptsError, ValueError)


def test_arena_invalid_count_raises_value_error():
    """Verify non-positive count raises ValueError."""
    with pytest.raises(ValueError, match="at least 1"):
        select_arena_concepts({"variables": 0.9}, count=0)

    with pytest.raises(ValueError, match="at least 1"):
        select_arena_concepts({"variables": 0.9}, count=-1)


def test_arena_entry_uses_the_one_mastery_threshold():
    """Verify arena.py uses exact same threshold constant as composer.py without drift."""
    # 1. Assert arena default threshold is strictly composer's constant
    assert arena_module.MASTERY_THRESHOLD == MASTERY_THRESHOLD

    # Not a literal. Arena entry asks "has this student mastered the concept?" — the same
    # question the gate, the mission picker and the debrief ask — so it must be the same
    # number. It used to borrow composer.STRONG_MASTERY_THRESHOLD (0.70), a *scaffolding*
    # threshold, and let students in on concepts the roadmap had not finished teaching.
    from app.rules.composer import GATE_MASTERY_THRESHOLD

    assert MASTERY_THRESHOLD == GATE_MASTERY_THRESHOLD

    # 2. Test exact boundary condition
    boundary_mastery_map = {
        "at_boundary": MASTERY_THRESHOLD,
        "below_boundary": round(MASTERY_THRESHOLD - 0.001, 4),
    }

    res = select_arena_concepts(boundary_mastery_map, count=1)
    assert res.selected_concept_ids == ["at_boundary"]
    assert "below_boundary" not in res.selected_concept_ids


def test_arena_prepare_composition_args_integrates_with_composer():
    """Verify output of arena selection cleanly feeds into composer.compose(is_arena=True)."""
    mastery_map = {
        "variables": 0.90,
        "conditionals": 0.78,
        "loops": 0.85,
    }

    selection = select_arena_concepts(mastery_map, count=3)
    compose_args = prepare_arena_composition_args(
        selection,
        prior_attempts=1,
        skill_band=SkillBand.READY_TO_STRETCH,
    )

    # Feed directly to composer.compose without modification
    plan_result = compose(**compose_args)

    assert plan_result.scaffold_plan.rep_number == 2
    # In arena mode, composer enforces NONE scaffolding across all carried concepts
    for cid in selection.carried_concept_ids:
        assert plan_result.scaffold_plan.scaffold[cid] == ScaffoldLevel.NONE
    # In arena mode, difficulty band is elevated (8 + int(0.78 * 2) = 9)
    assert plan_result.scaffold_plan.difficulty_band == 9


def test_arena_pure_python_zero_io():
    """Verify rules/arena contains zero I/O and no external framework imports."""
    source = inspect.getsource(arena_module)
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
