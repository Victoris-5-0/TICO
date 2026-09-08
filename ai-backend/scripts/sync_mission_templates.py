"""Project the world manifests into `mission_templates` rows.

    python scripts/sync_mission_templates.py            # write
    python scripts/sync_mission_templates.py --check    # report drift, change nothing

The manifests are the authored source; `mission_templates` is the database's view of
them, so that a generated mission can carry a foreign key back to the bounds it was
generated within. Run this after editing any manifest, and after the client seed creates
the tracks.

Idempotent — matched on `(track_id, mechanic_id)`.

## Why the database needs a copy at all

The YAML could be read at generation time and never stored. It is stored because
`generated_missions.template_id` has to point at something durable: six months from now,
asked why a child was given a particular mission, "because mechanic `threshold_decision`
in the manifest as it stood on 7 September" is an answer. A file that has since been
edited is not.

`manifest_version` is a content hash of the source file for the same reason.

## Slugs and ids

Manifests name concepts by **slug** (`variables`), because a human writes them and a cuid
is not writable. The database references them by **id**, which the client seed generates.
This script is where the two meet — every slug is resolved against `concepts`, and an
unknown one is a hard error rather than a null foreign key.
"""

from __future__ import annotations

import argparse
import hashlib
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
from app.manifests import all_worlds  # noqa: E402
from app.manifests.loader import WORLDS_DIR  # noqa: E402
from app.models_tables import Concept, MissionTemplate, Track  # noqa: E402


def manifest_version(world_id: str) -> str:
    """Short content hash of the manifest file. Changes when the file changes."""
    path = WORLDS_DIR / f"{world_id}.yaml"
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report differences, write nothing")
    args = ap.parse_args()

    worlds = all_worlds()

    with SessionLocal() as db:
        tracks = {t.slug: t for t in db.execute(select(Track)).scalars()}
        concepts = {c.slug: c for c in db.execute(select(Concept)).scalars()}

        if not tracks:
            print("  tracks table is empty.")
            print("  Run the client seed first:  cd client && pnpm db:seed")
            return 1
        if not concepts:
            print("  concepts table is empty. Run the client seed first.")
            return 1

        existing = {
            (t.track_id, t.mechanic_id): t
            for t in db.execute(select(MissionTemplate)).scalars()
        }

        created, updated, unchanged, skipped = [], [], [], []

        for world in worlds:
            track = tracks.get(world.track_slug)
            if track is None:
                skipped.append(
                    f"{world.id}: no track with slug '{world.track_slug}' "
                    f"(have: {sorted(tracks)})"
                )
                continue

            version = manifest_version(world.id)

            for mech in world.mechanics:
                target = concepts.get(mech.target_concept)
                if target is None:
                    print(
                        f"  ERROR {world.id}/{mech.id}: target_concept "
                        f"'{mech.target_concept}' is not a concept slug in the database"
                    )
                    return 1

                carried_ids = []
                for slug in mech.carried_concepts:
                    c = concepts.get(slug)
                    if c is None:
                        print(
                            f"  ERROR {world.id}/{mech.id}: carried concept "
                            f"'{slug}' is not in the database"
                        )
                        return 1
                    carried_ids.append(c.id)

                desired = {
                    "target_concept_id": target.id,
                    "carried_concept_ids": carried_ids,
                    "scenes": list(mech.scenes),
                    # `props_required` predates the manifest rewrite. It now carries
                    # `vocabulary_used` — the closed set of nouns this mechanic may name.
                    # Renaming the column needs a Prisma migration and a client change,
                    # which is not worth it for a name.
                    "props_required": list(mech.vocabulary_used),
                    "param_schema": mech.param_schema,
                    "difficulty_band": mech.difficulty_band,
                    "manifest_version": version,
                }

                row = existing.get((track.id, mech.id))
                label = f"{world.id}/{mech.id}"

                if row is None:
                    created.append(label)
                    if not args.check:
                        db.add(MissionTemplate(track_id=track.id, mechanic_id=mech.id, **desired))
                    continue

                diffs = [k for k, v in desired.items() if getattr(row, k) != v]
                if diffs:
                    updated.append(f"{label} ({', '.join(diffs)})")
                    if not args.check:
                        for k in diffs:
                            setattr(row, k, desired[k])
                else:
                    unchanged.append(label)

        # A template whose mechanic was deleted from the manifest is left alone: existing
        # generated_missions still point at it, and deleting would cascade them away.
        live = {
            (tracks[w.track_slug].id, m.id)
            for w in worlds
            if w.track_slug in tracks
            for m in w.mechanics
        }
        orphans = [
            f"{t.mechanic_id}" for key, t in existing.items() if key not in live
        ]

        if args.check:
            print(f"  would create : {created or 'none'}")
            print(f"  would update : {updated or 'none'}")
            print(f"  unchanged    : {len(unchanged)}")
            if orphans:
                print(f"  orphaned     : {orphans}  (mechanic gone from the manifest)")
            for s in skipped:
                print(f"  SKIPPED      : {s}")
            return 1 if (created or updated) else 0

        db.commit()

        print(f"  created   : {created or 'none'}")
        print(f"  updated   : {updated or 'none'}")
        print(f"  unchanged : {len(unchanged)}")
        if orphans:
            print(f"  orphaned  : {orphans}  (left in place; generated missions reference them)")
        for s in skipped:
            print(f"  SKIPPED   : {s}")

        total = db.execute(select(MissionTemplate)).scalars().all()
        print(f"\n  {len(total)} mission templates now available to generation:")
        by_concept: dict[str, list[str]] = {}
        id_to_slug = {c.id: c.slug for c in concepts.values()}
        for t in sorted(total, key=lambda r: r.difficulty_band):
            by_concept.setdefault(id_to_slug.get(t.target_concept_id, "?"), []).append(
                f"{t.mechanic_id}(d{t.difficulty_band})"
            )
        for slug in ("variables", "conditionals", "loops", "functions"):
            if slug in by_concept:
                print(f"    {slug:14} {', '.join(by_concept[slug])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
