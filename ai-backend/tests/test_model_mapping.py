"""The SQLAlchemy models must match the schema Prisma actually created.

Keeping the two in step is manual, and a mismatch does not fail at migration time — it
fails at runtime, on a query, probably in front of someone. This test reads the real
generated SQL in `client/prisma/migrations/` and compares it column by column, so drift
turns into a red build instead.

If this fails after someone edits `schema.prisma`, the models are the thing to fix.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.models_tables import Base

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO_ROOT / "client" / "prisma" / "migrations"

pytestmark = pytest.mark.skipif(
    not MIGRATIONS.exists(), reason="client/prisma/migrations not present"
)


def _tables_from_migrations() -> dict[str, set[str]]:
    """Parse `CREATE TABLE` and `ADD COLUMN` out of every migration, in order."""
    tables: dict[str, set[str]] = {}
    for sql_file in sorted(MIGRATIONS.glob("*/migration.sql")):
        sql = sql_file.read_text(encoding="utf-8")

        for table, body in re.findall(
            r'CREATE TABLE "(\w+)"\s*\((.*?)\n\);', sql, re.DOTALL
        ):
            cols = set(re.findall(r'^\s+"(\w+)"\s', body, re.MULTILINE))
            tables.setdefault(table, set()).update(cols)

        # Prisma emits ONE `ALTER TABLE` with many comma-separated `ADD COLUMN` clauses:
        #
        #   ALTER TABLE "submissions" ADD COLUMN "attempt_number" INTEGER NOT NULL,
        #   ADD COLUMN "error_family" "ErrorFamily",
        #   ADD COLUMN "session_id" TEXT;
        #
        # Matching `ALTER TABLE ... ADD COLUMN` per line finds only the first and silently
        # drops the rest, which made this test claim four real columns did not exist.
        # So: capture the whole statement, then every ADD COLUMN inside it.
        for table, body in re.findall(
            r'ALTER TABLE "(\w+)"\s+((?:.|\n)*?);', sql
        ):
            cols = re.findall(r'ADD COLUMN\s+"(\w+)"', body)
            if cols:
                tables.setdefault(table, set()).update(cols)

    return tables


DB = _tables_from_migrations()


def test_migrations_were_parsed():
    assert DB, "no CREATE TABLE found — has the parser drifted from Prisma's output?"


@pytest.mark.parametrize("model", Base.registry.mappers, ids=lambda m: m.class_.__name__)
def test_model_table_exists_in_the_database(model):
    table = model.local_table.name
    assert table in DB, (
        f"{model.class_.__name__} maps to '{table}', which no migration creates. "
        f"Known tables: {sorted(DB)}"
    )


@pytest.mark.parametrize("model", Base.registry.mappers, ids=lambda m: m.class_.__name__)
def test_every_mapped_column_exists(model):
    table = model.local_table.name
    if table not in DB:
        pytest.skip(f"{table} not migrated yet")
    mapped = {c.name for c in model.local_table.columns}
    missing = mapped - DB[table]
    assert not missing, (
        f"{model.class_.__name__} maps columns that do not exist on '{table}': "
        f"{sorted(missing)}. Real columns: {sorted(DB[table])}"
    )


def test_every_migrated_table_has_a_model():
    """The other direction: a table nobody modelled is invisible to this service.

    Without this, adding a table to schema.prisma and forgetting the SQLAlchemy model
    fails silently — the AI service simply cannot see it, and nothing says so.
    """
    modelled = {m.local_table.name for m in Base.registry.mappers}
    unmodelled = set(DB) - modelled - {"_prisma_migrations"}
    assert not unmodelled, (
        f"migrated but not modelled: {sorted(unmodelled)}. "
        "Add the model to app/models_tables/ and export it from __init__.py."
    )


def test_no_column_is_silently_unmapped():
    """A column that exists but is not mapped is data the service cannot read.

    This caught five real ones: `submissions` gained `attempt_number`, `error_family`,
    `error_tag`, `hints_used_before` and `session_id` in the AI migration, and the model
    still described the original eight columns. Two of those are the only columns this
    service is supposed to *write*.
    """
    gaps = {}
    for m in Base.registry.mappers:
        table = m.local_table.name
        if table not in DB:
            continue
        unmapped = DB[table] - {c.name for c in m.local_table.columns}
        if unmapped:
            gaps[m.class_.__name__] = sorted(unmapped)
    assert not gaps, f"columns exist in the database but no model maps them: {gaps}"


def test_every_pg_enum_is_owned_by_prisma():
    """`create_type=False` on all of them, or SQLAlchemy tries to CREATE TYPE and fails."""
    from app.models_tables.enums import ALL_PG_ENUMS

    for name, pg_type in ALL_PG_ENUMS.items():
        assert pg_type.name == name, f"{name}: type name must match Prisma exactly"
        assert pg_type.create_type is False, f"{name}: Prisma owns the type"


def test_storage_enums_agree_with_the_wire_enums():
    """`models_tables.enums` and `schemas.common` are duplicated on purpose — but equal.

    They are separate so the storage contract and the wire contract can diverge
    deliberately. Diverging *accidentally* is the bug this catches: it is what made every
    enum value wrong in the first place, and it would fail on a database write rather
    than at request validation.
    """
    from app.models_tables import enums as storage
    from app.schemas import common as wire

    shared = [
        "Phase", "SessionOutcome", "ScaffoldLevel", "ErrorFamily",
        "LessonRequirement", "DecidedBy", "SkillBand",
    ]
    for name in shared:
        s = {m.value for m in getattr(storage, name)}
        w = {m.value for m in getattr(wire, name)}
        assert s == w, f"{name}: storage {sorted(s)} != wire {sorted(w)}"


def test_camelcase_columns_are_mapped_to_snake_case_attributes():
    """The convention that makes Python pythonic over a camelCase schema."""
    from app.models_tables import Exercise, User

    assert User.__table__.c.avatarUrl.name == "avatarUrl"
    assert User.avatar_url.key == "avatar_url"
    assert Exercise.__table__.c.starterCode.name == "starterCode"
    assert Exercise.starter_code.key == "starter_code"


def test_we_never_create_tables():
    """This service owns no DDL. Prisma does.

    A stray `create_all` would happily invent tables that then diverge from the real
    schema, so the intent is pinned here. Parsed with AST rather than grepped, so
    documentation that merely mentions `create_all` does not trip it.
    """
    import ast

    offenders = []
    for path in (Path(__file__).resolve().parents[1] / "app").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in {"create_all", "drop_all"}
            ):
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert not offenders, f"DDL call found — Prisma owns the schema: {offenders}"


def test_enum_types_match_prisma_type_names():
    """Prisma creates the Postgres type with the model's exact capitalisation."""
    from app.models_tables.enums import DIFFICULTY, ROLE, SUBMISSION_STATUS

    for pg_type, expected in [
        (ROLE, "Role"),
        (DIFFICULTY, "Difficulty"),
        (SUBMISSION_STATUS, "SubmissionStatus"),
    ]:
        assert pg_type.name == expected
        assert pg_type.create_type is False, (
            f"{expected}: create_type must be False — Prisma owns the type"
        )
