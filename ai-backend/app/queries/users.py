"""User lookup and defensive provisioning for internal service calls.

## Why this service provisions users at all

Better Auth owns identity and stores it directly in `users`. A valid public session
therefore always has a user row. The provisioning helper remains for internal mission
service calls and tests that run below the HTTP authentication boundary.

Every write this service makes hangs off `user_id`: `ai_interactions`, `generated_missions`,
`concept_mastery`, `practice_sessions`. Without a row, all of them fail on a foreign key,
and the student sees a 500 for having been new.

Public HTTP requests must never rely on this helper as authentication.
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

    The ID is supplied by the authenticated/internal caller; generating another ID here
    would detach the learning records from the application account.

    Deliberately minimal: an id and an email placeholder. Names, avatars and roles are
    the client's to fill in from the OAuth profile, which this service never sees.
    """
    user = db.get(User, user_id)
    if user is not None:
        return user

    user = User(
        id=user_id,
        # Internal callers may lack an email. Unique and visibly synthetic is safer than
        # null on the required column.
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
