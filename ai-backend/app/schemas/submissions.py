"""Code analysis — endpoint 2.

The engine has already executed the code and holds the real result. This service
receives those results and reasons about them; it never runs student code. That
boundary is what keeps the platform deterministic.

Classification is deliberately two-level. A closed enum alone is too narrow —
beginners make contextual mistakes that a fixed taxonomy dumps into `unknown`, and an
`unknown` produces a useless hint. Free text alone is worse: it breaks the hint cache
(never equal twice) and the mastery counts (you cannot count prose).

So: constrain the shape, not the vocabulary.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import ErrorFamily, Schema


class AnalyzeRequest(Schema):
    session_id: str
    attempt_number: int = Field(
        default=1,
        ge=1,
        description="Which try this is. Real evidence, not bookkeeping: the same error on "
        "attempt 7 means something different from the same error on attempt 1.",
    )
    submission_id: str | None = Field(
        default=None, description="The submissions row, when the engine has created one."
    )
    code: str = Field(max_length=20_000)
    error_text: str | None = Field(default=None, max_length=8_000)
    expected_output: str | None = Field(default=None, max_length=4_000)
    actual_output: str | None = Field(default=None, max_length=4_000)


class AnalyzeResponse(Schema):
    error_family: ErrorFamily = Field(
        description="Closed, seven values. Drives syntax_vs_logic and the classifier eval. "
        "The guard rejects anything outside the enum."
    )
    error_tag: str = Field(
        max_length=60,
        pattern=r"^[a-z][a-z0-9_]*$",
        description="OPEN snake_case label, e.g. 'assignment_vs_comparison'. The hint cache "
        "key. The prompt carries the tags seen so far; the model reuses one if it fits and "
        "otherwise coins a new one, so the vocabulary grows from real students.",
    )
    misconception: str = Field(
        description="One sentence naming what the student misunderstands. Feeds TICO's hint."
    )
    confidence: float = Field(ge=0.0, le=1.0)
    is_new_tag: bool = Field(
        default=False,
        description="The model coined this tag. A spike in new tags is a signal to look at "
        "what students are actually hitting.",
    )
    escalated: bool = Field(
        default=False,
        description="Low confidence sent this to the stronger model for a second pass.",
    )
    in_scaffolded_region: bool = Field(
        default=False,
        description="The student broke something the composer had scaffolded — useful signal "
        "about the scaffold itself.",
    )
