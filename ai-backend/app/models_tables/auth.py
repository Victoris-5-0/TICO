"""Better Auth tables owned and migrated by Prisma.

The AI service reads sessions to validate bearer tokens. Account and verification
models are mapped as well so schema drift remains covered by the contract tests.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models_tables.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column("expires_at", default=_utcnow)
    token: Mapped[str] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column("created_at", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updated_at", default=_utcnow, onupdate=_utcnow)
    ip_address: Mapped[str | None] = mapped_column("ip_address", Text)
    user_agent: Mapped[str | None] = mapped_column("user_agent", Text)
    user_id: Mapped[str] = mapped_column(
        "user_id", Text, ForeignKey("users.id", ondelete="CASCADE")
    )

    user: Mapped["User"] = relationship(back_populates="auth_sessions")  # noqa: F821


class AuthAccount(Base):
    __tablename__ = "auth_accounts"
    __table_args__ = (UniqueConstraint("provider_id", "account_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column("account_id", Text)
    provider_id: Mapped[str] = mapped_column("provider_id", Text)
    user_id: Mapped[str] = mapped_column(
        "user_id", Text, ForeignKey("users.id", ondelete="CASCADE")
    )
    access_token: Mapped[str | None] = mapped_column("access_token", Text)
    refresh_token: Mapped[str | None] = mapped_column("refresh_token", Text)
    id_token: Mapped[str | None] = mapped_column("id_token", Text)
    access_token_expires_at: Mapped[datetime | None] = mapped_column("access_token_expires_at")
    refresh_token_expires_at: Mapped[datetime | None] = mapped_column("refresh_token_expires_at")
    scope: Mapped[str | None] = mapped_column(Text)
    password: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("created_at", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updated_at", default=_utcnow, onupdate=_utcnow)


class AuthVerification(Base):
    __tablename__ = "auth_verifications"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    identifier: Mapped[str] = mapped_column(Text)
    value: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column("expires_at", default=_utcnow)
    created_at: Mapped[datetime] = mapped_column("created_at", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        "updated_at", default=_utcnow, onupdate=_utcnow
    )
