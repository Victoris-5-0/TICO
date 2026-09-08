"""User lookup, and just-in-time provisioning.

## Why this service provisions users at all

Supabase Auth owns identity; `users` is our own table. A token can therefore be entirely
valid for someone who has no row yet — they signed up thirty seconds ago and their first
request happened to land here rather than on the Next.js side.

Every write this service makes hangs off `user_id`: `ai_interactions`, `generated_missions`,
`concept_mastery`, `practice_sessions`. Without a row, all of them fail on a foreign key,
and the student sees a 500 for having been new.

The client does the same thing on its side (`feat(auth): just-in-time user provisioning`).
Both services need it because either can be the first one a new student touches.

It also fixes dev mode, where `demo-student-1` is a fiction until something inserts it.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models_tables import User
from app.models_tables.enums import Role

log = logging.getLogger(__name__)


def get(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def ensure(db: Session, user_id: str, *, email: str | None = None, name: str | None = None) -> User:
    """Return the user, creating a minimal row if this is their first contact.

    The id is the Supabase subject, passed straight through — the two systems must agree
    on who someone is, and generating our own id here would guarantee they eventually
    disagree.

    Deliberately minimal: an id and an email placeholder. Names, avatars and roles are
    the client's to fill in from the OAuth profile, which this service never sees.
    """
    user = db.get(User, user_id)
    if user is not None:
        return user

    user = User(
        id=user_id,
        # A real address is not available here; the token carries a subject, not always
        # an email. Unique and obviously synthetic beats null on a NOT NULL column.
        email=email or f"{user_id}@provisioned.tico",
        name=name,
        role=Role.STUDENT,
        xp=0,
        streak=0,
    )
    db.add(user)
    db.flush()
    log.info("provisioned user %s on first contact with the AI service", user_id)
    return user
