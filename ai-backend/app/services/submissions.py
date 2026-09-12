"""Classify one failed submission.

    own the session  ->  read the tag vocabulary  ->  classify  ->  record the tag
                                                                ->  stamp the submission

## This service never runs student code

The engine runs it in the browser and sends the result here. That boundary is what keeps
this service deterministic and is why `AnalyzeRequest` carries `error_text`,
`expected_output` and `actual_output` rather than something to execute.

## The two halves of a classification

`error_family` is **closed** — seven values, an enum, safe to count and chart.
`error_tag` is **open** — a snake_case label the model may coin. The prompt carries the
tags seen so far, so the vocabulary grows out of real students instead of being guessed in
advance, and a tag that turns out to be common becomes a hint-cache key that pays for
itself many times over.

The two are not redundant. The family answers "how are our students failing this month";
the tag answers "what exactly do we say to this child".
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.ai.chains.classify_error import classify_error
from app.queries import ai_log, error_tags as tag_q, sessions as session_q, users
from app.schemas.submissions import AnalyzeRequest, AnalyzeResponse

log = logging.getLogger(__name__)


class SessionNotFound(RuntimeError):
    """No such session for this student. A 404, and deliberately not a 403 — see hints.py."""


def analyze(db: Session, *, user_id: str, body: AnalyzeRequest) -> AnalyzeResponse:
    """Classify a failure and remember the tag it produced."""
    users.ensure(db, user_id)

    session = session_q.get_owned(db, body.session_id, user_id)
    if session is None:
        raise SessionNotFound(f"no session '{body.session_id}' for this student")

    known = tag_q.vocabulary(db)

    result = classify_error(
        code=body.code,
        error_text=body.error_text,
        expected_output=body.expected_output,
        actual_output=body.actual_output,
        existing_tags=known,
        # The starter code, so the classifier can tell "broke the scaffold" apart from
        # "got their own part wrong". Those two need different hints.
        scaffold_code=_starter_code(db, session),
    )

    tag_q.observe(db, result.error_tag, result.error_family, result.misconception)

    # The submission row is the client's, except for these two columns. Stamping them is
    # what lets the client show a failure's diagnosis without asking this service again.
    if body.submission_id:
        _stamp(db, body.submission_id, result)

    ai_log.log(
        db,
        capability=ai_log.CLASSIFY,
        user_id=user_id,
        session_id=body.session_id,
        model=None,
        status=ai_log.SUCCESS,
    )
    db.commit()
    return result


def _starter_code(db: Session, session) -> str | None:
    """The scaffold the student started from, when the session points at one."""
    from app.models_tables import GeneratedMission

    mission_id = getattr(session, "generated_mission_id", None)
    if not mission_id:
        return None
    mission = db.get(GeneratedMission, mission_id)
    return getattr(mission, "starting_code", None)


def _stamp(db: Session, submission_id: str, result: AnalyzeResponse) -> None:
    """Write the diagnosis onto the submission row.

    Never raises. A submission id that does not exist means the engine has not written its
    row yet, which is a race and not an error — the student still gets their answer.
    """
    from app.models_tables import Submission

    row = db.get(Submission, submission_id)
    if row is None:
        log.info("submission %r not found; classification returned but not stamped", submission_id)
        return
    row.error_family = result.error_family
    row.error_tag = result.error_tag
    # The sentence, not only the label. It used to be returned to the caller and dropped,
    # so a teacher could see that a mistake repeated but never why the child made it.
    row.misconception = result.misconception
    db.flush()
