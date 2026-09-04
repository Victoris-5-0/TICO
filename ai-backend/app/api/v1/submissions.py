"""Code analysis — endpoint 2.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M3.

The engine runs the code and sends the result here. This service never executes
student code — that boundary is what keeps the platform deterministic.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import mark
from app.core.auth import CurrentUser, get_current_user
from app.schemas.common import ErrorFamily, ErrorResponse
from app.schemas.submissions import AnalyzeRequest, AnalyzeResponse

router = APIRouter(prefix="/submissions", tags=["analysis"])


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
    summary="Classify a failed submission",
    description=(
        "Returns a closed `family` for the numbers, an **open** snake_case `tag` for "
        "the hint cache, and a one-sentence `misconception` for TICO's prose.\n\n"
        "The stub recognises the `=` vs `==` mistake in the submitted code and returns "
        "`assignment_vs_comparison`; anything else comes back as an unrecognised tag so "
        "the client can see both paths."
    ),
)
def analyze(
    body: AnalyzeRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> AnalyzeResponse:
    mark(response)

    data = fx.analysis()

    # Cheap heuristic so the stub reacts to what the client actually sends.
    code = body.code or ""
    looks_like_assignment_in_condition = "if " in code and "==" not in code and "=" in code
    if not looks_like_assignment_in_condition:
        data = {
            **data,
            "family": ErrorFamily.UNKNOWN,
            "tag": "unrecognised_pattern",
            "misconception": "The stub could not classify this yet.",
            "confidence": 0.31,
            "is_new_tag": True,
        }

    return AnalyzeResponse(**data)
