"""Check the SQLAlchemy models against a real, migrated database.

    python scripts/check_models_against_db.py

Exits non-zero on any mismatch. Run by CI against a throwaway Postgres that has just had
every migration applied, so it answers the question `test_model_mapping.py` cannot:
**does this actually work against a real server?**

The difference matters. `test_model_mapping.py` parses the migration SQL as text, which
is fast and needs no database, but it only ever compares strings — it cannot tell you that
an enum type resolves, that a foreign key points at a table that exists, or that a
relationship can be loaded. Those fail at runtime, in front of a user, and this catches
them at build time instead.

Three things are verified:

1. Every model's columns exist on the real table, and every real column is mapped.
   A column nobody maps is data the AI service silently cannot see.
2. Every table has a model. A migrated table with no model is invisible to this service.
3. Every model SELECTs and every relationship eager-loads against the live server, which
   is what proves enum types and foreign keys actually resolve.
"""

from __future__ import annotations

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

# The models import config, which requires DATABASE_URL. In CI it is the service
# container; locally it comes from .env.
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("JWT_SECRET", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

from sqlalchemy import create_engine, inspect, select  # noqa: E402
from sqlalchemy.orm import Session, configure_mappers, selectinload  # noqa: E402

from app.config import settings  # noqa: E402
from app.models_tables import Base  # noqa: E402

#: Prisma's own bookkeeping table. Not ours to model.
IGNORED = {"_prisma_migrations"}


def main() -> int:
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 30})
    insp = inspect(engine)

    live = {
        t: {c["name"] for c in insp.get_columns(t)}
        for t in insp.get_table_names(schema="public")
        if t not in IGNORED
    }
    mappers = sorted(Base.registry.mappers, key=lambda m: m.class_.__name__)

    if not live:
        print("FAIL: the database has no tables — were the migrations applied?")
        return 1

    print(f"models: {len(mappers)}   live tables: {len(live)}\n")
    problems: list[str] = []

    # 1. columns, both directions
    for m in mappers:
        table = m.local_table.name
        name = m.class_.__name__

        if table not in live:
            problems.append(f"{name} maps '{table}', which does not exist in the database")
            continue

        mapped = {c.name for c in m.local_table.columns}
        if missing := mapped - live[table]:
            problems.append(f"{name} maps columns not in '{table}': {sorted(missing)}")
        if unmapped := live[table] - mapped:
            problems.append(
                f"'{table}' has columns no model maps: {sorted(unmapped)} — "
                f"add them to {name} or the service cannot read them"
            )

    # 2. tables with no model
    modelled = {m.local_table.name for m in mappers}
    if orphans := set(live) - modelled:
        problems.append(
            f"migrated but not modelled: {sorted(orphans)} — "
            "add a model in app/models_tables/ and export it from __init__.py"
        )

    # 3. it has to actually run
    configure_mappers()
    rel_count = 0
    with Session(engine) as s:
        for m in mappers:
            try:
                s.execute(select(m.class_).limit(1)).all()
            except Exception as exc:  # noqa: BLE001 - reported, not swallowed
                problems.append(f"SELECT on {m.class_.__name__} failed: {exc}")
            for rel in m.relationships:
                rel_count += 1
                try:
                    s.execute(
                        select(m.class_).options(selectinload(rel.class_attribute)).limit(1)
                    ).all()
                except Exception as exc:  # noqa: BLE001
                    problems.append(
                        f"loading {m.class_.__name__}.{rel.key} failed: {exc}"
                    )

    if problems:
        print("FAILED\n")
        for p in problems:
            print(f"  - {p}")
        return 1

    columns = sum(len(v) for v in live.values())
    print(f"  {len(mappers)} models, {columns} columns, {rel_count} relationships")
    print("  every column mapped, every table modelled, every query ran")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
