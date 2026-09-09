"""Better Auth session validation and ownership boundaries."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import SQLAlchemyError

from app.core import auth
from app.core.auth import CurrentUser, get_current_user, require_self


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class FakeDb:
    def __init__(self, result=None, error: Exception | None = None):
        self.result = result
        self.error = error

    def scalar(self, _statement):
        if self.error:
            raise self.error
        return self.result


def test_a_live_database_session_is_accepted():
    user = SimpleNamespace(id="real-user-9", email="n@tico.dev", role=SimpleNamespace(value="STUDENT"))
    current = get_current_user(creds=_creds("opaque-session-token"), db=FakeDb(SimpleNamespace(user=user)))
    assert current == CurrentUser(id="real-user-9", email="n@tico.dev", role="STUDENT")


def test_missing_token_is_rejected(monkeypatch):
    monkeypatch.setattr(auth.settings, "allow_demo_auth", False, raising=False)
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=None, db=FakeDb())
    assert exc.value.status_code == 401


def test_unknown_or_expired_token_is_rejected():
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=_creds("not-live"), db=FakeDb())
    assert exc.value.status_code == 401


def test_database_failure_returns_service_unavailable():
    with pytest.raises(HTTPException) as exc:
        get_current_user(
            creds=_creds("opaque-session-token"),
            db=FakeDb(error=SQLAlchemyError("offline")),
        )
    assert exc.value.status_code == 503


def test_ownership_is_enforced_for_verified_users():
    user = CurrentUser(id="student-a")
    require_self("student-a", user)

    with pytest.raises(HTTPException) as exc:
        require_self("student-b", user)
    assert exc.value.status_code == 403
