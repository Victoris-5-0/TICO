import os
import pathlib

# Settings are read at import time, so the environment must be set before `app` is
# imported.
#
# These are assigned, not `setdefault`, on purpose: environment variables outrank the
# .env file in pydantic-settings, so this pins the test configuration regardless of what
# a developer happens to have in their local .env. Without it, adding SUPABASE_URL to
# .env silently switches auth out of dev mode and every stub test 401s.
os.environ["DATABASE_URL"] = "postgresql+psycopg2://test:test@localhost:5432/test"
os.environ["ENVIRONMENT"] = "development"

# Empty auth config = dev mode, which is how the client team drives the stubs.
# `test_auth.py` covers the enforcing paths by monkeypatching settings directly.
os.environ["SUPABASE_URL"] = ""
os.environ["JWT_SECRET"] = ""

# No real key in tests. The router must never make a live call by accident.
#
# `TICO_LIVE_MODEL=1` is the deliberate exception, for the handful of tests marked `slow`
# that exist to prove the pipeline really works end to end. The key is stashed rather than
# discarded so those tests can put it back for their own duration.
REAL_GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
LIVE_MODEL = os.environ.get("TICO_LIVE_MODEL") == "1"
os.environ["GOOGLE_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

from app.main import app



@pytest.fixture
def live_model():
    """Restore the real API key for one test. Requires `TICO_LIVE_MODEL=1`.

    Reads the key from `.env` when the environment does not carry one, because that is
    where a developer's key actually lives — and `conftest` blanked the environment copy
    before `app.config` ever saw it.
    """
    if not LIVE_MODEL:
        pytest.skip("set TICO_LIVE_MODEL=1 to run tests that call a real model")

    key = REAL_GOOGLE_API_KEY
    if not key:
        env_file = pathlib.Path(__file__).resolve().parents[1] / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("GOOGLE_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
                    break
    if not key:
        pytest.skip("TICO_LIVE_MODEL=1 but no GOOGLE_API_KEY to use")

    from app.config import settings

    before = settings.google_api_key
    settings.google_api_key = key
    try:
        yield key
    finally:
        settings.google_api_key = before


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def data(response):
    """Unwrap the `{data, meta}` envelope.

    Deliberately the same `data.data || data` fallback the client's `fetchAi` uses, so
    the tests exercise the response exactly as the client sees it. If the envelope ever
    regresses, these tests fail in the same way the client would break.
    """
    payload = response.json()
    if isinstance(payload, dict) and "data" in payload and "meta" in payload:
        return payload["data"]
    return payload


def meta(response) -> dict:
    payload = response.json()
    return payload.get("meta", {}) if isinstance(payload, dict) else {}
