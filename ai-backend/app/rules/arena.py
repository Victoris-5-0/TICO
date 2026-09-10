"""The challenge arena concept selection domain rule (M6 — P2).

Pure Python, zero I/O, zero DB, zero LangChain/SQLAlchemy imports.

Pedagogical & architectural contract (AGENTS.md, docs/08, tico-ai-tasks.csv):
  - "After the roadmap comes the challenge arena: mastered concepts mixed, no scaffolding."
  - "Arena selection weighted toward the weakest concept | Notes: A challenge should stretch not flatter."
  - "A challenge should stretch, not flatter": Among mastered concepts, the one closer
    to the threshold (more recently mastered, growth edge) is prioritized as the primary
    target over rock-solid concepts.
  - Eligibility: Concepts must have mastery >= MASTERY_THRESHOLD, imported
    directly from app.rules.composer to eliminate threshold drift.
  - Deterministic: Ascending mastery sort with alphabetical tie-breaking for repeatable evaluation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final

from app.rules.mastery import MASTERY_THRESHOLD
from app.schemas.common import SkillBand

# NEEDS DECISION: the default number of concepts mixed into one arena
# challenge (2) is not specified anywhere in AGENTS.md or docs/08 — both
# only say "mastered concepts mixed, no scaffolding" without a count.
# Confirm with the team / product design before relying on this default
# for the actual challenge arena UX.
DEFAULT_ARENA_CONCEPT_COUNT: Final[int] = 2

# NEEDS DECISION: docs/08 and tico-ai-tasks.csv specify "weighted toward the weakest concept"
# and "a challenge should stretch not flatter", but do not prescribe an exact mathematical
# distribution curve or probability function. The deterministic ascending-mastery sort
# with alphabetical tie-breaking provides a stable, zero-I/O, fully unit-testable ranking
# where the student's weakest mastered concept is prioritized as the primary target.
# If future product requirements demand non-deterministic stochastic sampling (e.g. weighted
# random sampling without replacement using inverse-mastery weights), an explicit RNG seed
# or strategy parameter should be introduced.


class InsufficientMasteredConceptsError(ValueError):
    """Raised when a learner has fewer mastered concepts than required for an arena challenge."""


@dataclass(frozen=True, slots=True)
class ArenaSelectionResult:
    """Result of challenge arena concept selection.

    Contains the ordered selected concepts, their masteries, and derived targets
    for direct consumption by composer.compose(..., is_arena=True).
    """

    selected_concept_ids: list[str]
    concept_masteries: dict[str, float]
    eligible_concept_count: int
    target_concept_id: str
    carried_concept_ids: list[str]
    reason: str


def select_arena_concepts(
    mastery_map: dict[str, float],
    *,
    count: int = DEFAULT_ARENA_CONCEPT_COUNT,
    mastery_threshold: float = MASTERY_THRESHOLD,
) -> ArenaSelectionResult:
    """Select and rank concepts for a challenge arena mission.

    Pedagogical contract:
      - Only mastered concepts (mastery >= MASTERY_THRESHOLD) are eligible. This is the
        same threshold the gate and the mission picker use — arena entry is a mastery
        question, and it used to borrow composer.MASTERY_THRESHOLD (0.70), which
        answers a different one and let a student into the arena on a concept the
        roadmap had not finished teaching them.
      - Concepts are sorted ascending by mastery so the weakest-but-mastered concept
        comes first to stretch the learner on solid ground.
      - Stable alphabetical tie-breaking on concept_id for identical masteries.

    Args:
        mastery_map: Mapping of concept_id to mastery float (0.0..1.0), matching
                     MasteryProfileUpdateResult.mastery_map.
        count: Number of concepts to select for the challenge (minimum 1).
        mastery_threshold: Cutoff for arena eligibility, defaulting strictly to
                           mastery.MASTERY_THRESHOLD.

    Returns:
        ArenaSelectionResult with selected concepts and target/carried partition.

    Raises:
        ValueError: If count < 1.
        InsufficientMasteredConceptsError: If fewer than count concepts meet the threshold.
    """
    if count < 1:
        raise ValueError(f"Arena concept count must be at least 1, got {count}.")

    # 1. Filter to concepts meeting or exceeding the strong mastery threshold
    eligible: dict[str, float] = {
        cid: mastery
        for cid, mastery in mastery_map.items()
        if mastery >= mastery_threshold
    }

    if len(eligible) < count:
        raise InsufficientMasteredConceptsError(
            f"Insufficient mastered concepts for arena challenge: required {count}, "
            f"but learner only has {len(eligible)} concept(s) at or above "
            f"mastery threshold {mastery_threshold:.2f}. Eligible: {sorted(eligible.keys())}."
        )

    # 2. Deterministic sort: ascending mastery (weakest mastered first), alphabetical tie-break
    sorted_eligible = sorted(
        eligible.items(),
        key=lambda item: (item[1], item[0]),
    )

    selected_pairs = sorted_eligible[:count]
    selected_ids = [cid for cid, _ in selected_pairs]
    selected_masteries = {cid: m for cid, m in selected_pairs}

    target_concept_id = selected_ids[0]
    carried_concept_ids = selected_ids[1:]

    reason = (
        f"Selected {count} weakest-mastered concept(s) above threshold {mastery_threshold:.2f} "
        f"to stretch learner boundaries (target: '{target_concept_id}', mastery: {selected_masteries[target_concept_id]:.2f})."
    )

    return ArenaSelectionResult(
        selected_concept_ids=selected_ids,
        concept_masteries=selected_masteries,
        eligible_concept_count=len(eligible),
        target_concept_id=target_concept_id,
        carried_concept_ids=carried_concept_ids,
        reason=reason,
    )


def prepare_arena_composition_args(
    selection: ArenaSelectionResult,
    *,
    prior_attempts: int = 0,
    skill_band: SkillBand = SkillBand.ON_LEVEL,
) -> dict[str, Any]:
    """Format arena selection output into kwargs for app.rules.composer.compose().

    Example usage:
        selection = select_arena_concepts(mastery_map, count=2)
        compose_kwargs = prepare_arena_composition_args(selection)
        composer_plan = compose(**compose_kwargs)
    """
    return {
        "target_concept_id": selection.target_concept_id,
        "carried_concept_ids": selection.carried_concept_ids,
        "carried_concept_masteries": {
            cid: selection.concept_masteries[cid]
            for cid in selection.carried_concept_ids
        },
        "target_concept_mastery": selection.concept_masteries[selection.target_concept_id],
        "prior_attempts": prior_attempts,
        "skill_band": skill_band,
        "is_arena": True,
    }
