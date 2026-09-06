"""The student model and the path planner — endpoints 3 and 4.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M4.

Mastery numbers are computed in Python and never produced by a model. Where a
decision is made *about* a student, a rule proposes and a model reviews the risky
cases — `decided_by` and `reason` are always recorded so it can be explained.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import mark
from app.core.auth import CurrentUser, get_current_user, require_self
from app.schemas.common import DecidedBy, ErrorResponse, LessonRequirement
from app.schemas.students import (
    LessonPlanEntry,
    MasteryOut,
    PlanRequest,
    PlanResponse,
    RefreshRequest,
    RefreshResponse,
    StudentProfileOut,
)

router = APIRouter(prefix="/students", tags=["student model"])

RESPONSES = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


@router.post(
    "/{student_id}/refresh",
    response_model=RefreshResponse,
    responses=RESPONSES,
    summary="Recompute the student model",
    description=(
        "Called in the background after a session closes — the client fires and forgets. "
        "Returns the recomputed profile, per-concept mastery, and whether the gate moved "
        "the student on. `decidedBy` says whether a rule or a model made that call.\n\n"
        "Pass `watermark` (the newest submission id you have already accounted for) to "
        "make the call idempotent — without it a double-fire would count the same "
        "attempts into mastery twice."
    ),
)
def refresh(
    student_id: str,
    response: Response,
    body: RefreshRequest | None = None,
    user: CurrentUser = Depends(get_current_user),
) -> RefreshResponse:
    mark(response)
    require_self(student_id, user)

    return RefreshResponse(
        profile=StudentProfileOut(**fx.profile(student_id)),
        concepts=[MasteryOut(**m) for m in fx.mastery()],
        advanced=False,
        decided_by=DecidedBy.MODEL,
        reason=(
            "Solved it, but used three of four hint rungs and took twice the expected "
            "time. Holding for one more rep rather than advancing."
        ),
        summary="Nour is getting conditionals but still leaning on hints to get there.",
    )


@router.post(
    "/{student_id}/plan",
    response_model=PlanResponse,
    responses=RESPONSES,
    summary="Build the personal lesson path",
    description=(
        "After onboarding. A beginner gets every lesson `REQUIRED` with no diagnostic "
        "and no model call. An experienced student's diagnostic can mark lessons "
        "`OPTIONAL` — but every skip is model-reviewed and carries a `reason`.\n\n"
        "**The concept order never changes. Which lessons are in the path does.** "
        "A skipped lesson stays replayable; skipping is a suggestion, never a lock-out."
    ),
)
def build_plan(
    student_id: str,
    body: PlanRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> PlanResponse:
    mark(response)
    require_self(student_id, user)

    if body.is_beginner:
        rows = [
            LessonPlanEntry(
                level_id=f"demo-lesson-{i}",
                requirement=LessonRequirement.REQUIRED,
                reason=None,
                decided_by=DecidedBy.RULE,
                confidence=1.0,
                decided_at=fx.NOW,
            )
            for i in range(1, 13)
        ]
        return PlanResponse(
            lessons=rows,
            starting_level_id="demo-lesson-1",
            skipped_count=0,
            summary="أهلاً! هنبدأ من أول درس ونمشي خطوة خطوة.",
        )

    rows = [LessonPlanEntry(**r) for r in fx.lesson_plan()]
    skipped = sum(1 for r in rows if r.requirement is LessonRequirement.OPTIONAL)
    return PlanResponse(
        lessons=rows,
        starting_level_id="demo-lesson-4",
        skipped_count=skipped,
        summary=(
            "شكلك عارف المتغيرات كويس، فهنعدّي أول ٣ دروس ونبدأ من الشروط. "
            "تقدر ترجعلهم في أي وقت."
        ),
    )
