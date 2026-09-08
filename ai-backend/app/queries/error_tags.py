"""The open half of error classification, read and written.

`error_tags` starts empty and fills itself. The classifier prompt carries the tags seen so
far; the model reuses one if it fits and otherwise coins a new snake_case tag. That is why
this table is read *before* every classification and written *after* — the vocabulary is
built out of real students rather than guessed in advance.

`count` is the number worth watching. A spike in new tags means students are hitting
something nobody anticipated, which is a content problem long before it is a model problem.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models_tables import ErrorTag
from app.models_tables.enums import ErrorFamily

log = logging.getLogger(__name__)

#: How many tags to put in front of the model. The prompt has to stay small, and a tag
#: nobody has hit in months is not worth the tokens — the ordering below is by how often
#: the tag actually happens, so the ones a student is likely to hit come first.
VOCABULARY_LIMIT = 60


def vocabulary(db: Session, limit: int = VOCABULARY_LIMIT) -> list[str]:
    """The tags seen so far, most frequent first."""
    rows = db.execute(
        select(ErrorTag.tag).order_by(ErrorTag.count.desc(), ErrorTag.tag).limit(limit)
    ).scalars()
    return list(rows)


def observe(db: Session, tag: str, family: ErrorFamily, misconception: str | None = None) -> None:
    """Record that this tag just happened.

    Never raises. A classification that succeeded must not be thrown away because the
    bookkeeping row could not be written — the student still needs their answer, and the
    submission row already carries the tag.
    """
    try:
        row = db.get(ErrorTag, tag)
        if row is None:
            db.add(
                ErrorTag(
                    tag=tag,
                    family=family,
                    # The model's one-sentence diagnosis is the best description this tag
                    # will ever get, and it is only available the first time.
                    description=misconception,
                    count=1,
                )
            )
        else:
            row.count += 1
        db.flush()
    except Exception:  # noqa: BLE001 - bookkeeping must never break classification
        log.warning("could not record error tag %r", tag, exc_info=True)
        db.rollback()
