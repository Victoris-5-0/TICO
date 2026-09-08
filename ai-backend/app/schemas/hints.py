"""TICO's hint mode — endpoint 1, the first thing worth showing.

The server counts prior `hint_event` rows and fixes the rung in `domain/hint_ladder.py`
before any model is called. The model writes prose for that rung only; it is never shown
the solution and never asked for the next rung.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import HintRung, LastResult, ORMSchema, ScaffoldLevel, Schema


class HintRequest(Schema):
    """Fields follow `docs/06`: "mission/session IDs, code excerpt, last result, locale".

    Serialised camelCase — `sessionId`, `missionId`, `codeExcerpt`, `lastResult` — which
    is what `client/src/lib/ai/client.ts` has always sent.
    """

    session_id: str
    mission_id: str = Field(
        description="The exercise the student is on. `Exercise` is the row; 'mission' is "
        "what it is called everywhere the student can see, and the contract uses the "
        "student-facing word. Needed to load test cases and to key the hint cache."
    )
    code_excerpt: str = Field(
        max_length=20_000, description="The student's current code, exactly as typed."
    )
    last_result: LastResult | None = Field(
        default=None,
        description="Outcome of the most recent run, from the engine. The AI service "
        "never executes code.",
    )
    locale: str = Field(default="ar-EG")

    # --- optional sharpeners; the client may omit both ------------------------------
    error_text: str | None = Field(
        default=None,
        max_length=8_000,
        description="The actual failing message. `lastResult` says *that* it failed; this "
        "says how, which is what separates a useful hint from a generic one.",
    )
    error_tag: str | None = Field(
        default=None,
        max_length=60,
        description="From /submissions/analyze if it has already run, e.g. "
        "'assignment_vs_comparison'. Sharpens the hint and forms part of the cache key.",
    )


class HintResponse(Schema):
    rung: HintRung = Field(description="Which rung this is. Decided in Python, not by a model.")
    hint: str = Field(description="TICO's words. Egyptian Arabic prose, English identifiers.")
    is_final: bool = Field(
        description="True on rung 4. The client should then offer the mini-practice, not an answer."
    )
    next_step: str | None = Field(
        default=None,
        description="Set when is_final: 'mini_practice'. No rung ever returns the solution.",
    )
    remaining_rungs: int = Field(
        ge=0,
        le=3,
        description="How many rungs are left. Derived from `rung`, and returned so the "
        "client does not compute it separately and drift when the ladder length changes.",
    )
    hint_event_id: str
    cached: bool = Field(
        default=False,
        description="Served from the Postgres hint cache with no model call. Expected to be common on early lessons.",
    )


class HintEventOut(ORMSchema):
    """One hint shown. The core evidence behind `hint_dependency` in the student model."""

    id: str
    session_id: str
    submission_id: str | None = None
    concept_id: str
    hint_level: HintRung
    text: str
    model: str | None = None
    was_used: bool = False
    scaffold_state: ScaffoldLevel | None = Field(
        default=None,
        description="What the composer scaffolded for this mission. TICO must not hint about a concept it scaffolded away.",
    )
    created_at: datetime
