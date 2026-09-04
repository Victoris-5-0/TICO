import os

# Settings are read at import time, so the environment must exist before `app` is
# imported. JWT_SECRET is deliberately left EMPTY: that puts the service in dev mode,
# which is how the client team drives the stubs before the auth question is settled.
# `test_auth.py` covers the enforcing path separately.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://test:test@localhost:5432/test")
os.environ.pop("JWT_SECRET", None)
os.environ.setdefault("ENVIRONMENT", "development")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
