"""The AI call log: what we asked, what it cost, whether it worked.

Required by `docs/06`, and the only place the daily spend cap can be enforced from. Every
model call gets a row — successes, failures, refusals and cache hits alike, because a
capability that is failing silently looks identical to one nobody is using.

**Never store a student's email, name or OAuth data here.** `input` and `output` hold
prompt and completion text, so treat them as the sensitive columns they are: they can
contain a child's code and TICO's reply.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models_tables import AiInteraction
from app.models_tables.learning import _utcnow

#: Capability names. Fixed strings rather than an enum because this column is plain TEXT
#: and adding a capability should not need a migration.
HINT = "TICO_HINT"
CHAT = "TICO_CHAT"
NPC = "TICO_NPC"
CLASSIFY = "CLASSIFY_ERROR"
REVIEW = "PLAN_REVIEW"
GENERATE = "MISSION_GEN"

SUCCESS = "SUCCESS"
FAILURE = "FAILURE"
REJECTED = "REJECTED"  # the model answered, a guard threw it out
CACHED = "CACHED"      # served from the hint cache; no model call was made


def log(
    db: Session,
    *,
    capability: str,
    user_id: str | None = None,
    session_id: str | None = None,
    model: str | None = None,
    prompt_version: str | None = None,
    input_text: str | None = None,
    output_text: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    cost_usd: float | None = None,
    latency_ms: int | None = None,
    status: str = SUCCESS,
    moderation_flag: str | None = None,
) -> AiInteraction:
    """Write one row. Does not commit — the caller owns the transaction."""
    row = AiInteraction(
        user_id=user_id,
        session_id=session_id,
        capability=capability,
        model=model,
        prompt_version=prompt_version,
        input=input_text,
        output=output_text,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        status=status,
        moderation_flag=moderation_flag,
    )
    db.add(row)
    db.flush()
    return row


@contextmanager
def track(db: Session, *, capability: str, user_id: str | None = None, **fields):
    """Time a model call and log it, whether it succeeds or raises.

        with ai_log.track(db, capability=ai_log.HINT, user_id=uid) as t:
            reply = chain.invoke(prompt)
            t["output_text"] = reply.content
            t["model"] = settings.model_hint

    A call that raises still gets a row, with `status=FAILURE` and the latency it burned
    before dying. Logging only successes is how a service ends up looking healthy while
    every third request times out.
    """
    started = time.time()
    fields.setdefault("status", SUCCESS)
    try:
        yield fields
    except Exception as exc:  # noqa: BLE001 - re-raised below
        fields["status"] = FAILURE
        fields["output_text"] = f"{type(exc).__name__}: {exc}"[:2000]
        raise
    finally:
        fields["latency_ms"] = int((time.time() - started) * 1000)
        log(db, capability=capability, user_id=user_id, **fields)


# --------------------------------------------------------------------- the spend cap


def calls_today(db: Session, user_id: str) -> int:
    """Model calls this student has caused in the last 24 hours.

    Cache hits are excluded — they cost nothing, and counting them would punish a student
    for asking a question someone else already asked.
    """
    since = _utcnow() - timedelta(days=1)
    return db.execute(
        select(func.count())
        .select_from(AiInteraction)
        .where(
            AiInteraction.user_id == user_id,
            AiInteraction.created_at >= since,
            AiInteraction.status != CACHED,
        )
    ).scalar_one()


def over_cap(db: Session, user_id: str, cap: int) -> bool:
    return calls_today(db, user_id) >= cap


def spend_today(db: Session) -> dict:
    """Cost and volume across everyone today. What you look at when the bill surprises you."""
    since = _utcnow() - timedelta(days=1)
    total, cost, tokens_in, tokens_out = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(AiInteraction.cost_usd), 0),
            func.coalesce(func.sum(AiInteraction.tokens_in), 0),
            func.coalesce(func.sum(AiInteraction.tokens_out), 0),
        )
        .select_from(AiInteraction)
        .where(AiInteraction.created_at >= since)
    ).one()

    by_capability = db.execute(
        select(AiInteraction.capability, func.count(), AiInteraction.status)
        .where(AiInteraction.created_at >= since)
        .group_by(AiInteraction.capability, AiInteraction.status)
    ).all()

    return {
        "calls": total,
        "cost_usd": float(cost),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "breakdown": [
            {"capability": c, "count": n, "status": s} for c, n, s in by_capability
        ],
    }
