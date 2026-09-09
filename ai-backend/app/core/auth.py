"""Validate Better Auth sessions and enforce resource ownership.

Next.js issues opaque session tokens through Better Auth. Both services share the
Prisma-owned PostgreSQL database, so this service validates each bearer token by
looking up a live session and its user. It never issues credentials.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models_tables import AuthSession
from app.config import settings

log = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)
DEMO_USER_ID = "demo-student-1"

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    headers={"WWW-Authenticate": "Bearer"},
)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None = None
    role: str | None = None
    is_demo: bool = False


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if creds is None and settings.allow_demo_auth and not settings.is_production:
        return CurrentUser(id=DEMO_USER_ID, email="demo@tico.dev", is_demo=True)
    if creds is None or creds.scheme.lower() != "bearer":
        raise _CREDENTIALS_ERROR

    try:
        session = db.scalar(
            select(AuthSession)
            .options(joinedload(AuthSession.user))
            .where(
                AuthSession.token == creds.credentials,
                AuthSession.expires_at > func.now(),
            )
        )
    except SQLAlchemyError as exc:
        log.error("Could not validate the authentication session: %s", exc.__class__.__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is unavailable.",
        ) from exc

    if session is None:
        raise _CREDENTIALS_ERROR

    return CurrentUser(
        id=session.user.id,
        email=session.user.email,
        role=session.user.role.value if hasattr(session.user.role, "value") else str(session.user.role),
    )


def require_self(student_id: str, user: CurrentUser) -> None:
    """A student may only access resources owned by their verified user ID."""
    if user.is_demo and settings.allow_demo_auth and not settings.is_production:
        return
    if student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own progress.",
        )
