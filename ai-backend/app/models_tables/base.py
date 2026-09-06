"""Declarative base for tables Prisma owns.

This service **creates nothing**. `client/prisma/schema.prisma` is the single source of
truth; these classes are a typed read/write view over tables that already exist. There is
no Alembic here and `Base.metadata.create_all()` must never be called.

TWO NAMING CONVENTIONS, AND THEY DIFFER
---------------------------------------
Prisma maps model names to snake_case plural TABLE names via `@@map("users")`, but leaves
FIELD names alone unless each one has its own `@map`. The existing migration proves it:

    CREATE TABLE "users" (
        "id" TEXT NOT NULL,
        "avatarUrl" TEXT,          <- camelCase, quoted
        "createdAt" TIMESTAMP(3)   <- camelCase, quoted
    );

So: **tables are snake_case, columns are camelCase.** Every model below therefore declares
a pythonic attribute name and passes the real column name as the first argument to
`mapped_column`, e.g.

    avatar_url: Mapped[str | None] = mapped_column("avatarUrl", Text)

Python code stays pythonic; the SQL stays exactly what Prisma made.
"""

from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Mirrors Prisma's own constraint naming so anything we ever reflect lines up.
NAMING_CONVENTION = {
    "ix": "%(table_name)s_%(column_0_name)s_idx",
    "uq": "%(table_name)s_%(column_0_name)s_key",
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
