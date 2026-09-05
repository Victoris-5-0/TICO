import os

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

# No real key in tests. The router must never make a live call.
os.environ["GOOGLE_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
