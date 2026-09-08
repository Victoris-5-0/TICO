"""Health check.

Does a real database round-trip on purpose. A health endpoint that returns a static 200
tells you the process is alive and nothing else — it will happily report healthy while the
pooler connection is dead, which is exactly when you need to know.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas.common import Schema

router = APIRouter(tags=["health"])

#: Single source for the running version. FastAPI already carries it, so reading it here
#: means one place to bump rather than two that drift.
def app_version() -> str:
    from app.main import app

    return app.version


class HealthResponse(Schema):
    status: str
    environment: str
    database: str
    #: Which build is live. Asked for in the client's sequence diagram, and the first
    #: thing worth knowing when a deploy behaves like the previous one.
    version: str


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
        status_ = "ok"
    except SQLAlchemyError:
        database = "unreachable"
        status_ = "degraded"

    return HealthResponse(
        version=app_version(),
        status=status_,
        environment=settings.environment,
        database=database,
    )
