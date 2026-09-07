"""SQLAlchemy queries, one module per aggregate.

The only layer that imports models. Per the dependency rule in AGENTS.md:

    api -> services -> rules / queries / ai

Routers never import SQLAlchemy; services orchestrate these. Nothing here commits — the
caller owns the transaction, because a submission write and its session update have to
land together or not at all.
"""

from app.queries import ai_log, hints, sessions, students

__all__ = ["sessions", "hints", "students", "ai_log"]
