"""Engine, session factory and the `get_db` dependency.

Synchronous SQLAlchemy on psycopg2, as in the Sanjeev course. This is a feature: the
asyncpg prepared-statement failure against a pgbouncer session pooler does not apply.

This service creates no tables and owns no migration history — Prisma does that from
`client/`. SQLAlchemy here is a client of a schema someone else defines.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,  # the pooler drops idle connections; check before handing one out
    pool_size=5,
    max_overflow=5,
    pool_recycle=1800,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
