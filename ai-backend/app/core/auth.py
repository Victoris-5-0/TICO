"""Token verification and the ownership check.

Two rules this module exists to enforce:

1. **We verify, we never issue.** No user or password table lives in this service.

2. **This service bypasses row-level security.** It connects with credentials that are not
   the student's, so the database will not stop one student reading another's data.
   Authorisation has to be re-done here, per request, from the verified token. Every
   endpoint that takes a `session_id` or a `student_id` must call `require_owned_session`
   or `require_self` — not doing so is a data leak, not a style problem.

UNCONFIRMED: this assumes Supabase Auth issues the token (HS256 over a shared secret). If
the client issues its own sessions via NextAuth/Better Auth over Prisma, only this file
changes — that is why the verification lives behind `CurrentUser`.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

bearer = HTTPBearer(auto_error=True)

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


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> CurrentUser:
    if not settings.jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth is not configured on this server.",
        )
    try:
        payload = jwt.decode(
            creds.credentials,
            settings.jwt_secret,
            algorithms=settings.jwt_algorithm_list,
            audience=settings.jwt_audience,
        )
    except JWTError:
        raise _CREDENTIALS_ERROR from None

    user_id = payload.get("sub")
    if not user_id:
        raise _CREDENTIALS_ERROR

    return CurrentUser(
        id=str(user_id),
        email=payload.get("email"),
        role=payload.get("role"),
    )


def require_self(student_id: str, user: CurrentUser) -> None:
    """Guard for `/students/{id}/...`. A student may only act on themselves."""
    if student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own progress.",
        )
