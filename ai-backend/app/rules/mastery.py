"""The mastery calculation domain rule (M1 — P0 / M4).

Pure Python, zero I/O, zero DB, zero LangChain imports.

Pedagogical and architectural contract (AGENTS.md, docs/02, docs/08):
  - "Mastery numbers are the exception — always Python, never a model."
  - "The target receives full configured weight (1.0); carried concepts receive
    fractional lesson weights (0.0..1.0)."
  - "Formula, thresholds, decay, and evidence requirements are versioned
    deterministic configuration."
  - Deterministic calculations update:
      1. Target concept mastery at full weight (1.0).
      2. Carried concepts mastery at their respective lesson weights.
      3. Evidence counts and bounded, weight-scaled confidence scores.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# Target concept weight is 1.0 per curriculum specification
# (docs/02-python-curriculum.md: "The target receives full configured weight;
# carried concepts receive fractional lesson weights").
TARGET_CONCEPT_WEIGHT: Final[float] = 1.0

# Boundary saturation snap epsilon: in an asymptotic EMA, floating-point rounding
# creates a fixed-point attractor near 1.0 (e.g. 0.999999 + 0.5 * 1e-6 rounds down
# to 0.999999 in IEEE 754 float). When within rounding epsilon of 1.0 or 0.0, snap
# to the exact boundary so sustained mastery or failure reaches full 1.0 / 0.0.
BOUNDARY_EPSILON: Final[float] = 1e-6


# NEEDS DECISION: The mastery update formula (exponential moving average) and default
# learning rate (0.20) are uncalibrated implementation defaults. Docs (docs/02
# and docs/12-roadmap-and-agent-playbook.md) specify that formula, thresholds,
# decay, and evidence requirements are "versioned deterministic configuration"
# to be calibrated against student performance telemetry during pilot testing.
DEFAULT_LEARNING_RATE: Final[float] = 0.20

# NEEDS DECISION: Outcome mapping values by hint count / rung reached before solving
# are implementation heuristics mapped to the 4-rung progressive disclosure hint ladder
# (rules/hint_ladder.py). They are not yet empirically calibrated.
#: Where "this student has mastered this concept" begins. **One number, one question.**
#:
#: It used to be four. `missions.MASTERY_THRESHOLD` was 0.75, `GATE_MASTERY_THRESHOLD`
#: 0.70, `sessions.MASTERY_THRESHOLD` 0.80 and arena eligibility 0.70 — so a student at
#: 0.72 was told they had advanced, was offered the arena, and was handed the same concept
#: again while the debrief stayed silent. Everything that asks "has he got it?" imports
#: this.
#:
#: Distinct from WEAK_/STRONG_MASTERY_THRESHOLD in `rules/composer.py`, which answer a
#: different question — how much scaffolding this mission should carry — and are allowed
#: to sit elsewhere on the scale.
MASTERY_THRESHOLD: Final[float] = 0.75

# Evidence a *passing* session contributes. These are the target of an exponential moving
# average, which means they are also the ceiling it converges to — so every one of them
# must sit above MASTERY_THRESHOLD or the student can never reach it.
#
# They did not. 2 hints scored 0.70 and 3 scored 0.55, so a student who leaned on hints
# converged below every gate and stayed on one concept forever, however many missions they
# solved. Hints now cost *reps*, not the ceiling: 6 clean solves reach the threshold, about
# 12 do if every hint is used.
OUTCOME_CLEAN_PASS: Final[float] = 1.00     # 0 hints used (clean solve)
OUTCOME_RUNG_1_PASS: Final[float] = 0.95    # 1 hint (Rung 1: ORIENT)
OUTCOME_RUNG_2_PASS: Final[float] = 0.90    # 2 hints (Rung 2: QUESTION)
OUTCOME_RUNG_3_PASS: Final[float] = 0.85    # 3 hints (Rung 3: NAME_IT)
OUTCOME_RUNG_4_PASS: Final[float] = 0.80    # 4+ hints (Rung 4: WALK)

#: Failing still drags hard, and is what keeps the number meaningful: the signal that
#: separates students is pass-versus-fail, and the hint count only sets the pace.
OUTCOME_FAILURE: Final[float] = 0.00        # Mission failed / unpassed

# Confidence calculation bounds and defaults
DEFAULT_INITIAL_CONFIDENCE: Final[float] = 0.50
MAX_CONFIDENCE: Final[float] = 0.95


@dataclass(frozen=True, slots=True)
class ConceptMasteryUpdate:
    """Individual concept mastery calculation outcome."""

    concept_id: str
    old_mastery: float
    new_mastery: float
    mastery_delta: float
    old_confidence: float
    new_confidence: float
    old_evidence_count: int
    new_evidence_count: int
    weight: float
    is_target: bool


@dataclass(frozen=True, slots=True)
class MasteryProfileUpdateResult:
    """Complete multi-concept mastery update result for a mission session."""

    target_update: ConceptMasteryUpdate
    carried_updates: dict[str, ConceptMasteryUpdate]
    all_updates: dict[str, ConceptMasteryUpdate]
    outcome: float

    @property
    def mastery_map(self) -> dict[str, float]:
        """Mapping of concept_id to newly computed mastery score."""
        return {cid: u.new_mastery for cid, u in self.all_updates.items()}


def compute_outcome_score(*, passed: bool, hints_used: int = 0) -> float:
    """Map mission completion status and hint usage to a normalized evidence signal in [0.0, 1.0].

    Pedagogical design:
      - Clean solve with 0 hints represents full mastery evidence (1.0).
      - Passing with hint support yields slightly less, decaying with the rung reached:
          - 1 hint  (Rung 1 ORIENT): 0.95
          - 2 hints (Rung 2 QUESTION): 0.90
          - 3 hints (Rung 3 NAME_IT): 0.85
          - 4+ hints (Rung 4 WALK): 0.80
      - Failure or abandonment yields 0.0.

      Every passing value sits above MASTERY_THRESHOLD on purpose. This score is the target
      of an EMA and therefore its ceiling, so a passing score below the threshold means a
      student who keeps passing can never cross it. That was the old behaviour: two hints
      scored 0.70 and converged on 0.70 exactly. Asking for help should cost repetitions,
      not the possibility of finishing.

    Args:
        passed: True if student passed the mission tests, False otherwise.
        hints_used: Non-negative count of hints requested during the session.

    Returns:
        Float score in [0.0, 1.0].

    Raises:
        ValueError: If hints_used is negative.
    """
    if hints_used < 0:
        raise ValueError(f"hints_used cannot be negative, got {hints_used}")

    if not passed:
        return OUTCOME_FAILURE

    if hints_used == 0:
        return OUTCOME_CLEAN_PASS
    if hints_used == 1:
        return OUTCOME_RUNG_1_PASS
    if hints_used == 2:
        return OUTCOME_RUNG_2_PASS
    if hints_used == 3:
        return OUTCOME_RUNG_3_PASS
    return OUTCOME_RUNG_4_PASS


def calculate_concept_confidence(
    old_confidence: float,
    *,
    evidence_count: int,
    weight: float = TARGET_CONCEPT_WEIGHT,
) -> float:
    """Calculate updated confidence score based on accumulated evidence count and update weight.

    NEEDS DECISION: Both the base saturation curve and the weight interaction are uncalibrated heuristics:
      effective_evidence = evidence_count * weight
      raw_confidence = 1.0 - (0.50 / (1.0 + 0.15 * effective_evidence))
    - When weight == 0.0 or evidence_count == 0, confidence does not increase from old_confidence.
    - Low-weight carried concepts gain confidence proportionally slower than high-weight target concepts.
    - For target concepts (weight == 1.0), effective_evidence == evidence_count (standard baseline curve).
    - Confidence increases monotonically with validated evidence up to MAX_CONFIDENCE (0.95).
    """
    if not (0.0 <= old_confidence <= 1.0):
        raise ValueError(f"old_confidence must be in [0.0, 1.0], got {old_confidence}")
    if evidence_count < 0:
        raise ValueError(f"evidence_count cannot be negative, got {evidence_count}")
    if not (0.0 <= weight <= 1.0):
        raise ValueError(f"weight must be in [0.0, 1.0], got {weight}")

    if weight == 0.0 or evidence_count == 0:
        return old_confidence

    # Scale evidence accumulation by lesson concept weight
    effective_evidence = evidence_count * weight
    raw_confidence = 1.0 - (0.50 / (1.0 + 0.15 * effective_evidence))
    return min(MAX_CONFIDENCE, max(old_confidence, round(raw_confidence, 4)))


def compute_single_concept_mastery(
    old_mastery: float,
    outcome: float,
    *,
    weight: float = TARGET_CONCEPT_WEIGHT,
    learning_rate: float = DEFAULT_LEARNING_RATE,
) -> float:
    """Compute updated mastery for a single concept using an exponential moving average update.

    Formula:
      new_mastery = old_mastery + learning_rate * weight * (outcome - old_mastery)
      clamped to [0.0, 1.0].

    Args:
        old_mastery: Current mastery in [0.0, 1.0].
        outcome: Evidence signal in [0.0, 1.0] (from compute_outcome_score).
        weight: Concept weight in [0.0, 1.0] (1.0 for target concept, fractional for carried).
        learning_rate: Learning rate factor in [0.0, 1.0] controlling update step size.

    Returns:
        Updated mastery score clamped to [0.0, 1.0].

    Raises:
        ValueError: If old_mastery, outcome, weight, or learning_rate is outside [0.0, 1.0].
    """
    if not (0.0 <= old_mastery <= 1.0):
        raise ValueError(f"old_mastery must be in [0.0, 1.0], got {old_mastery}")
    if not (0.0 <= outcome <= 1.0):
        raise ValueError(f"outcome must be in [0.0, 1.0], got {outcome}")
    if not (0.0 <= weight <= 1.0):
        raise ValueError(f"weight must be in [0.0, 1.0], got {weight}")
    if not (0.0 <= learning_rate <= 1.0):
        raise ValueError(f"learning_rate must be in [0.0, 1.0], got {learning_rate}")

    delta = learning_rate * weight * (outcome - old_mastery)
    raw_new_mastery = old_mastery + delta
    rounded = round(raw_new_mastery, 6)

    # Boundary saturation snap: In an asymptotic EMA with discrete floating-point
    # rounding, values approaching 1.0 can enter a fixed-point attractor (e.g.
    # 0.999999 + 0.5 * 1e-6 = 0.999999499... which rounds down to 0.999999 in
    # IEEE 754 float). Snapping within BOUNDARY_EPSILON allows sustained clean
    # passes to reach full mastery (1.0) and mirrors the 0.0 floor behavior.
    if rounded >= 1.0 - BOUNDARY_EPSILON:
        return 1.0
    if rounded <= 0.0 + BOUNDARY_EPSILON:
        return 0.0

    return max(0.0, min(1.0, rounded))



def update_mastery_profile(
    *,
    target_concept_id: str,
    target_old_mastery: float,
    outcome: float,
    carried_concepts: dict[str, tuple[float, float]] | None = None,
    target_old_confidence: float = DEFAULT_INITIAL_CONFIDENCE,
    target_old_evidence_count: int = 0,
    carried_old_confidences: dict[str, float] | None = None,
    carried_old_evidence_counts: dict[str, int] | None = None,
    target_weight: float = TARGET_CONCEPT_WEIGHT,
    learning_rate: float = DEFAULT_LEARNING_RATE,
) -> MasteryProfileUpdateResult:
    """Update student mastery profile across target concept and all carried concepts in one pass.

    Hard invariants:
      - Target concept must use full weight (target_weight == TARGET_CONCEPT_WEIGHT == 1.0).
      - Target concept ID must not appear in carried_concepts.
      - Carried concepts move proportionally to their configured lesson weights.
      - Carried concepts confidence scales with configured weight.
      - All resulting masteries strictly clamped to [0.0, 1.0].

    Args:
        target_concept_id: The primary concept tested in this lesson.
        target_old_mastery: Current student mastery on target concept.
        outcome: Normalized session outcome score in [0.0, 1.0].
        carried_concepts: Optional mapping of carried concept_id to (old_mastery, weight) tuples.
        target_old_confidence: Prior confidence score for target concept.
        target_old_evidence_count: Prior evidence count for target concept.
        carried_old_confidences: Optional mapping of carried concept_id to prior confidence score.
        carried_old_evidence_counts: Optional mapping of carried concept_id to prior evidence count.
        target_weight: Weight for target concept (strictly 1.0).
        learning_rate: Learning rate factor for the EMA update.

    Returns:
        MasteryProfileUpdateResult containing target update, carried updates, and combined map.

    Raises:
        ValueError: If target_weight != 1.0, target_concept_id is in carried_concepts, or inputs invalid.
    """
    if target_weight != TARGET_CONCEPT_WEIGHT:
        raise ValueError(
            f"target concept weight must be {TARGET_CONCEPT_WEIGHT}, got {target_weight}. "
            "Target concepts must always receive full configured weight per curriculum contract."
        )

    carried_map = carried_concepts or {}
    if target_concept_id in carried_map:
        raise ValueError(
            f"target_concept_id '{target_concept_id}' cannot also appear in carried_concepts: "
            "target concepts are updated at full weight and must not be treated as carried concepts."
        )

    confidences = carried_old_confidences or {}
    counts = carried_old_evidence_counts or {}

    # 1. Update target concept (full weight)
    target_new_mastery = compute_single_concept_mastery(
        target_old_mastery,
        outcome,
        weight=TARGET_CONCEPT_WEIGHT,
        learning_rate=learning_rate,
    )
    target_new_count = target_old_evidence_count + 1
    target_new_confidence = calculate_concept_confidence(
        target_old_confidence,
        evidence_count=target_new_count,
        weight=TARGET_CONCEPT_WEIGHT,
    )

    target_update = ConceptMasteryUpdate(
        concept_id=target_concept_id,
        old_mastery=target_old_mastery,
        new_mastery=target_new_mastery,
        mastery_delta=round(target_new_mastery - target_old_mastery, 6),
        old_confidence=target_old_confidence,
        new_confidence=target_new_confidence,
        old_evidence_count=target_old_evidence_count,
        new_evidence_count=target_new_count,
        weight=TARGET_CONCEPT_WEIGHT,
        is_target=True,
    )

    # 2. Update carried concepts (fractional weights and weight-scaled confidence)
    carried_updates: dict[str, ConceptMasteryUpdate] = {}
    for cid, (old_m, w) in carried_map.items():
        new_m = compute_single_concept_mastery(
            old_m,
            outcome,
            weight=w,
            learning_rate=learning_rate,
        )
        old_c = confidences.get(cid, DEFAULT_INITIAL_CONFIDENCE)
        old_cnt = counts.get(cid, 0)
        new_cnt = old_cnt + 1
        new_c = calculate_concept_confidence(old_c, evidence_count=new_cnt, weight=w)

        carried_updates[cid] = ConceptMasteryUpdate(
            concept_id=cid,
            old_mastery=old_m,
            new_mastery=new_m,
            mastery_delta=round(new_m - old_m, 6),
            old_confidence=old_c,
            new_confidence=new_c,
            old_evidence_count=old_cnt,
            new_evidence_count=new_cnt,
            weight=w,
            is_target=False,
        )

    all_updates = {target_concept_id: target_update, **carried_updates}

    return MasteryProfileUpdateResult(
        target_update=target_update,
        carried_updates=carried_updates,
        all_updates=all_updates,
        outcome=outcome,
    )
