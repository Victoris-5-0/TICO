"""Token verification and the ownership check.

Two rules this module exists to enforce:

1. **We verify, we never issue.** Supabase Auth owns login. No user or password table
   lives in this service.

2. **This service bypasses row-level security.** It connects to Postgres with
   credentials that are not the student's, so the database will not stop one student
   reading another's data. Authorisation has to be re-done here, per request, from the
   verified token. Every endpoint taking a `session_id` or `student_id` must call
   `require_self` — skipping it is a data leak, not a style problem.

TWO SIGNING MODES, BOTH SUPPORTED
---------------------------------
Supabase now defaults to **JWT Signing Keys**: asymmetric ES256, with the public keys
published at `<SUPABASE_URL>/auth/v1/jwks`. Older projects still use a **legacy shared
secret** with HS256. Which one a project uses depends on when it was created and whether
it has been migrated, so this module tries JWKS first and falls back to the secret.

Verification is local either way — no network call per request. The JWKS is fetched once
and cached, and refetched only when a token arrives with an unrecognised key id (which is
what a key rotation looks like from here).

DEV MODE
--------
While neither `SUPABASE_URL` nor `JWT_SECRET` is set and `ENVIRONMENT` is not production,
unauthenticated requests are accepted and served as a demo user, so the client team can
integrate against the stubs before auth is wired. **In production, missing auth config is
a hard 503**, so this cannot ship by accident.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

log = logging.getLogger(__name__)

# auto_error=False so a missing header reaches our handler, which decides whether dev
# mode applies rather than returning a bare 403.
bearer = HTTPBearer(auto_error=False)

DEMO_USER_ID = "demo-student-1"
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]
_JWKS_TTL_SECONDS = 600

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


# --------------------------------------------------------------------------- JWKS
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0


def _fetch_jwks(force: bool = False) -> dict | None:
    """Return Supabase's public keys, cached. None when JWKS is not configured."""
    global _jwks_cache, _jwks_fetched_at

    url = settings.jwks_url
    if not url:
        return None

    fresh = _jwks_cache is not None and (time.time() - _jwks_fetched_at) < _JWKS_TTL_SECONDS
    if fresh and not force:
        return _jwks_cache

    try:
        resp = httpx.get(url, timeout=5.0)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = time.time()
    except Exception as exc:  # network hiccup should not take auth down
        log.warning("Could not fetch JWKS from %s: %s", url, exc)
        # Serve the stale copy rather than failing every request.
    return _jwks_cache


def _decode_asymmetric(token: str) -> dict | None:
    jwks = _fetch_jwks()
    if not jwks:
        return None
    for attempt in (False, True):  # retry once with a forced refetch: key rotation
        keys = _fetch_jwks(force=attempt) if attempt else jwks
        if not keys:
            return None
        try:
            return jwt.decode(
                token,
                keys,
                algorithms=ASYMMETRIC_ALGORITHMS,
                audience=settings.jwt_audience,
            )
        except JWTError:
            if attempt:
                return None
    return None


def _decode_symmetric(token: str) -> dict | None:
    if not settings.jwt_secret:
        return None
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=settings.jwt_algorithm_list,
            audience=settings.jwt_audience,
        )
    except JWTError:
        return None


# --------------------------------------------------------------------------- deps
def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    if not settings.auth_configured:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Auth is not configured on this server.",
            )
        log.warning(
            "DEV MODE: no SUPABASE_URL and no JWT_SECRET, serving request as %s.",
            DEMO_USER_ID,
        )
        return CurrentUser(id=DEMO_USER_ID, email="demo@tico.dev", is_demo=True)

    if creds is None:
        raise _CREDENTIALS_ERROR

    payload = _decode_asymmetric(creds.credentials) or _decode_symmetric(creds.credentials)
    if payload is None:
        raise _CREDENTIALS_ERROR

    user_id = payload.get("sub")
    if not user_id:
        raise _CREDENTIALS_ERROR

    return CurrentUser(
        id=str(user_id),
        email=payload.get("email"),
        role=payload.get("role"),
    )


def require_self(student_id: str, user: CurrentUser) -> None:
    """Guard for `/students/{id}/...`. A student may only act on themselves.

    In dev mode this warns instead of raising, so the client can drive the stubs with
    whatever id it has. The moment real auth is configured, it enforces.
    """
    if student_id == user.id:
        return
    if user.is_demo and not settings.auth_configured and not settings.is_production:
        log.warning(
            "DEV MODE: allowing %s to act on %s. This would be a 403 in production.",
            user.id,
            student_id,
        )
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You can only access your own progress.",
    )
