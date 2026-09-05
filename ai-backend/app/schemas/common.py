"""Shared enums and base models.

These DTOs are the public contract of the AI backend. The Next.js client codes against
them and the AI teammate builds `domain/` and `ai/` against them, so a change here is a
change to somebody else's work — say so before you make one.

Ids are typed `str` on purpose. Prisma's default `@id @default(uuid())` produces strings,
and until `client/prisma/schema.prisma` is written we do not know whether the client team
will use uuid, cuid or int. `str` accepts all three; tighten it once the schema lands.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    """Base for request/response bodies.

    **The wire is camelCase; Python stays snake_case.** `session_id` here is `sessionId`
    on the wire, in the OpenAPI schema, and in the generated TypeScript. This is not a
    style preference — `docs/06-data-model-and-contracts.md` is the cross-service
    contract authority and the client implemented it in camelCase months ago. Two
    conventions meeting at an HTTP boundary is normal; the boundary just has to be
    declared in exactly one place, and this is that place.

    `populate_by_name` keeps the snake_case name working too, so Python callers and
    existing tests construct these models unchanged.
    """

    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


class ORMSchema(BaseModel):
    """Base for anything read out of SQLAlchemy.

    Same camelCase wire rule as `Schema`. `from_attributes` reads the snake_case Python
    attribute off the model; the alias only affects what goes out over HTTP.
    """

    model_config = ConfigDict(
        from_attributes=True,
        extra="ignore",
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


# --------------------------------------------------------------------------- enums
#
# Values are UPPERCASE to match the Postgres enum labels Prisma creates. The same token
# then flows unchanged through Python, JSON, TypeScript and the database, with no case
# conversion anywhere. Lowercase values here would look tidier in JSON and would fail on
# every insert.


class Phase(str, Enum):
    """The seven-phase mission loop from the proposal."""

    ENCOUNTER = "ENCOUNTER"
    EXPLORE = "EXPLORE"
    DISCOVER = "DISCOVER"
    UNDERSTAND = "UNDERSTAND"
    GUIDED_CODING = "GUIDED_CODING"
    ADAPT_REMIX = "ADAPT_REMIX"
    INDEPENDENT = "INDEPENDENT"


class LastResult(str, Enum):
    """Outcome of the student's most recent run, as the engine reports it.

    Screaming case because that is what `client/src/lib/ai/types.ts` already sends and
    what `SubmissionStatus` uses in Prisma. Keeping one spelling across the three
    languages is worth more than matching the lowercase style of the enums below.
    """

    PASSED = "PASSED"
    FAILED = "FAILED"
    ERROR = "ERROR"
    TIMEOUT = "TIMEOUT"


class SessionOutcome(str, Enum):
    IN_PROGRESS = "IN_PROGRESS"
    SOLVED = "SOLVED"
    ABANDONED = "ABANDONED"
    TIMED_OUT = "TIMED_OUT"


class HintRung(int, Enum):
    """The 4-rung ladder. The server fixes the rung before any model is called.

    No rung ever emits a complete solution. After WALK the student is sent to a
    mini-practice on the same idea, not to the answer.
    """

    ORIENT = 1  # point at the region, no diagnosis
    QUESTION = 2  # make them think about the concept
    NAME_IT = 3  # name the concept, show the pattern on a *different* example
    WALK = 4  # walk to the fix in their own code, in words


class ErrorFamily(str, Enum):
    """Coarse and stable. Seven values, closed.

    This half exists so the numbers work: `syntax_vs_logic` is a count, and the
    classifier eval needs a fixed answer set to score against. The specificity lives
    in the open `tag` on AnalyzeResponse, which grows from real students.
    """

    SYNTAX = "SYNTAX"          # will not parse: indentation, missing colon, typo
    NAME = "NAME"              # undefined or misspelled variable / function
    TYPE = "TYPE"              # str where int expected, etc.
    LOGIC = "LOGIC"            # runs, wrong answer: bad condition, off-by-one
    INCOMPLETE = "INCOMPLETE"  # missing return, empty body, unchanged starter
    RUNTIME = "RUNTIME"        # infinite loop, index error, crash
    UNKNOWN = "UNKNOWN"


class ScaffoldLevel(str, Enum):
    """How much of a carried concept is pre-filled in the starter code."""

    NONE = "NONE"  # the student writes it themselves
    PARTIAL = "PARTIAL"  # skeleton given, they complete it
    FULL = "FULL"  # pre-written, not the point of this lesson


class LessonRequirement(str, Enum):
    REQUIRED = "REQUIRED"
    OPTIONAL = "OPTIONAL"
    DONE = "DONE"
    SKIPPED = "SKIPPED"


class DecidedBy(str, Enum):
    """Rules propose, the model reviews. Always recorded so a decision can be explained."""

    RULE = "RULE"
    MODEL = "MODEL"


class SkillBand(str, Enum):
    STRUGGLING = "STRUGGLING"
    ON_LEVEL = "ON_LEVEL"
    READY_TO_STRETCH = "READY_TO_STRETCH"


# --------------------------------------------------------------------------- shared


class ConceptRef(Schema):
    concept_id: str
    name: str | None = None


class ErrorBody(Schema):
    """The error object from `docs/06-data-model-and-contracts.md`.

    Its field names are snake_case **on the wire as well** — deliberately. docs/06 spells
    them `request_id` and `retryable` inside this object, and it is the authority. An
    inconsistency the contract states explicitly beats a tidier one nobody agreed to.
    """

    model_config = ConfigDict(extra="forbid")  # no alias generator: see docstring

    code: str = Field(description="Stable machine-readable code, e.g. 'manifest_reference_invalid'.")
    message: str = Field(description="Safe to show a student. Never a stack trace or a solution.")
    request_id: str = Field(description="Echoes X-Request-ID. This is how a bug report becomes a log query.")
    retryable: bool = Field(description="Whether the client may retry the identical call.")
    details: dict = Field(default_factory=dict)


class ErrorResponse(Schema):
    """What every 4xx/5xx returns. A child mid-mission never sees a raw stack trace."""

    error: ErrorBody


class ResponseMeta(Schema):
    """The `meta` half of every success body."""

    request_id: str
    stub: bool = Field(default=False, description="True while this endpoint is still fake.")
    cached: bool = Field(default=False)


class Envelope(Schema):
    """`{ data, meta }` — the success shape docs/06 mandates for every /v1 response.

    The client's `fetchAi` already unwraps with `data.data || data`, so adopting this
    costs the client nothing and gives every response somewhere to carry `request_id`.
    """

    data: object
    meta: ResponseMeta


class Meta(ORMSchema):
    created_at: datetime
    updated_at: datetime | None = None
