"""Realistic sample data for the stub endpoints.

Every value here is shaped exactly like the real thing: Cairo Metro, the
`compose_notice` mechanic from `content/worlds/el_forn.yaml`, and hint text in
Egyptian Arabic with English code identifiers — so the client can test RTL rendering,
long strings and the four-rung escalation before any of it is real.

When a milestone lands, its endpoint stops importing from here. Nothing else changes:
the shapes are already final.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.schemas.common import (
    DecidedBy,
    ErrorFamily,
    HintRung,
    LessonRequirement,
    Phase,
    ScaffoldLevel,
    SessionOutcome,
    SkillBand,
)

NOW = datetime.now(timezone.utc)

# The stub identity. Matches nothing in the database — it does not need to.
DEMO_USER_ID = "demo-student-1"
DEMO_SESSION_ID = "demo-session-1"
DEMO_EXERCISE_ID = "demo-exercise-conditional-gate"
DEMO_LESSON_ID = "demo-lesson-4"
DEMO_TRACK_ID = "demo-track-cairo-metro"

CONCEPTS = ["variables", "conditionals", "loops", "functions"]


# --------------------------------------------------------------------------- hints
# Four rungs, escalating. No rung contains a complete solution — rung 4 names the
# change in words. After rung 4 the client should offer the mini-practice.
HINT_LADDER: dict[int, str] = {
    1: "البوابة مش بتفتح خالص. بصّ كويس على السطر اللي بتتحقق فيه من عدد الركاب.",
    2: "في Python، إيه الفرق بين `=` و `==`؟ الشرط بتاعك المفروض يعمل إيه بالظبط؟",
    3: "دي مقارنة، مش تخزين. المقارنة شكلها كده: `if age == 12:` — جرّب تفكر في اللي عندك.",
    4: "الشرط لازم يقارن مش يخزّن. غيّر الـ `=` الواحدة في السطر ده لـ `==`.",
}

HINT_LADDER_EN: dict[int, str] = {
    1: "The gate never opens. Look carefully at the line where you check the passengers.",
    2: "In Python, what is the difference between `=` and `==`? What should your condition do?",
    3: "This is comparison, not storage. Comparing looks like `if age == 12:`",
    4: "Your condition should compare, not store. Change the single `=` on that line to `==`.",
}


# ----------------------------------------------------------------------- missions
STARTER_CODE = """# الرصيف زحمة. افتح البوابة التانية لو عدد المستنيين أكتر من 30.
waiting = station.passengers

# TODO: افتح البوابة لما الشرط يتحقق
"""

SOLUTION_CODE = """waiting = station.passengers
if waiting > 30:
    gate.open()
"""

MISSION_TESTS = [
    {
        "name": "gate opens above the threshold",
        "call": "gate.state",
        "expected": "open",
    },
    {
        "name": "gate stays shut below the threshold",
        "call": "gate.state",
        "expected": "closed",
    },
]

SCAFFOLD_PLAN = {
    "scaffold": {"variables": ScaffoldLevel.FULL},
    "difficulty_band": 4,
    "rep_number": 1,
}


def generated_mission() -> dict:
    return {
        "id": "demo-generated-1",
        "level_id": DEMO_EXERCISE_ID,
        "world_id": "el_forn",
        "scene_id": "bakery_dawn",
        "target_concept_id": "variables",
        "carried_concept_ids": [],
        "title": "إشعار فتح المخبز",
        "instructions": (
            "اكتب دالة `opening_notice(station_name: str, loaves: int) -> str` "
            "ترجّع رسالة الفتح."
        ),
        "brief": "الفرن فتح بدري والصواني طالعة. عايزين نكتب إشعار الفتح.",
        "starter_code": STARTER_CODE,
        "tests": MISSION_TESTS,
        "scaffold_plan": SCAFFOLD_PLAN,
        "params": {"fn_name": "opening_notice", "a_name": "station_name", "b_name": "loaves"},
        "validated": True,
        "reused": False,
    }


# ----------------------------------------------------------------------- students
def mastery() -> list[dict]:
    return [
        {
            "concept_id": "variables",
            "mastery": 0.82,
            "confidence": 0.71,
            "evidence_count": 9,
            "last_seen_at": NOW - timedelta(hours=2),
        },
        {
            "concept_id": "conditionals",
            "mastery": 0.41,
            "confidence": 0.48,
            "evidence_count": 4,
            "last_seen_at": NOW - timedelta(minutes=12),
        },
        {
            "concept_id": "loops",
            "mastery": 0.0,
            "confidence": 0.0,
            "evidence_count": 0,
            "last_seen_at": None,
        },
        {
            "concept_id": "functions",
            "mastery": 0.0,
            "confidence": 0.0,
            "evidence_count": 0,
            "last_seen_at": None,
        },
    ]


def profile(user_id: str) -> dict:
    return {
        "user_id": user_id,
        "self_reported_level": "beginner",
        "skill_band": SkillBand.ON_LEVEL,
        "hint_dependency": 0.38,
        "syntax_vs_logic": 0.62,
        "pace": 1.1,
        "locale": "ar-EG",
        "last_computed_at": NOW,
        "model_version": "stub",
    }


def lesson_plan() -> list[dict]:
    """A student who demonstrated variables in the diagnostic: lessons 1-3 optional."""
    rows = []
    for i in range(1, 13):
        skipped = i <= 3
        rows.append(
            {
                "level_id": f"demo-lesson-{i}",
                "requirement": (
                    LessonRequirement.OPTIONAL if skipped else LessonRequirement.REQUIRED
                ),
                "reason": (
                    "Solved the variables task in the diagnostic with no hints."
                    if skipped
                    else None
                ),
                "decided_by": DecidedBy.MODEL if skipped else DecidedBy.RULE,
                "confidence": 0.79 if skipped else 1.0,
                "decided_at": NOW,
            }
        )
    return rows


# ----------------------------------------------------------------------- sessions
def session(session_id: str = DEMO_SESSION_ID) -> dict:
    return {
        "id": session_id,
        "user_id": DEMO_USER_ID,
        "level_id": DEMO_EXERCISE_ID,
        "generated_mission_id": "demo-generated-1",
        "phase": Phase.GUIDED_CODING,
        "outcome": SessionOutcome.IN_PROGRESS,
        "hints_used": 2,
        "time_spent_ms": 254_000,
        "started_at": NOW - timedelta(minutes=5),
        "ended_at": None,
    }


# ------------------------------------------------------------------------ analysis
def analysis() -> dict:
    return {
        "error_family": ErrorFamily.LOGIC,
        "error_tag": "assignment_vs_comparison",
        "misconception": "The student believes a single `=` compares two values.",
        "confidence": 0.93,
        "is_new_tag": False,
        "escalated": False,
        "in_scaffolded_region": False,
    }


# ---------------------------------------------------------------------- tico chat
TICO_REPLY_CHUNKS = [
    "سؤال حلو! ",
    "في Python، الـ `=` الواحدة معناها ",
    "«خزّن القيمة دي»، ",
    "لكن الـ `==` معناها «قارن الاتنين دول». ",
    "الشرط بتاعك عايز يقارن، مش يخزّن. ",
]

__all__ = [
    "DEMO_USER_ID",
    "DEMO_SESSION_ID",
    "DEMO_EXERCISE_ID",
    "DEMO_LESSON_ID",
    "DEMO_TRACK_ID",
    "CONCEPTS",
    "HINT_LADDER",
    "HINT_LADDER_EN",
    "STARTER_CODE",
    "SOLUTION_CODE",
    "SCAFFOLD_PLAN",
    "generated_mission",
    "mastery",
    "profile",
    "lesson_plan",
    "session",
    "analysis",
    "TICO_REPLY_CHUNKS",
    "HintRung",
]
