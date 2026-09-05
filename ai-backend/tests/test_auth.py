"""Auth: dev mode is convenient, but it must be impossible in production.

The stub endpoints run without a token so the client can integrate before the auth
question is settled. These tests pin the boundaries of that convenience.
"""

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core import auth
from app.core.auth import CurrentUser, get_current_user, require_self

SECRET = "unit-test-secret"


def _creds(token: str):
    from fastapi.security import HTTPAuthorizationCredentials

    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_dev_mode_returns_a_demo_user_when_no_secret(monkeypatch):
    monkeypatch.setattr(auth.settings, "supabase_url", "", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", "", raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    user = get_current_user(creds=None)
    assert user.is_demo is True
    assert user.id == auth.DEMO_USER_ID


def test_production_without_a_secret_refuses_to_serve(monkeypatch):
    """The guard that stops dev mode ever shipping."""
    monkeypatch.setattr(auth.settings, "supabase_url", "", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", "", raising=False)
    monkeypatch.setattr(auth.settings, "environment", "production", raising=False)
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=None)
    assert exc.value.status_code == 503


def test_a_valid_token_is_accepted(monkeypatch):
    monkeypatch.setattr(auth.settings, "supabase_url", "", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", SECRET, raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    token = jwt.encode(
        {"sub": "real-user-9", "email": "n@tico.dev", "aud": "authenticated"},
        SECRET,
        algorithm="HS256",
    )
    user = get_current_user(creds=_creds(token))
    assert user.id == "real-user-9"
    assert user.is_demo is False


def test_a_token_signed_with_the_wrong_key_is_rejected(monkeypatch):
    monkeypatch.setattr(auth.settings, "supabase_url", "", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", SECRET, raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    token = jwt.encode(
        {"sub": "attacker", "aud": "authenticated"}, "not-the-secret", algorithm="HS256"
    )
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=_creds(token))
    assert exc.value.status_code == 401


def test_missing_token_is_rejected_once_a_secret_exists(monkeypatch):
    monkeypatch.setattr(auth.settings, "supabase_url", "", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", SECRET, raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=None)
    assert exc.value.status_code == 401


def test_ownership_is_enforced_for_real_users(monkeypatch):
    """The check that stops one student reading another's progress."""
    monkeypatch.setattr(auth.settings, "supabase_url", "", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", SECRET, raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    real = CurrentUser(id="student-a", is_demo=False)

    require_self("student-a", real)  # own data: fine

    with pytest.raises(HTTPException) as exc:
        require_self("student-b", real)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------- asymmetric mode
# Supabase's current default: ES256 signed by a private key we never see, verified
# locally against the public keys at <SUPABASE_URL>/auth/v1/jwks.


def _es256_keypair_and_jwks(kid: str = "test-key"):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from jose import jwk

    key = ec.generate_private_key(ec.SECP256R1())
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = (
        key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    public_jwk = jwk.construct(public_pem, algorithm="ES256").to_dict()
    public_jwk = {
        k: (v.decode() if isinstance(v, bytes) else v) for k, v in public_jwk.items()
    }
    public_jwk.update({"kid": kid, "use": "sig", "alg": "ES256"})
    return private_pem, {"keys": [public_jwk]}


def test_asymmetric_es256_token_is_accepted(monkeypatch):
    private_pem, jwks = _es256_keypair_and_jwks()
    monkeypatch.setattr(auth.settings, "supabase_url", "https://demo.supabase.co", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", "", raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    monkeypatch.setattr(auth, "_fetch_jwks", lambda force=False: jwks)

    token = jwt.encode(
        {"sub": "supabase-user-1", "email": "n@tico.dev", "aud": "authenticated"},
        private_pem,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )
    user = get_current_user(creds=_creds(token))
    assert user.id == "supabase-user-1"
    assert user.is_demo is False


def test_es256_token_from_a_different_key_is_rejected(monkeypatch):
    _, published_jwks = _es256_keypair_and_jwks()
    attacker_pem, _ = _es256_keypair_and_jwks(kid="test-key")
    monkeypatch.setattr(auth.settings, "supabase_url", "https://demo.supabase.co", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", "", raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    monkeypatch.setattr(auth, "_fetch_jwks", lambda force=False: published_jwks)

    token = jwt.encode(
        {"sub": "attacker", "aud": "authenticated"},
        attacker_pem,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=_creds(token))
    assert exc.value.status_code == 401


def test_supabase_url_alone_is_enough_to_leave_dev_mode(monkeypatch):
    """A project on asymmetric keys has no shared secret at all."""
    monkeypatch.setattr(auth.settings, "supabase_url", "https://demo.supabase.co", raising=False)
    monkeypatch.setattr(auth.settings, "jwt_secret", "", raising=False)
    monkeypatch.setattr(auth.settings, "environment", "development", raising=False)
    with pytest.raises(HTTPException) as exc:
        get_current_user(creds=None)
    assert exc.value.status_code == 401, "must demand a token, not fall back to demo"


def test_jwks_url_is_derived_correctly(monkeypatch):
    """The well-known path, verified against a live Supabase project.

    This test previously asserted `/auth/v1/jwks`, which is wrong — it 404s. Because a
    failed JWKS fetch silently falls through to the HS256 branch, the only symptom is
    every authenticated request returning 401 with nothing in the logs to explain it. The
    test agreed with the code, so both were wrong together and neither could catch it.
    """
    monkeypatch.setattr(auth.settings, "supabase_url", "https://abc.supabase.co/", raising=False)
    assert auth.settings.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
