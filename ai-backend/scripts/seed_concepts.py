"""Seed the concept spine: the fixed, linear order every student walks.

    python scripts/seed_concepts.py            # insert or update
    python scripts/seed_concepts.py --check    # report drift, change nothing

Idempotent — safe to run repeatedly. Matches on `slug`, so re-running updates names and
ordering rather than creating duplicates.

**Why this lives here and not in `client/prisma/seed.ts`.** Prisma owns the *schema*;
these are *rows*. Seeding through SQLAlchemy keeps the change inside `ai-backend/`, and
concepts are the AI service's own vocabulary — they exist because mastery, scaffolding and
lesson plans need an axis to measure along. The client reads them; it does not define them.

The order is FIXED and it is the whole roadmap. `sequence_order` is a sort column, not a
prerequisite graph: there is no branching, so a DAG would be a more complicated way to
express the same straight line. Per-student variation lives in `lesson_plans`, where a
lesson can be marked OPTIONAL with a reason — never here.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("JWT_SECRET", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models_tables import Concept  # noqa: E402

#: The MVP spine. Four concepts, in the only order they can be taught in.
#:
#: `id` is set explicitly rather than generated. These are referenced from world
#: manifests, mission templates and seed data by name, and a cuid that changes every time
#: someone reseeds would break all of it. Stable ids are the point.
CONCEPTS: list[dict] = [
    {
        "id": "variables",
        "slug": "variables",
        "name": "Variables",
        "name_ar": "المتغيرات",
        "description": (
            "Storing a value and giving it a name. Everything else needs this, which is "
            "why it is first and why it is carried by almost every later exercise."
        ),
        "sequence_order": 1,
    },
    {
        "id": "conditionals",
        "slug": "conditionals",
        "name": "Conditionals",
        "name_ar": "الشرط",
        "description": (
            "Doing one thing or another depending on a value. The first place a student "
            "meets `=` versus `==`, which is the most common mistake in the whole track."
        ),
        "sequence_order": 2,
    },
    {
        "id": "loops",
        "slug": "loops",
        "name": "Loops",
        "name_ar": "التكرار",
        "description": (
            "Repeating work without repeating code. Depends on conditionals: a loop is a "
            "condition checked over and over."
        ),
        "sequence_order": 3,
    },
    {
        "id": "functions",
        "slug": "functions",
        "name": "Functions",
        "name_ar": "الدوال",
        "description": (
            "Naming a piece of work so it can be reused. Last because it composes all "
            "three of the others."
        ),
        "sequence_order": 4,
    },
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report differences, write nothing")
    args = ap.parse_args()

    with SessionLocal() as db:
        existing = {c.slug: c for c in db.execute(select(Concept)).scalars()}
        created, updated, unchanged = [], [], []

        for spec in CONCEPTS:
            row = existing.get(spec["slug"])
            if row is None:
                created.append(spec["slug"])
                if not args.check:
                    db.add(Concept(**spec))
                continue

            diffs = [f for f in ("name", "name_ar", "description", "sequence_order")
                     if getattr(row, f) != spec[f]]
            if diffs:
                updated.append(f"{spec['slug']} ({', '.join(diffs)})")
                if not args.check:
                    for f in diffs:
                        setattr(row, f, spec[f])
            else:
                unchanged.append(spec["slug"])

        orphans = sorted(set(existing) - {c["slug"] for c in CONCEPTS})

        if args.check:
            drift = created or updated or orphans
            print(f"  would create : {created or 'none'}")
            print(f"  would update : {updated or 'none'}")
            print(f"  unchanged    : {unchanged or 'none'}")
            if orphans:
                # Never deleted automatically: a concept row may already be referenced by
                # mastery scores and exercise links, and dropping it would cascade.
                print(f"  in DB but not in this file: {orphans}  <- remove by hand if wrong")
            return 1 if drift else 0

        db.commit()

        print(f"  created   : {created or 'none'}")
        print(f"  updated   : {updated or 'none'}")
        print(f"  unchanged : {unchanged or 'none'}")
        if orphans:
            print(f"  left alone: {orphans}  (may already have mastery rows pointing at them)")

        print("\n  the roadmap, in order:")
        for c in db.execute(select(Concept).order_by(Concept.sequence_order)).scalars():
            print(f"    {c.sequence_order}. {c.slug:14} {c.name_ar}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
