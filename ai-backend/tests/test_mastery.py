"""Unit tests for mastery calculation domain rule (app.rules.mastery)."""

import ast
import inspect
import pytest

import app.rules.mastery as mastery_module
from app.rules.mastery import (
    BOUNDARY_EPSILON,
    DEFAULT_LEARNING_RATE,
    OUTCOME_CLEAN_PASS,
    OUTCOME_FAILURE,
    OUTCOME_RUNG_1_PASS,
    OUTCOME_RUNG_2_PASS,
    OUTCOME_RUNG_3_PASS,
    OUTCOME_RUNG_4_PASS,
    TARGET_CONCEPT_WEIGHT,
    ConceptMasteryUpdate,
    MasteryProfileUpdateResult,
    calculate_concept_confidence,
    compute_outcome_score,
    compute_single_concept_mastery,
    update_mastery_profile,
)



def test_compute_single_concept_mastery_arithmetic():
    """Verify single concept update matches manual EMA calculations.

    Hand-computed arithmetic checks:
      Case 1 (Target, Clean Pass):
        old = 0.50, outcome = 1.00, weight = 1.0, lr = 0.20
        delta = 0.20 * 1.0 * (1.00 - 0.50) = 0.10
        new = 0.50 + 0.10 = 0.60
      Case 2 (Target, Failure):
        old = 0.80, outcome = 0.00, weight = 1.0, lr = 0.20
        delta = 0.20 * 1.0 * (0.00 - 0.80) = -0.16
        new = 0.80 - 0.16 = 0.64
      Case 3 (Carried Concept, Fractional Weight):
        old = 0.50, outcome = 1.00, weight = 0.40, lr = 0.20
        delta = 0.20 * 0.40 * (1.00 - 0.50) = 0.08 * 0.50 = 0.04
        new = 0.50 + 0.04 = 0.54
      Case 4 (Carried Concept, Partial Pass Outcome):
        old = 0.60, outcome = 0.70, weight = 0.50, lr = 0.20
        delta = 0.20 * 0.50 * (0.70 - 0.60) = 0.10 * 0.10 = 0.01
        new = 0.60 + 0.01 = 0.61
    """
    assert compute_single_concept_mastery(0.50, 1.00, weight=1.0, learning_rate=0.20) == 0.60
    assert compute_single_concept_mastery(0.80, 0.00, weight=1.0, learning_rate=0.20) == 0.64
    assert compute_single_concept_mastery(0.50, 1.00, weight=0.40, learning_rate=0.20) == 0.54
    assert compute_single_concept_mastery(0.60, 0.70, weight=0.50, learning_rate=0.20) == 0.61


def test_compute_single_concept_mastery_clamping():
    """Verify mastery never exceeds 1.0 or drops below 0.0 under repeated or extreme updates."""
    # Repeated clean passes approach 1.0 and snap cleanly to 1.0
    m = 0.95
    for _ in range(50):
        m = compute_single_concept_mastery(m, 1.0, weight=1.0, learning_rate=0.5)
        assert 0.0 <= m <= 1.0
    assert m == 1.0

    # Repeated failures approach 0.0 and snap cleanly to 0.0
    m = 0.10
    for _ in range(50):
        m = compute_single_concept_mastery(m, 0.0, weight=1.0, learning_rate=0.5)
        assert 0.0 <= m <= 1.0
    assert m == 0.0

    # Extreme learning rate 1.0 with max outcome
    assert compute_single_concept_mastery(0.99, 1.0, weight=1.0, learning_rate=1.0) == 1.0
    assert compute_single_concept_mastery(0.01, 0.0, weight=1.0, learning_rate=1.0) == 0.0


def test_compute_single_concept_mastery_boundary_snap_precision():
    """Verify boundary snap only fires within BOUNDARY_EPSILON and does not snap prematurely."""
    # Hand-computed Case 1: Near ceiling but delta stops short of epsilon
    # old = 0.999990, outcome = 1.0, weight = 1.0, lr = 0.10
    # delta = 0.10 * 1.0 * (1.000000 - 0.999990) = 0.10 * 0.000010 = 0.000001
    # raw = 0.999990 + 0.000001 = 0.999991
    # 0.999991 is not within BOUNDARY_EPSILON (1e-6) of 1.0 (1.0 - 1e-6 = 0.999999) -> NOT snapped
    res_ceiling = compute_single_concept_mastery(0.999990, 1.0, weight=1.0, learning_rate=0.10)
    assert res_ceiling == 0.999991
    assert res_ceiling < 1.0

    # Hand-computed Case 2: Near floor but delta stops short of epsilon
    # old = 0.000010, outcome = 0.0, weight = 1.0, lr = 0.10
    # delta = 0.10 * 1.0 * (0.000000 - 0.000010) = -0.000001
    # raw = 0.000010 - 0.000001 = 0.000009
    # 0.000009 is not within BOUNDARY_EPSILON (1e-6) of 0.0 (0.0 + 1e-6 = 0.000001) -> NOT snapped
    res_floor = compute_single_concept_mastery(0.000010, 0.0, weight=1.0, learning_rate=0.10)
    assert res_floor == 0.000009
    assert res_floor > 0.0

    # Hand-computed Case 3: Reaches snap boundary
    # old = 0.999998, outcome = 1.0, weight = 1.0, lr = 0.50
    # delta = 0.50 * 1.0 * (1.0 - 0.999998) = 0.000001
    # raw = 0.999998 + 0.000001 = 0.999999 >= 1.0 - 1e-6 -> snaps to 1.0
    assert compute_single_concept_mastery(0.999998, 1.0, weight=1.0, learning_rate=0.50) == 1.0

    # old = 0.000002, outcome = 0.0, weight = 1.0, lr = 0.50
    # delta = 0.50 * 1.0 * (0.0 - 0.000002) = -0.000001
    # raw = 0.000002 - 0.000001 = 0.000001 <= 0.0 + 1e-6 -> snaps to 0.0
    assert compute_single_concept_mastery(0.000002, 0.0, weight=1.0, learning_rate=0.50) == 0.0


def test_compute_single_concept_mastery_midrange_unaffected_by_snap():
    """Verify mid-range updates produce byte-identical results unaffected by boundary snap."""
    # Standard clean pass from 0.50: 0.50 + 0.20 * 1.0 * (1.0 - 0.5) = 0.60
    assert compute_single_concept_mastery(0.50, 1.00, weight=1.0, learning_rate=0.20) == 0.60

    # Standard failure from 0.80: 0.80 + 0.20 * 1.0 * (0.0 - 0.8) = 0.64
    assert compute_single_concept_mastery(0.80, 0.00, weight=1.0, learning_rate=0.20) == 0.64

    # Carried fractional weight update: 0.50 + 0.20 * 0.40 * (1.0 - 0.5) = 0.54
    assert compute_single_concept_mastery(0.50, 1.00, weight=0.40, learning_rate=0.20) == 0.54

    # Intermediate partial score: 0.60 + 0.20 * 0.50 * (0.70 - 0.60) = 0.61
    assert compute_single_concept_mastery(0.60, 0.70, weight=0.50, learning_rate=0.20) == 0.61



def test_compute_single_concept_mastery_invalid_inputs_raise():
    """Verify out-of-range inputs raise ValueError with descriptive error message."""
    # Invalid old_mastery
    with pytest.raises(ValueError, match="old_mastery must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(-0.01, 1.0)
    with pytest.raises(ValueError, match="old_mastery must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(1.01, 1.0)

    # Invalid outcome
    with pytest.raises(ValueError, match="outcome must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(0.5, -0.1)
    with pytest.raises(ValueError, match="outcome must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(0.5, 1.1)

    # Invalid weight
    with pytest.raises(ValueError, match="weight must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(0.5, 1.0, weight=-0.05)
    with pytest.raises(ValueError, match="weight must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(0.5, 1.0, weight=1.05)

    # Invalid learning_rate
    with pytest.raises(ValueError, match="learning_rate must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(0.5, 1.0, learning_rate=-0.1)
    with pytest.raises(ValueError, match="learning_rate must be in \\[0.0, 1.0\\]"):
        compute_single_concept_mastery(0.5, 1.0, learning_rate=1.5)


def test_compute_outcome_score_monotonicity_and_rungs():
    """Verify outcome mapping decreases monotonically with higher hint ladder rungs."""
    s0 = compute_outcome_score(passed=True, hints_used=0)
    s1 = compute_outcome_score(passed=True, hints_used=1)
    s2 = compute_outcome_score(passed=True, hints_used=2)
    s3 = compute_outcome_score(passed=True, hints_used=3)
    s4 = compute_outcome_score(passed=True, hints_used=4)
    s5 = compute_outcome_score(passed=True, hints_used=5)
    s_fail = compute_outcome_score(passed=False, hints_used=0)

    assert s0 == OUTCOME_CLEAN_PASS == 1.0
    assert s1 == OUTCOME_RUNG_1_PASS == 0.85
    assert s2 == OUTCOME_RUNG_2_PASS == 0.70
    assert s3 == OUTCOME_RUNG_3_PASS == 0.55
    assert s4 == OUTCOME_RUNG_4_PASS == 0.40
    assert s5 == OUTCOME_RUNG_4_PASS == 0.40
    assert s_fail == OUTCOME_FAILURE == 0.0

    # Monotonic decrease: clean pass > rung 1 > rung 2 > rung 3 > rung 4 > failure
    assert s0 > s1 > s2 > s3 > s4 > s_fail

    # Negative hints rejected
    with pytest.raises(ValueError, match="hints_used cannot be negative"):
        compute_outcome_score(passed=True, hints_used=-1)


def test_calculate_concept_confidence_saturation_and_bounds():
    """Verify baseline confidence calculation saturates gracefully toward 0.95 at full weight."""
    c0 = calculate_concept_confidence(0.50, evidence_count=0)
    c1 = calculate_concept_confidence(c0, evidence_count=1)
    c5 = calculate_concept_confidence(c1, evidence_count=5)
    c20 = calculate_concept_confidence(c5, evidence_count=20)
    c100 = calculate_concept_confidence(c20, evidence_count=100)

    assert 0.50 <= c0 <= c1 <= c5 <= c20 <= c100 <= 0.95
    assert c100 == 0.95  # Saturated at MAX_CONFIDENCE


def test_calculate_concept_confidence_weight_scaling():
    """Verify confidence growth scales with concept weight and zero weight yields zero gain."""
    # 1. Higher weight produces strictly higher confidence given same evidence count
    # Hand arithmetic:
    #   weight 1.0, count 5: eff=5.0 -> raw = 1.0 - 0.50/(1.0 + 0.15*5) = 1.0 - 0.50/1.75 = 0.7143
    #   weight 0.2, count 5: eff=1.0 -> raw = 1.0 - 0.50/(1.0 + 0.15*1) = 1.0 - 0.50/1.15 = 0.5652
    c_high = calculate_concept_confidence(0.50, evidence_count=5, weight=1.0)
    c_low = calculate_concept_confidence(0.50, evidence_count=5, weight=0.2)
    assert c_high > c_low > 0.50
    assert c_high == 0.7143
    assert c_low == 0.5652

    # 2. Zero weight contributes no evidence: confidence must not increase from old_confidence
    for old_c in (0.20, 0.50, 0.80):
        assert calculate_concept_confidence(old_c, evidence_count=1, weight=0.0) == old_c
        assert calculate_concept_confidence(old_c, evidence_count=10, weight=0.0) == old_c
        assert calculate_concept_confidence(old_c, evidence_count=100, weight=0.0) == old_c

    # 3. Zero evidence count yields zero gain
    assert calculate_concept_confidence(0.50, evidence_count=0, weight=1.0) == 0.50
    assert calculate_concept_confidence(0.75, evidence_count=0, weight=0.5) == 0.75


def test_update_mastery_profile_proportional_weighting():
    """Verify profile update applies full weight to target and proportional weight/confidence to carried concepts."""
    res = update_mastery_profile(
        target_concept_id="loops",
        target_old_mastery=0.50,
        outcome=1.00,
        carried_concepts={
            "variables": (0.50, 0.80),   # high weight carried
            "output": (0.50, 0.30),      # low weight carried
        },
        target_old_evidence_count=2,
        target_old_confidence=0.60,
        learning_rate=0.20,
    )

    assert isinstance(res, MasteryProfileUpdateResult)
    assert res.target_update.concept_id == "loops"
    assert res.target_update.is_target is True
    assert res.target_update.weight == 1.0
    # Target delta: 0.20 * 1.0 * (1.0 - 0.5) = +0.10 -> 0.60
    assert res.target_update.new_mastery == 0.60
    assert res.target_update.new_evidence_count == 3
    # Target confidence: eff = 3 * 1.0 = 3.0 -> raw = 1.0 - 0.50/(1.0 + 0.15*3) = 0.6552
    assert res.target_update.new_confidence == 0.6552

    # Carried 'variables' delta: 0.20 * 0.80 * 0.50 = +0.08 -> 0.58
    # Carried 'variables' confidence: eff = 1 * 0.80 = 0.80 -> raw = 1.0 - 0.50/(1.0 + 0.15*0.8) = 0.5536
    var_up = res.carried_updates["variables"]
    assert var_up.is_target is False
    assert var_up.weight == 0.80
    assert var_up.new_mastery == 0.58
    assert var_up.new_evidence_count == 1
    assert var_up.new_confidence == 0.5536

    # Carried 'output' delta: 0.20 * 0.30 * 0.50 = +0.03 -> 0.53
    # Carried 'output' confidence: eff = 1 * 0.30 = 0.30 -> raw = 1.0 - 0.50/(1.0 + 0.15*0.3) = 0.5215
    out_up = res.carried_updates["output"]
    assert out_up.is_target is False
    assert out_up.weight == 0.30
    assert out_up.new_mastery == 0.53
    assert out_up.new_evidence_count == 1
    assert out_up.new_confidence == 0.5215

    # Confirm mastery movement ordering: target (w=1.0) > variables (w=0.8) > output (w=0.3)
    assert res.target_update.mastery_delta > var_up.mastery_delta > out_up.mastery_delta > 0

    # Confirm confidence growth ordering: target (w=1.0, cnt=3) > variables (w=0.8, cnt=1) > output (w=0.3, cnt=1) > initial (0.50)
    assert res.target_update.new_confidence > var_up.new_confidence > out_up.new_confidence > 0.50

    # Test mastery_map property
    assert res.mastery_map == {
        "loops": 0.60,
        "variables": 0.58,
        "output": 0.53,
    }


def test_update_mastery_profile_rejects_target_in_carried():
    """Verify update_mastery_profile raises ValueError if target_concept_id appears in carried_concepts."""
    with pytest.raises(ValueError, match="target_concept_id 'loops' cannot also appear in carried_concepts"):
        update_mastery_profile(
            target_concept_id="loops",
            target_old_mastery=0.50,
            outcome=1.00,
            carried_concepts={
                "variables": (0.50, 0.50),
                "loops": (0.50, 0.40),
            },
        )


def test_update_mastery_profile_rejects_non_full_target_weight():
    """Verify target_weight != 1.0 raises ValueError."""
    with pytest.raises(ValueError, match="target concept weight must be 1.0"):
        update_mastery_profile(
            target_concept_id="loops",
            target_old_mastery=0.50,
            outcome=1.00,
            target_weight=0.75,
        )


def test_mastery_pure_python_zero_io():
    """Verify rules/mastery contains zero I/O and no framework imports."""
    source = inspect.getsource(mastery_module)
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
