"""Validate the world manifests against themselves and against the database.

    python scripts/check_manifests.py

A manifest is the closed set generation draws from, so an error here is not cosmetic: a
mechanic naming a scene that does not exist produces missions that fail validation at
runtime, and a `target_concept` that is not a real concept slug produces missions that
can never be scored.

Checks, in order of how much each one hurts:

  1. Every `target_concept` and `carried_concept` is a real `concepts.slug`.
  2. Every `track_slug` matches a real `tracks.slug`.
  3. Every scene a mechanic names exists in `scenes`.
  4. Every vocabulary entry a mechanic uses exists in `vocabulary`.
  5. Every `{placeholder}` in a template is satisfiable from `param_schema`, the
     vocabulary, or the known built-ins.
  6. Every carried concept has a `carried_scaffold` block, or scaffolding silently
     does nothing for it.

Database checks are skipped when no database is reachable, so this still runs offline.
"""

from __future__ import annotations

import os
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("JWT_SECRET", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

import yaml  # noqa: E402

WORLDS = pathlib.Path(__file__).resolve().parents[1] / "content" / "worlds"
#: Where the client keeps the artwork a manifest points at.
ASSETS = pathlib.Path(__file__).resolve().parents[2] / "client" / "public" / "assets"

#: Placeholders the composer supplies rather than the manifest declaring.
BUILT_IN = {
    "brief", "brief_ar", "carried_scaffold", "template_filled", "expected_sentence",
    "expected_sentence_2", "expected_report", "expected_report_empty", "sample_a", "sample_b", "sample_a2",
    "sample_b2", "sample_list", "list_total", "sample_numbers", "sample_queue",
    "sample_destination", "sample_place2", "sample_number", "single_number", "match_count", "product",
    "largest", "filtered", "busy_count", "night_sample", "day_sample", "above", "below",
    "threshold", "limit", "total",
}

problems: list[str] = []
notes: list[str] = []


def check_manifest(path: pathlib.Path) -> dict:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    name = path.name

    world = doc.get("world") or {}
    for field in ("id", "track_slug", "name_ar", "order"):
        if not world.get(field):
            problems.append(f"{name}: world.{field} is missing")

    scenes = {s["id"] for s in doc.get("scenes") or []}
    vocab = set((doc.get("vocabulary") or {}).keys())
    scaffolded = set((doc.get("carried_scaffold") or {}).keys())

    if not scenes:
        problems.append(f"{name}: no scenes — generation has nowhere to set a mission")
    if not vocab:
        problems.append(f"{name}: no vocabulary — nothing for generation to name")

    # Every asset a manifest names must actually exist. A scene pointing at missing
    # artwork renders blank, and nothing else in the pipeline would notice.
    if ASSETS.is_dir():
        for group in ("scenes", "characters"):
            for item in doc.get(group) or []:
                asset = item.get("asset")
                if asset and not (ASSETS / asset).exists():
                    problems.append(
                        f"{name}: {group[:-1]} '{item['id']}' points at missing artwork "
                        f"'{asset}'"
                    )
    else:
        notes.append("client/public/assets not found — artwork checks skipped")

    # Scenes may only advertise vocabulary that exists.
    for s in doc.get("scenes") or []:
        for v in s.get("supports_vocabulary") or []:
            if v not in vocab:
                problems.append(f"{name}: scene '{s['id']}' supports unknown vocabulary '{v}'")

    mechanics = doc.get("mechanics") or []
    if not mechanics:
        problems.append(f"{name}: no mechanics — nothing can be generated for this world")

    for m in mechanics:
        mid = m.get("id", "<unnamed>")
        where = f"{name}:{mid}"

        for field in ("target_concept", "signature", "starter_template", "solution_template"):
            if not m.get(field):
                problems.append(f"{where}: {field} is missing")

        for sc in m.get("scenes") or []:
            if sc not in scenes:
                problems.append(f"{where}: names scene '{sc}' which this world does not have")
        if not m.get("scenes"):
            problems.append(f"{where}: no scenes listed")

        for v in m.get("vocabulary_used") or []:
            if v not in vocab:
                problems.append(f"{where}: uses unknown vocabulary '{v}'")

        # Carried concepts need a scaffold block or the composer cannot pre-fill them.
        for c in m.get("carried_concepts") or []:
            if c not in scaffolded:
                notes.append(
                    f"{where}: carries '{c}' but carried_scaffold has no entry for it — "
                    "scaffolding will silently do nothing"
                )

        # Every placeholder must be satisfiable.
        declared = set((m.get("param_schema") or {}).keys())
        blob = " ".join(
            str(m.get(k, "")) for k in ("starter_template", "solution_template", "signature")
        )
        for test in m.get("tests") or []:
            blob += " " + str(test.get("input", "")) + " " + str(test.get("expected", ""))

        for ph in set(re.findall(r"<<(\w+)>>", blob)):
            if ph in declared or ph in vocab or ph in BUILT_IN:
                continue
            problems.append(f"{where}: template uses {{{ph}}} which nothing supplies")

        tests = m.get("tests") or []
        if len(tests) < 2:
            problems.append(f"{where}: has {len(tests)} test(s); at least 2 are required")

    constraints = doc.get("constraints") or {}
    if not constraints.get("may_not_vary"):
        problems.append(f"{name}: constraints.may_not_vary is missing — nothing is pinned")

    return doc


def main() -> int:
    files = sorted(p for p in WORLDS.glob("*.yaml") if not p.name.startswith("_"))
    if not files:
        print("no manifests found")
        return 1

    docs = {}
    print(f"checking {len(files)} manifest(s)\n")
    for path in files:
        docs[path.name] = check_manifest(path)

    # ---------------------------------------------------------------- database checks
    all_concepts: set[str] = set()
    for doc in docs.values():
        for m in doc.get("mechanics") or []:
            all_concepts.add(m.get("target_concept"))
            all_concepts.update(m.get("carried_concepts") or [])
    all_concepts.discard(None)

    try:
        from sqlalchemy import select

        from app.database import SessionLocal
        from app.models_tables import Concept, Track

        with SessionLocal() as db:
            real_concepts = {c.slug for c in db.execute(select(Concept)).scalars()}
            real_tracks = {t.slug for t in db.execute(select(Track)).scalars()}

        for c in sorted(all_concepts - real_concepts):
            problems.append(f"concept '{c}' is used by a mechanic but is not in the database")

        for fname, doc in docs.items():
            slug = (doc.get("world") or {}).get("track_slug")
            if real_tracks and slug not in real_tracks:
                problems.append(
                    f"{fname}: track_slug '{slug}' matches no row in tracks "
                    f"(have: {sorted(real_tracks)})"
                )
        if not real_tracks:
            notes.append("tracks table is empty — run the client seed to check track_slug")
        print(f"  database: {len(real_concepts)} concepts, {len(real_tracks)} tracks\n")
    except Exception as exc:  # noqa: BLE001
        notes.append(f"database checks skipped: {type(exc).__name__}")

    # ---------------------------------------------------------------------- summary
    for fname, doc in docs.items():
        w = doc.get("world") or {}
        print(
            f"  {fname:22} {w.get('id','?'):16} "
            f"{len(doc.get('scenes') or []):>2} scenes  "
            f"{len(doc.get('vocabulary') or {}):>2} vocab  "
            f"{len(doc.get('mechanics') or []):>2} mechanics"
        )

    if notes:
        print("\n  notes:")
        for n in notes:
            print(f"    - {n}")

    if problems:
        print(f"\n  {len(problems)} PROBLEM(S):")
        for p in problems:
            print(f"    - {p}")
        return 1

    print("\n  all manifests valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
