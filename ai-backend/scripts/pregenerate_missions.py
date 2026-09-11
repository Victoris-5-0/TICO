"""Pre-generate a full set of missions, and pre-warm every hint they can ask for.

    env/python.exe scripts/pregenerate_missions.py
    env/python.exe scripts/pregenerate_missions.py --per-concept 3 --out content/prebuilt

## Why

Generation calls Gemini and takes 20-30 seconds. In front of a judge that is a long blank
screen at best, and at worst a 503 because the model was busy, the key hit its cap, or the
validator rejected three attempts in a row. None of that is worth risking for a demo.

Generated missions are written to `generated_missions` by the service itself, so after
this runs the rows are already in the database and `/v1/missions/next` will reuse them
rather than calling the model. The JSON files are a second copy: if the database is reset
before judging, `pnpm mission:import <file>` puts each one back.

## The hints matter as much as the missions

A pre-generated mission whose hints still call a model has only moved the risk. Every rung
of every guided step is requested here so the hint cache is full, which is what makes a
hint during judging a database read instead of a model call.

## What this does not do

It does not touch a real student's account. Missions are generated for a dedicated
content-prep user, and the throwaway sessions it opens to warm the cache are never closed,
so no mastery moves and nobody's map changes.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.config import settings  # noqa: E402

#: Concepts `el_forn` actually teaches. Functions is deliberately absent: the only mechanic
#: teaching it lives in `el_mahatta`, which has no bakery scene, so a functions mission
#: could be generated and then not drawn.
CONCEPTS = ["variables", "conditionals", "loops"]

#: A user that is not a person. Missions need an owner and sessions need a student; using
#: a real account would put nine open sessions on someone's map.
PREP_USER_ID = "system-content-prep"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--per-concept", type=int, default=3)
    ap.add_argument("--out", default="content/prebuilt")
    ap.add_argument("--concepts", nargs="*", default=CONCEPTS)
    args = ap.parse_args()

    # The router refuses to call a model without this, and a run that silently produced
    # authored fallbacks instead of missions would be worse than one that stopped.
    if not settings.google_api_key:
        env = pathlib.Path(__file__).resolve().parents[1] / ".env"
        for line in env.read_text(encoding="utf-8").splitlines() if env.exists() else []:
            if line.startswith("GOOGLE_API_KEY="):
                settings.google_api_key = line.split("=", 1)[1].strip().strip("\"'")
    if not settings.google_api_key:
        print("no GOOGLE_API_KEY — nothing to generate with", file=sys.stderr)
        return 1

    from app import manifests
    from app.ai.phase_guards import validate_phases
    from app.models_tables import User
    from app.models_tables.enums import Role
    from app.schemas.common import Phase
    from app.services import missions as missions_service
    from app.services.hints import request_hint
    from app.services.sessions import open_session

    out_dir = pathlib.Path(__file__).resolve().parents[1] / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 30})
    db = sessionmaker(bind=engine)()

    if db.get(User, PREP_USER_ID) is None:
        db.add(User(
            id=PREP_USER_ID, email="content-prep@tico.invalid",
            name="Content prep", role=Role.STUDENT,
        ))
        db.commit()

    lesson_id = _first_lesson(db)

    # Phase 3 teaches the concept the first time and moves on after that, and it works
    # that out from how much evidence the student has. The prep user never closes a
    # session, so its evidence never grows and every mission here would be "the first" —
    # the repetition is passed explicitly instead, and each mission is told what the
    # previous ones already explained.
    taught: dict[str, list[str]] = {}
    built: list[dict] = []
    speakers: dict[str, int] = {}
    failures: list[str] = []

    for concept in args.concepts:
        for n in range(1, args.per_concept + 1):
            label = f"{concept} {n}/{args.per_concept}"
            started = time.time()
            try:
                # `lesson_id` is what pins the world. Without it `world_for` picks the
                # earliest world in the roadmap teaching the concept — which for
                # `conditionals` is `isharet_cairo`, a traffic junction. Those missions
                # were correct and unplayable: the client only draws the bakery.
                row, mission = missions_service.generate_explicit(
                    db, user_id=PREP_USER_ID, concept_slug=concept, lesson_id=lesson_id,
                    repetition=n, already_taught=taught.get(concept, []),
                )
                db.commit()
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{label}: generation failed — {exc}")
                print(f"  {label:20} FAILED  {exc}")
                continue

            # Against the world the mission was actually built in, not an assumed one.
            # Validating traffic missions against the bakery manifest reported fifteen
            # failures that were really one: the wrong world.
            report = validate_phases(mission, manifests.get(mission.world_id))
            if not report.ok:
                failures.append(f"{label}: {report.failures}")
                print(f"  {label:20} INVALID {report.failures}")
                continue

            explanation = mission.phases.discover.explanation_ar
            if explanation:
                taught.setdefault(concept, []).append(explanation)

            speaker = mission.phases.encounter.speaker
            speakers[speaker] = speakers.get(speaker, 0) + 1
            secs = int(time.time() - started)

            warmed = _warm_hints(db, mission, row.id, lesson_id)

            path = out_dir / f"{concept}-{n}-{row.id}.json"
            path.write_text(
                json.dumps(
                    {"data": json.loads(mission.model_dump_json(by_alias=True)),
                     "meta": {"request_id": "pregenerated", "stub": False, "cached": False}},
                    ensure_ascii=False, indent=2,
                ) + "\n",
                encoding="utf-8",
            )

            built.append({"concept": concept, "id": row.id, "speaker": speaker,
                          "title": mission.title_ar, "hints": warmed, "file": path.name})
            print(f"  {label:20} ok  {secs:>3}s  {speaker:8} {warmed} hints  {mission.title_ar}")

    _report(built, speakers, failures, out_dir)
    db.close()
    return 1 if failures else 0


def _first_lesson(db) -> str:
    from app.models_tables import Lesson

    row = db.execute(select(Lesson).order_by(Lesson.order).limit(1)).scalar_one_or_none()
    if row is None:
        raise SystemExit("no lessons in the database — run the client seed first")
    return row.id


def _warm_hints(db, mission, mission_id: str, lesson_id: str) -> int:
    """Ask for every rung of every guided step, so the cache holds them all.

    The session is opened and never closed on purpose: closing is what moves mastery, and
    warming a cache should not look like somebody played the mission.
    """
    from app.schemas.common import Phase
    from app.services.hints import request_hint
    from app.services.sessions import open_session

    session = open_session(
        db, user_id=PREP_USER_ID, level_id=lesson_id, generated_mission_id=mission_id,
    )

    warmed = 0
    for step in range(len(mission.phases.guided.steps)):
        for _ in range(4):  # the ladder decides the rung; four asks walks all four
            try:
                request_hint(
                    db, user_id=PREP_USER_ID, session_id=session.id, mission_id=mission_id,
                    code_excerpt=mission.phases.guided.steps[step].code,
                    phase=Phase.GUIDED_CODING, guided_step=step,
                )
                warmed += 1
            except Exception as exc:  # noqa: BLE001
                print(f"      hint step {step} failed: {exc}")
                break
        db.commit()
    return warmed


def _report(built, speakers, failures, out_dir) -> None:
    print()
    print(f"{len(built)} missions, {sum(b['hints'] for b in built)} hints cached")
    print(f"written to {out_dir}")
    print()
    print("speakers:")
    for who, n in sorted(speakers.items(), key=lambda kv: -kv[1]):
        print(f"   {who:10} {n}")
    if len(speakers) == 1 and len(built) > 2:
        print("   ^ still one voice. The prompt asks for variety; it is not getting it.")
    if failures:
        print()
        print(f"{len(failures)} failed:")
        for f in failures:
            print(f"   {f}")


if __name__ == "__main__":
    raise SystemExit(main())
