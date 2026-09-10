"""Adaptive Composer Invariant Evaluation Suite (M4 Adaptation).

CSV Task:
    "Planner safety eval + composer eval | M4 Adaptation | AI teammate | P1 |
     Notes: Assert nothing below threshold is skipped and is_skippable=false is never optional."

SCOPE DEFERRAL NOTE:
    Planner-safety evaluation half is deferred until rules/plan.py exists
    (owned by another lane per AGENTS.md); once unblocked, it must assert that
    nothing below threshold is skipped and is_skippable=false lessons are never optional.
    This module evaluates the composer half across a systematic synthetic profile sweep.

Distinction from unit tests (tests/test_composer.py):
    tests/test_composer.py tests discrete function behaviors on hand-picked cases.
    This eval runs a broad, deterministic, grid-based regression sweep (2,112 synthetic profiles)
    evaluating global pedagogical invariants across all permutations of skill bands, mastery tiers,
    carried concept states, prior attempts, and arena modes.

Global Invariants Evaluated:
    a) "Nothing below threshold is skipped": No carried concept with mastery below
       WEAK_MASTERY_THRESHOLD (< 0.4) ever receives FULL scaffolding.
       compose() must never raise ComposerInvariantError across the entire sweep.
    b) difficulty_band is strictly bounded in [1, 10].
    c) rep_number is monotonically >= 1 (prior_attempts + 1).
    d) In arena mode (is_arena=True), scaffold level is NONE for every carried concept.
    e) advance_or_hold() confidence is strictly bounded in [0.0, 1.0].
"""

from __future__ import annotations

from dataclasses import dataclass, field
import itertools
from pathlib import Path
import sys
import time
from typing import Any

# Ensure ai-backend root is in sys.path when executed as a standalone script
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from app.rules.composer import (
    ComposerInvariantError,
    ComposerPlanResult,
    WEAK_MASTERY_THRESHOLD,
    advance_or_hold,
    compose,
)
from app.schemas.common import ScaffoldLevel, SkillBand


@dataclass(frozen=True, slots=True)
class SyntheticProfile:
    """Deterministic synthetic student profile configuration for composition evaluation."""

    target_concept_mastery: float
    skill_band: SkillBand
    carried_scenario_name: str
    carried_concept_ids: list[str]
    carried_concept_masteries: dict[str, float]
    prior_attempts: int
    is_arena: bool


@dataclass(frozen=True, slots=True)
class InvariantViolation:
    """Record of an invariant check failure."""

    invariant_id: str
    description: str
    profile: SyntheticProfile
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class EvalReport:
    """Structured evaluation report containing summary metrics and violations."""

    total_cases: int
    passed_cases: int
    failed_cases: int
    elapsed_seconds: float
    violations: list[InvariantViolation] = field(default_factory=list)
    # Distribution and telemetry statistics for demo material
    arena_cases: int = 0
    non_arena_cases: int = 0
    min_observed_difficulty: int = 10
    max_observed_difficulty: int = 1
    min_observed_rep: int = 999
    max_observed_rep: int = 0
    min_observed_confidence: float = 1.0
    max_observed_confidence: float = 0.0
    gate_advance_count: int = 0
    gate_hold_count: int = 0
    gate_conflict_count: int = 0
    gate_conflicts_by_type: dict[str, int] = field(default_factory=dict)
    composer_conflict_count: int = 0
    composer_conflicts_by_type: dict[str, int] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return len(self.violations) == 0 and self.failed_cases == 0


def generate_synthetic_profiles() -> list[SyntheticProfile]:
    """Generate a deterministic, reproducible Cartesian grid of synthetic student profiles.

    Dimensions:
      - 11 target concept masteries: 0.0 to 1.0 (step 0.1)
      - 3 skill bands: STRUGGLING, ON_LEVEL, READY_TO_STRETCH
      - 8 carried concept scenarios: empty, single weak, single strong, all weak,
                                     all moderate, all strong, mixed, unspecified
      - 4 prior attempts counts: 0, 1, 3, 10
      - 2 arena flags: False, True

    Total: 11 * 3 * 8 * 4 * 2 = 2,112 cases.
    """
    target_masteries = [round(i * 0.1, 2) for i in range(11)]
    skill_bands = [SkillBand.STRUGGLING, SkillBand.ON_LEVEL, SkillBand.READY_TO_STRETCH]
    carried_scenarios = [
        ("empty", [], {}),
        ("single_weak", ["variables"], {"variables": 0.0}),
        ("single_strong", ["variables"], {"variables": 1.0}),
        ("all_weak", ["variables", "conditionals"], {"variables": 0.15, "conditionals": 0.35}),
        ("all_moderate", ["variables", "conditionals"], {"variables": 0.45, "conditionals": 0.65}),
        ("all_strong", ["variables", "conditionals"], {"variables": 0.75, "conditionals": 0.95}),
        ("mixed", ["variables", "conditionals", "loops"], {"variables": 0.20, "conditionals": 0.50, "loops": 0.85}),
        ("unspecified", ["variables", "conditionals"], {}),
    ]
    prior_attempts_values = [0, 1, 3, 10]
    arena_values = [False, True]

    profiles: list[SyntheticProfile] = []
    for tm, sb, (sname, c_ids, c_mast), pa, is_a in itertools.product(
        target_masteries,
        skill_bands,
        carried_scenarios,
        prior_attempts_values,
        arena_values,
    ):
        profiles.append(
            SyntheticProfile(
                target_concept_mastery=tm,
                skill_band=sb,
                carried_scenario_name=sname,
                carried_concept_ids=c_ids,
                carried_concept_masteries=c_mast,
                prior_attempts=pa,
                is_arena=is_a,
            )
        )
    return profiles


def run_composer_eval(profiles: list[SyntheticProfile] | None = None) -> EvalReport:
    """Execute the systematic composer evaluation sweep across all synthetic profiles."""
    if profiles is None:
        profiles = generate_synthetic_profiles()

    start_time = time.perf_counter()
    report = EvalReport(
        total_cases=len(profiles),
        passed_cases=0,
        failed_cases=0,
        elapsed_seconds=0.0,
    )

    for p in profiles:
        case_violations: list[InvariantViolation] = []

        # 1. Evaluate compose()
        plan_result: ComposerPlanResult | None = None
        try:
            plan_result = compose(
                target_concept_id="target_concept",
                carried_concept_ids=p.carried_concept_ids,
                carried_concept_masteries=p.carried_concept_masteries,
                target_concept_mastery=p.target_concept_mastery,
                prior_attempts=p.prior_attempts,
                skill_band=p.skill_band,
                is_arena=p.is_arena,
            )
        except ComposerInvariantError as err:
            case_violations.append(
                InvariantViolation(
                    invariant_id="INVARIANT_A_INTERNAL_ERROR",
                    description=f"compose() raised ComposerInvariantError: {err}",
                    profile=p,
                )
            )
        except Exception as err:
            case_violations.append(
                InvariantViolation(
                    invariant_id="UNEXPECTED_EXCEPTION",
                    description=f"compose() raised unexpected exception: {type(err).__name__}: {err}",
                    profile=p,
                )
            )

        if plan_result is not None:
            plan = plan_result.scaffold_plan

            # Invariant a) "Nothing below threshold is skipped"
            # Weak carried concept (< 0.4) must NEVER receive FULL scaffolding
            for cid, scaffold_level in plan.scaffold.items():
                m = p.carried_concept_masteries.get(cid, 0.5)
                if m < WEAK_MASTERY_THRESHOLD and scaffold_level == ScaffoldLevel.FULL:
                    case_violations.append(
                        InvariantViolation(
                            invariant_id="INVARIANT_A_WEAK_CARRIED_FULL_SCAFFOLD",
                            description=f"Concept '{cid}' with weak mastery {m} received FULL scaffolding.",
                            profile=p,
                            details={"concept_id": cid, "mastery": m, "scaffold": scaffold_level},
                        )
                    )

            # Invariant b) difficulty_band in [1, 10]
            if not (1 <= plan.difficulty_band <= 10):
                case_violations.append(
                    InvariantViolation(
                        invariant_id="INVARIANT_B_DIFFICULTY_OUT_OF_BOUNDS",
                        description=f"difficulty_band {plan.difficulty_band} is outside legal range [1, 10].",
                        profile=p,
                        details={"difficulty_band": plan.difficulty_band},
                    )
                )

            # Invariant c) rep_number >= 1
            if plan.rep_number < 1:
                case_violations.append(
                    InvariantViolation(
                        invariant_id="INVARIANT_C_REP_NUMBER_INVALID",
                        description=f"rep_number {plan.rep_number} is less than 1.",
                        profile=p,
                        details={"rep_number": plan.rep_number},
                    )
                )

            # Invariant d) In arena mode, scaffold is NONE for all carried concepts
            if p.is_arena:
                for cid, scaffold_level in plan.scaffold.items():
                    if scaffold_level != ScaffoldLevel.NONE:
                        case_violations.append(
                            InvariantViolation(
                                invariant_id="INVARIANT_D_ARENA_SCAFFOLD_NOT_NONE",
                                description=f"Arena mode assigned scaffold {scaffold_level} to concept '{cid}', expected NONE.",
                                profile=p,
                                details={"concept_id": cid, "scaffold": scaffold_level},
                            )
                        )

            # Track statistics
            if p.is_arena:
                report.arena_cases += 1
            else:
                report.non_arena_cases += 1

            report.min_observed_difficulty = min(report.min_observed_difficulty, plan.difficulty_band)
            report.max_observed_difficulty = max(report.max_observed_difficulty, plan.difficulty_band)
            report.min_observed_rep = min(report.min_observed_rep, plan.rep_number)
            report.max_observed_rep = max(report.max_observed_rep, plan.rep_number)

            if plan_result.has_conflict:
                report.composer_conflict_count += 1
                ctype = plan_result.conflict_type or "UNKNOWN"
                report.composer_conflicts_by_type[ctype] = report.composer_conflicts_by_type.get(ctype, 0) + 1

        # 2. Evaluate advance_or_hold()
        # Test across 0 hints, 1 hint, and 3 hints to verify confidence invariance across hint reliance
        for hints in (0, 1, 3):
            try:
                gate_decision = advance_or_hold(
                    target_mastery=p.target_concept_mastery,
                    hints_used=hints,
                    attempt_number=p.prior_attempts + 1,
                )

                # Invariant e) Confidence strictly in [0.0, 1.0]
                if not (0.0 <= gate_decision.confidence <= 1.0):
                    case_violations.append(
                        InvariantViolation(
                            invariant_id="INVARIANT_E_CONFIDENCE_OUT_OF_BOUNDS",
                            description=f"advance_or_hold confidence {gate_decision.confidence} is outside [0.0, 1.0].",
                            profile=p,
                            details={"confidence": gate_decision.confidence, "hints_used": hints},
                        )
                    )

                # Record statistics (using profile's representative hints)
                if hints == min(p.prior_attempts, 3):
                    report.min_observed_confidence = min(report.min_observed_confidence, gate_decision.confidence)
                    report.max_observed_confidence = max(report.max_observed_confidence, gate_decision.confidence)
                    if gate_decision.advanced:
                        report.gate_advance_count += 1
                    else:
                        report.gate_hold_count += 1
                    if gate_decision.has_conflict:
                        report.gate_conflict_count += 1
                        ctype = gate_decision.conflict_type or "UNKNOWN"
                        report.gate_conflicts_by_type[ctype] = report.gate_conflicts_by_type.get(ctype, 0) + 1

            except Exception as err:
                case_violations.append(
                    InvariantViolation(
                        invariant_id="ADVANCE_OR_HOLD_EXCEPTION",
                        description=f"advance_or_hold() raised unexpected exception: {type(err).__name__}: {err}",
                        profile=p,
                    )
                )

        if case_violations:
            report.failed_cases += 1
            report.violations.extend(case_violations)
        else:
            report.passed_cases += 1

    report.elapsed_seconds = time.perf_counter() - start_time
    return report


def _group_violations_by_invariant(
    violations: list[InvariantViolation],
) -> dict[str, list[InvariantViolation]]:
    """Group violations by their associated invariant letter (a through e, or other)."""
    groups: dict[str, list[InvariantViolation]] = {
        "a": [],
        "b": [],
        "c": [],
        "d": [],
        "e": [],
        "other": [],
    }
    for v in violations:
        iid = v.invariant_id.upper()
        if iid.startswith("INVARIANT_A"):
            groups["a"].append(v)
        elif iid.startswith("INVARIANT_B"):
            groups["b"].append(v)
        elif iid.startswith("INVARIANT_C"):
            groups["c"].append(v)
        elif iid.startswith("INVARIANT_D"):
            groups["d"].append(v)
        elif iid.startswith("INVARIANT_E"):
            groups["e"].append(v)
        else:
            groups["other"].append(v)
    return groups


def format_report(report: EvalReport) -> str:
    """Format the evaluation results into a human-readable summary suitable for demo material.

    Every per-invariant status ([PASS] / [FAIL]) and violation count is computed dynamically
    from real violation data in report.violations.
    """
    status_str = "PASSED" if report.passed else "FAILED"
    pass_pct = (report.passed_cases / report.total_cases * 100.0) if report.total_cases > 0 else 0.0

    groups = _group_violations_by_invariant(report.violations)
    a_count = len(groups["a"])
    b_count = len(groups["b"])
    c_count = len(groups["c"])
    d_count = len(groups["d"])
    e_count = len(groups["e"])
    other_count = len(groups["other"])

    lines = [
        "=" * 80,
        "                   TICO ADAPTIVE COMPOSER EVALUATION REPORT                    ",
        "=" * 80,
        f"Overall Invariant Evaluation Status: {'PASSED' if report.passed else 'FAILED'}",
        f"Total profiles evaluated:            {report.total_cases}",
        f"Profiles passing all checks:         {report.passed_cases}",
        f"Profiles with invariant violations:  {report.failed_cases}",
        f"Total invariant violations:          {len(report.violations)}",
        f"Overall Invariant Pass Rate:         {pass_pct:.2f}%",
        f"Sweep Execution Time:                {report.elapsed_seconds:.4f}s",
        "",
        "--- Invariant Verification ---",
        f"[{'PASS' if a_count == 0 else 'FAIL'}] (a) No weak concept (< 0.4) assigned FULL scaffold ({a_count} violation(s))",
        f"[{'PASS' if b_count == 0 else 'FAIL'}] (b) Difficulty band strictly bounded in [1, 10] ({b_count} violation(s), observed: min={report.min_observed_difficulty}, max={report.max_observed_difficulty})",
        f"[{'PASS' if c_count == 0 else 'FAIL'}] (c) Repetition number monotonically valid >= 1 ({c_count} violation(s), observed: min={report.min_observed_rep}, max={report.max_observed_rep})",
        f"[{'PASS' if d_count == 0 else 'FAIL'}] (d) Arena mode scaffolding strictly NONE across all carried concepts ({d_count} violation(s), {report.arena_cases} arena cases)",
        f"[{'PASS' if e_count == 0 else 'FAIL'}] (e) Advance/Hold gate confidence strictly bounded in [0.0, 1.0] ({e_count} violation(s), observed: min={report.min_observed_confidence:.2f}, max={report.max_observed_confidence:.2f})",
    ]

    if other_count > 0:
        lines.append(f"[FAIL] (other) Unexpected exceptions encountered during evaluation ({other_count} violation(s))")

    lines.extend([
        "",
        "--- Distribution & Pedagogical Telemetry ---",
        f"Environment split: Standard Missions={report.non_arena_cases}, Challenge Arena={report.arena_cases}",
        f"Gate Decisions:    Advance={report.gate_advance_count} ({(report.gate_advance_count / report.total_cases * 100) if report.total_cases else 0:.1f}%), Hold={report.gate_hold_count} ({(report.gate_hold_count / report.total_cases * 100) if report.total_cases else 0:.1f}%)",
        f"Escalation Flagged (Gate Conflicts):     {report.gate_conflict_count} ({(report.gate_conflict_count / report.total_cases * 100) if report.total_cases else 0:.1f}%)",
    ])

    for ctype, count in sorted(report.gate_conflicts_by_type.items()):
        lines.append(f"  - {ctype}: {count}")

    lines.append(
        f"Composer Conflicting Profiles:          {report.composer_conflict_count} ({(report.composer_conflict_count / report.total_cases * 100) if report.total_cases else 0:.1f}%)"
    )
    for ctype, count in sorted(report.composer_conflicts_by_type.items()):
        lines.append(f"  - {ctype}: {count}")

    if report.violations:
        lines.extend(["", "--- Violations Detected ---"])
        for idx, v in enumerate(report.violations[:10], 1):
            lines.append(f"{idx}. [{v.invariant_id}] {v.description}")
            lines.append(
                f"   Profile: target_mastery={v.profile.target_concept_mastery}, "
                f"skill_band={v.profile.skill_band.value}, scenario={v.profile.carried_scenario_name}, "
                f"prior_attempts={v.profile.prior_attempts}, is_arena={v.profile.is_arena}"
            )
        if len(report.violations) > 10:
            lines.append(f"... and {len(report.violations) - 10} additional violations.")

    lines.extend([
        "=" * 80,
        f"STATUS: {status_str}",
        "=" * 80,
    ])
    return "\n".join(lines)


if __name__ == "__main__":
    report = run_composer_eval()
    print(format_report(report))
    sys.exit(0 if report.passed else 1)
