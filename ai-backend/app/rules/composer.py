"""The adaptive composer domain rule (M4 — P0).

Pure Python, zero I/O, zero DB, zero LangChain imports.

The composer adapts a mission within a lesson using exactly three levers:
  1. Scaffold plan: How much of each carried concept is pre-scaffolded.
     - Strong mastery (>= 0.7): FULL scaffolding (pre-written in starter code,
       freeing the student to focus on the new target concept).
     - Moderate mastery (0.4..0.7): PARTIAL scaffolding (skeleton provided).
     - Weak mastery (< 0.4): NONE (learner must write it; sanity rule: a weak
       carried concept is NEVER scaffolded away entirely).
     - Challenge Arena: NONE across all carried concepts.
  2. Difficulty band: 1..10 scale adjusted by skill band and attempt history.
  3. Rep number: 1 on first attempt, higher on repeated practice reps.
  4. Advance or Hold: Gate decision comparing mastery against threshold,
     flagging conflicting evidence for escalation review.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.schemas.common import DecidedBy, ScaffoldLevel, SkillBand
from app.schemas.missions import ScaffoldPlan

# NEEDS DECISION: Threshold values (0.7 / 0.4) are implementation defaults mapped
# from qualitative documentation tiers ("Strong" / "Shaky"). They are not currently
# grounded in empirical mastery data or curriculum specification.
# See docs/06-data-model-and-contracts.md and docs/08-ai-generation-and-companion.md.
GATE_MASTERY_THRESHOLD: Final[float] = 0.7
STRONG_MASTERY_THRESHOLD: Final[float] = 0.7
WEAK_MASTERY_THRESHOLD: Final[float] = 0.4

MIN_DIFFICULTY: Final[int] = 1
MAX_DIFFICULTY: Final[int] = 10


class ComposerInvariantError(RuntimeError):
    """Raised when an internal composer invariant is violated (e.g. weak carried concept given FULL scaffolding).

    This exception signals a structural bug in composer logic or invalid threshold configuration,
    not a caller input error.
    """


@dataclass(frozen=True, slots=True)
class AdvanceOrHoldDecision:
    """Decision on whether a student advances past the concept gate or holds."""

    advanced: bool
    decided_by: DecidedBy
    confidence: float
    has_conflict: bool
    reason: str
    conflict_type: str | None = None


@dataclass(frozen=True, slots=True)
class ComposerPlanResult:
    """Full composition result containing scaffold plan and conflict metadata."""

    scaffold_plan: ScaffoldPlan
    confidence: float
    has_conflict: bool
    reason: str
    conflict_type: str | None = None


def compute_scaffold_level(mastery: float, *, is_arena: bool = False) -> ScaffoldLevel:
    """Compute scaffolding for a carried concept based on learner mastery.

    Pedagogical contract (docs/08, ai-architecture.html):
      - Strong mastery (>= 0.7): FULL (pre-declared so student focuses on new target).
      - Moderate mastery (0.4..0.7): PARTIAL (skeleton provided).
      - Shaky / Weak mastery (< 0.4): NONE (student writes it; weak concept is NEVER
        scaffolded away entirely).
      - Challenge Arena: NONE (no scaffolding in the arena).
    """
    if is_arena:
        return ScaffoldLevel.NONE

    if mastery >= STRONG_MASTERY_THRESHOLD:
        return ScaffoldLevel.FULL
    if mastery >= WEAK_MASTERY_THRESHOLD:
        return ScaffoldLevel.PARTIAL
    return ScaffoldLevel.NONE


def compute_difficulty_band(
    *,
    skill_band: SkillBand = SkillBand.ON_LEVEL,
    target_mastery: float = 0.5,
    prior_attempts: int = 0,
    is_arena: bool = False,
) -> int:
    """Calculate integer difficulty band from 1 to 10."""
    if is_arena:
        # Arena stretches students: base 8 + mastery bonus, min 7, max 10
        base = 8 + int(target_mastery * 2)
        return max(7, min(MAX_DIFFICULTY, base))

    # Base difficulty by coarse skill band
    if skill_band == SkillBand.STRUGGLING:
        base = 3
    elif skill_band == SkillBand.READY_TO_STRETCH:
        base = 7
    else:  # ON_LEVEL
        base = 5

    # Slight adjustment based on target concept mastery
    if target_mastery >= STRONG_MASTERY_THRESHOLD:
        base += 1
    elif target_mastery < WEAK_MASTERY_THRESHOLD:
        base -= 1

    # Reduce slightly on repeated attempts to relieve frustration
    if prior_attempts > 0:
        base -= min(prior_attempts, 2)

    return max(MIN_DIFFICULTY, min(MAX_DIFFICULTY, base))


def _assert_no_weak_full_scaffold(
    scaffold_map: dict[str, ScaffoldLevel], masteries: dict[str, float]
) -> None:
    """Assert sanity invariant: weak carried concepts (< WEAK_MASTERY_THRESHOLD) must never be assigned FULL scaffolding.

    This invariant is structurally guaranteed by compute_scaffold_level() as long as
    STRONG_MASTERY_THRESHOLD >= WEAK_MASTERY_THRESHOLD. This check provides defense-in-depth
    against future configuration errors or threshold drift.
    """
    for cid, level in scaffold_map.items():
        if masteries.get(cid, 0.5) < WEAK_MASTERY_THRESHOLD and level == ScaffoldLevel.FULL:
            raise ComposerInvariantError(
                f"Weak carried concept '{cid}' (mastery={masteries.get(cid)}) was "
                f"assigned FULL scaffolding — this should be structurally "
                f"impossible given current thresholds; check "
                f"STRONG_MASTERY_THRESHOLD/WEAK_MASTERY_THRESHOLD configuration."
            )


def compose(
    *,
    target_concept_id: str,
    carried_concept_ids: list[str] | None = None,
    carried_concept_masteries: dict[str, float] | None = None,
    target_concept_mastery: float = 0.5,
    prior_attempts: int = 0,
    skill_band: SkillBand = SkillBand.ON_LEVEL,
    is_arena: bool = False,
) -> ComposerPlanResult:
    """Generate the adaptive scaffold plan, difficulty, and reps for next mission.

    Args:
        target_concept_id: The primary concept being taught (never scaffolded away).
        carried_concept_ids: Concepts previously introduced and carried in this mission.
        carried_concept_masteries: Mapping of carried concept_id to mastery float (0.0..1.0).
        target_concept_mastery: Current student mastery on target concept.
        prior_attempts: Monotonic count of prior attempts on this lesson/mission.
        skill_band: Coarse student skill band.
        is_arena: Whether this composition is for the challenge arena.

    Returns:
        ComposerPlanResult with ScaffoldPlan, confidence score, and conflict metadata.
    """
    if carried_concept_ids and target_concept_id in carried_concept_ids:
        raise ValueError(
            f"target_concept_id '{target_concept_id}' cannot also be in carried_concept_ids: "
            f"target concepts are newly taught and must not be treated as carried scaffolding."
        )
    if carried_concept_masteries and target_concept_id in carried_concept_masteries:
        raise ValueError(
            f"target_concept_id '{target_concept_id}' cannot also be in carried_concept_masteries: "
            f"pass target concept mastery via target_concept_mastery."
        )

    carried_ids = carried_concept_ids or []
    masteries = carried_concept_masteries or {}

    scaffold_map: dict[str, ScaffoldLevel] = {}
    for cid in carried_ids:
        c_mastery = masteries.get(cid, 0.5)
        scaffold_map[cid] = compute_scaffold_level(c_mastery, is_arena=is_arena)

    # Sanity invariant assertion (docs/roadmap.html, ai-architecture.html):
    # A weak carried concept must NEVER be scaffolded away entirely (FULL)
    _assert_no_weak_full_scaffold(scaffold_map, masteries)

    difficulty = compute_difficulty_band(
        skill_band=skill_band,
        target_mastery=target_concept_mastery,
        prior_attempts=prior_attempts,
        is_arena=is_arena,
    )
    rep_number = prior_attempts + 1

    # Conflict detection on composition inputs
    has_conflict = False
    conflict_type = None
    reason = "Deterministic rule applied without conflicting signals."
    confidence = 0.95

    # Example conflict: SkillBand is READY_TO_STRETCH but carried concepts are very weak
    weak_carried = [cid for cid, s in scaffold_map.items() if s == ScaffoldLevel.NONE and masteries.get(cid, 0.5) < WEAK_MASTERY_THRESHOLD]
    if skill_band == SkillBand.READY_TO_STRETCH and len(weak_carried) >= 2:
        has_conflict = True
        conflict_type = "ADVANCED_BAND_WEAK_CARRIED"
        confidence = 0.55
        reason = "Learner is in READY_TO_STRETCH band but multiple carried concepts show shaky mastery."
    elif skill_band == SkillBand.STRUGGLING and target_concept_mastery >= STRONG_MASTERY_THRESHOLD:
        has_conflict = True
        conflict_type = "STRUGGLING_BAND_HIGH_TARGET"
        confidence = 0.55
        reason = "Learner is marked STRUGGLING but has already demonstrated strong mastery on target concept."

    plan = ScaffoldPlan(
        scaffold=scaffold_map,
        difficulty_band=difficulty,
        rep_number=rep_number,
    )

    return ComposerPlanResult(
        scaffold_plan=plan,
        confidence=confidence,
        has_conflict=has_conflict,
        reason=reason,
        conflict_type=conflict_type,
    )


# NEEDS DECISION: evidence_confidence default (0.8) is an uncalibrated heuristic
# baseline representing assumed confidence in the underlying telemetry signals.
def advance_or_hold(
    *,
    target_mastery: float,
    hints_used: int,
    attempt_number: int,
    evidence_confidence: float = 0.8,
    gate_threshold: float = GATE_MASTERY_THRESHOLD,
) -> AdvanceOrHoldDecision:
    """Evaluate whether learner should advance past the concept gate or hold.

    When the evidence conflicts (e.g. solved it but leaned on every hint, or fast
    but multiple failed attempts), returns has_conflict = True and confidence < 0.6
    so the escalation model review chain can confirm or override with a written reason.
    """
    passed_threshold = target_mastery >= gate_threshold

    # Case 1: High mastery but heavy hint reliance (leaned on every hint)
    if passed_threshold and hints_used >= 3:
        return AdvanceOrHoldDecision(
            advanced=True,  # Propose advance but with low confidence
            decided_by=DecidedBy.RULE,
            confidence=0.45,
            has_conflict=True,
            conflict_type="HIGH_MASTERY_HEAVY_HINTS",
            reason=f"Mastery {target_mastery:.2f} exceeds gate {gate_threshold:.2f}, but student used {hints_used} hints.",
        )

    # Case 2: Below threshold but passed on first attempt with 0 hints
    if not passed_threshold and attempt_number == 1 and hints_used == 0 and target_mastery >= 0.5:
        return AdvanceOrHoldDecision(
            advanced=False,  # Propose hold but with low confidence
            decided_by=DecidedBy.RULE,
            confidence=0.50,
            has_conflict=True,
            conflict_type="MODERATE_MASTERY_CLEAN_PASS",
            reason=f"Mastery {target_mastery:.2f} is below gate {gate_threshold:.2f}, but student solved attempt 1 with 0 hints.",
        )

    # Case 3: High mastery but high attempt count (3+ attempts to pass)
    if passed_threshold and attempt_number >= 3:
        return AdvanceOrHoldDecision(
            advanced=True,
            decided_by=DecidedBy.RULE,
            confidence=0.55,
            has_conflict=True,
            conflict_type="HIGH_MASTERY_MANY_ATTEMPTS",
            reason=f"Mastery {target_mastery:.2f} meets gate, but required {attempt_number} attempts.",
        )

    # Case 4: Borderline mastery with low evidence confidence
    if abs(target_mastery - gate_threshold) <= 0.05 and evidence_confidence < 0.5:
        return AdvanceOrHoldDecision(
            advanced=passed_threshold,
            decided_by=DecidedBy.RULE,
            confidence=0.50,
            has_conflict=True,
            conflict_type="BORDERLINE_LOW_CONFIDENCE",
            reason=f"Mastery {target_mastery:.2f} is on the threshold boundary with low evidence confidence ({evidence_confidence:.2f}).",
        )

    # Clear-cut cases:
    if passed_threshold:
        return AdvanceOrHoldDecision(
            advanced=True,
            decided_by=DecidedBy.RULE,
            confidence=0.90,
            has_conflict=False,
            conflict_type=None,
            reason=f"Mastery {target_mastery:.2f} decisively meets gate threshold {gate_threshold:.2f} with clean completion.",
        )

    return AdvanceOrHoldDecision(
        advanced=False,
        decided_by=DecidedBy.RULE,
        confidence=0.90,
        has_conflict=False,
        conflict_type=None,
        reason=f"Mastery {target_mastery:.2f} is below gate threshold {gate_threshold:.2f}. Holding for additional practice.",
    )
