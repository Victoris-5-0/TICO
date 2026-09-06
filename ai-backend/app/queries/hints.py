"""Hint events and the hint cache.

Two jobs. `hint_events` is evidence — it is where `hint_dependency` comes from and how the
server knows which rung a student is on. `hint_cache` is cost control.

**Why the cache matters more than it looks.** Gemini's context caching is built for large
contexts with minimum-token thresholds that a short hint prompt never reaches, so there is
no provider-side saving available. Not calling the model is the only lever. Beginners fail
in a small number of identical ways — a missing colon, `=` for `==` — so on early lessons
the same four cache keys serve most students.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models_tables import HintCache, HintEvent
from app.models_tables.enums import ScaffoldLevel


def record(
    db: Session,
    *,
    session_id: str,
    hint_level: int,
    text: str,
    concept_id: str | None = None,
    submission_id: str | None = None,
    model: str | None = None,
    scaffold_state: ScaffoldLevel | None = None,
    was_used: bool = True,
) -> HintEvent:
    """Log a shown hint. `id` and `created_at` fill themselves in.

    `model` is `None` when the text came from the authored fallback rather than Gemini —
    worth being able to tell apart when the eval numbers look strange.

    `scaffold_state` records what the composer had already pre-filled, because a hint about
    a concept that was scaffolded away is noise, and because it is part of the cache key.
    """
    event = HintEvent(
        session_id=session_id,
        submission_id=submission_id,
        concept_id=concept_id,
        hint_level=hint_level,
        text=text,
        model=model,
        was_used=was_used,
        scaffold_state=scaffold_state,
    )
    db.add(event)
    db.flush()
    return event


def for_session(db: Session, session_id: str) -> list[HintEvent]:
    """Every hint shown in this session, in rung order."""
    return list(
        db.execute(
            select(HintEvent)
            .where(HintEvent.session_id == session_id)
            .order_by(HintEvent.hint_level, HintEvent.created_at)
        ).scalars()
    )


def highest_rung(db: Session, session_id: str) -> int:
    """The highest rung reached, or 0. What the ladder increments from.

    `max` rather than `count`: a retry that logs the same rung twice must not push the
    student up a level they never actually saw.
    """
    return db.execute(
        select(func.coalesce(func.max(HintEvent.hint_level), 0)).where(
            HintEvent.session_id == session_id
        )
    ).scalar_one()


# ------------------------------------------------------------------------ the cache


def cache_lookup(
    db: Session,
    *,
    exercise_id: str,
    hint_level: int,
    error_tag: str | None,
    scaffold_state: ScaffoldLevel | None,
    locale: str = "ar-EG",
) -> HintCache | None:
    """Find a previously written hint for this exact situation.

    Every part of the key changes what a good hint would say, which is why the key is this
    wide:

    * `exercise_id` — the code being written
    * `hint_level` — rung 1 points, rung 4 walks through; not interchangeable
    * `error_tag` — the same rung says different things for a missing colon and a bad condition
    * `scaffold_state` — never hint about a concept that was pre-filled for this student
    * `locale` — Egyptian Arabic and English are different rows, not a translation
    """
    return db.execute(
        select(HintCache).where(
            HintCache.exercise_id == exercise_id,
            HintCache.hint_level == hint_level,
            HintCache.error_tag.is_(None) if error_tag is None else HintCache.error_tag == error_tag,
            HintCache.scaffold_state.is_(None)
            if scaffold_state is None
            else HintCache.scaffold_state == scaffold_state,
            HintCache.locale == locale,
        )
    ).scalar_one_or_none()


def cache_store(
    db: Session,
    *,
    exercise_id: str,
    hint_level: int,
    text: str,
    error_tag: str | None = None,
    scaffold_state: ScaffoldLevel | None = None,
    locale: str = "ar-EG",
    model: str | None = None,
) -> HintCache:
    """Cache a model-written hint.

    **Only ever call this on text that has passed the answer-leak guard.** A cached leak is
    far worse than a live one: it would be served to every student who hits the same
    mistake, without another model call to get it wrong again.
    """
    row = HintCache(
        exercise_id=exercise_id,
        hint_level=hint_level,
        error_tag=error_tag,
        scaffold_state=scaffold_state,
        locale=locale,
        text=text,
        model=model,
        hits=0,
    )
    db.add(row)
    db.flush()
    return row


def cache_hit(db: Session, row: HintCache) -> HintCache:
    """Count a use. `hits` is how you find out whether the cache is worth its complexity."""
    row.hits += 1
    db.flush()
    return row


def cache_stats(db: Session) -> dict:
    """Rows, total hits, and the best-performing entries. For the ops dashboard."""
    rows, hits = db.execute(
        select(func.count(), func.coalesce(func.sum(HintCache.hits), 0)).select_from(HintCache)
    ).one()
    top = list(
        db.execute(
            select(HintCache).order_by(HintCache.hits.desc()).limit(5)
        ).scalars()
    )
    return {
        "rows": rows,
        "total_hits": hits,
        # Every hit is one model call not made.
        "calls_avoided": hits,
        "top": [{"exercise_id": r.exercise_id, "rung": r.hint_level, "hits": r.hits} for r in top],
    }
