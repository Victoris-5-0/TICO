"""XP, streaks, heroes, items, achievements, and classrooms.

The AI service mostly **reads** these. It has one legitimate reason to care: TICO's
debrief and encouragement should know what a student just earned, and a companion that
congratulates you on a streak you broke yesterday is worse than one that says nothing.

Watch the casing. `heroes`, `items`, `achievements` and `classrooms` carry a camelCase
`createdAt`, while every other table added at the same time uses `created_at`. That is
not a mistake to fix here — the column is what it is, and renaming a live column would
break Prisma. It is mapped explicitly below, which is exactly why `base.py` insists on
naming the real column rather than trusting a convention.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models_tables.base import Base
from app.models_tables.ids import new_id


def _utcnow() -> datetime:
    """Prisma's @updatedAt runs in the Prisma client, so it never fires for a
    write from this service. Naive UTC to match the TIMESTAMP(3) columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
from app.models_tables.enums import (
    CLASSROOM_ROLE,
    ITEM_TYPE,
    XP_SOURCE,
    ClassroomRole,
    ItemType,
    XpSource,
)


class XpEvent(Base):
    """An append-only ledger. `users.xp` is the running total; this is why."""

    __tablename__ = "xp_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="SET NULL")
    )
    amount: Mapped[int] = mapped_column(Integer)
    source: Mapped[XpSource] = mapped_column(XP_SOURCE)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<XpEvent {self.user_id} +{self.amount} {self.source}>"


class DailyActivity(Base):
    """One row per student per day. Backs the streak and the teacher dashboard."""

    __tablename__ = "daily_activity"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    xp_earned: Mapped[int] = mapped_column(Integer, default=0)
    sessions_completed: Mapped[int] = mapped_column(Integer, default=0)
    minutes_active: Mapped[int] = mapped_column(Integer, default=0)

    def __repr__(self) -> str:
        return f"<DailyActivity {self.user_id} {self.day} {self.xp_earned}xp>"


class Hero(Base):
    """A playable character. TICO is the companion and is not one of these."""

    __tablename__ = "heroes"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    name_ar: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    sprite_url: Mapped[str | None] = mapped_column(Text)
    unlock_rule: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())

    def __repr__(self) -> str:
        return f"<Hero {self.slug}>"


class UserHero(Base):
    __tablename__ = "user_heroes"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    hero_id: Mapped[str] = mapped_column(
        Text, ForeignKey("heroes.id", ondelete="CASCADE"), primary_key=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    acquired_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<UserHero {self.user_id}/{self.hero_id}>"


class Item(Base):
    __tablename__ = "items"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    name_ar: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[ItemType] = mapped_column(ITEM_TYPE)
    sprite_url: Mapped[str | None] = mapped_column(Text)
    cost: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())

    def __repr__(self) -> str:
        return f"<Item {self.slug} {self.type}>"


class UserItem(Base):
    __tablename__ = "user_items"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    item_id: Mapped[str] = mapped_column(
        Text, ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    acquired_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<UserItem {self.user_id}/{self.item_id} x{self.quantity}>"


class Achievement(Base):
    """`criteria` is evaluated in Python. A model never decides a badge was earned."""

    __tablename__ = "achievements"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    name_ar: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    icon_url: Mapped[str | None] = mapped_column(Text)
    criteria: Mapped[dict | None] = mapped_column(JSONB)
    xp_reward: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())

    def __repr__(self) -> str:
        return f"<Achievement {self.slug}>"


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    achievement_id: Mapped[str] = mapped_column(
        Text, ForeignKey("achievements.id", ondelete="CASCADE"), primary_key=True
    )
    unlocked_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<UserAchievement {self.user_id}/{self.achievement_id}>"


class Classroom(Base):
    """A teacher's group. `join_code` is what students type to enter."""

    __tablename__ = "classrooms"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(Text)
    join_code: Mapped[str] = mapped_column(Text, unique=True)
    teacher_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"))
    track_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("tracks.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    def __repr__(self) -> str:
        return f"<Classroom {self.name} {self.join_code}>"


class ClassroomMember(Base):
    __tablename__ = "classroom_members"

    classroom_id: Mapped[str] = mapped_column(
        Text, ForeignKey("classrooms.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[ClassroomRole] = mapped_column(
        CLASSROOM_ROLE, default=ClassroomRole.STUDENT
    )
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<ClassroomMember {self.classroom_id}/{self.user_id} {self.role}>"
