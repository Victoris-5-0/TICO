"""Runtime mission generation, the error vocabulary, and the hint cache.

Templates are the authored bounds; generated missions are what the model composed inside
them. That split is what makes "the AI fills in variations, it never invents mechanics"
an enforceable property rather than a hope.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models_tables.base import Base
from app.models_tables.enums import ERROR_FAMILY, SCAFFOLD_LEVEL, ErrorFamily, ScaffoldLevel


class MissionTemplate(Base):
    """Authored bounds for generation, projected from `content/worlds/*.yaml`.

    `scenes` and `props_required` are the closed inventory the generator may draw on. A
    scenario that references a prop outside this list fails validation and is never
    shown — that is the mechanism, and it lives here rather than in a prompt.
    """

    __tablename__ = "mission_templates"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    track_id: Mapped[str] = mapped_column(
        Text, ForeignKey("tracks.id", ondelete="CASCADE")
    )
    mechanic_id: Mapped[str] = mapped_column(Text)
    target_concept_id: Mapped[str] = mapped_column(Text)
    carried_concept_ids: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    scenes: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    props_required: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    #: JSON Schema for `generated_missions.params` — the generator fills in within it.
    param_schema: Mapped[dict] = mapped_column(JSONB)
    difficulty_band: Mapped[int] = mapped_column(Integer, default=5)
    manifest_version: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime]

    track: Mapped["Track"] = relationship(back_populates="mission_templates")  # noqa: F821
    generated: Mapped[list["GeneratedMission"]] = relationship(back_populates="template")

    def __repr__(self) -> str:
        return f"<MissionTemplate {self.id} {self.mechanic_id}>"


class GeneratedMission(Base):
    """One composed scenario.

    `validated` is set by a Python validator that runs the reference solution against the
    tests and checks every prop and verb against the manifest. It is never set by the
    model reporting that its own output is fine. An unvalidated mission is never served.
    """

    __tablename__ = "generated_missions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    template_id: Mapped[str] = mapped_column(
        Text, ForeignKey("mission_templates.id", ondelete="CASCADE")
    )
    user_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("users.id", ondelete="SET NULL")
    )
    scene_id: Mapped[str] = mapped_column(Text)
    params: Mapped[dict] = mapped_column(JSONB)
    content: Mapped[dict] = mapped_column(JSONB)
    #: concept_id -> ScaffoldLevel. Also part of the hint cache key: TICO must not hint
    #: about a concept that was scaffolded away.
    scaffold_plan: Mapped[dict] = mapped_column(JSONB)
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    engine_version: Mapped[str | None] = mapped_column(Text)
    manifest_version: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime]

    template: Mapped[MissionTemplate] = relationship(back_populates="generated")
    sessions: Mapped[list["PracticeSession"]] = relationship(  # noqa: F821
        back_populates="generated_mission"
    )

    def __repr__(self) -> str:
        return f"<GeneratedMission {self.id} scene={self.scene_id} ok={self.validated}>"


class ErrorTag(Base):
    """The open half of error classification.

    Starts empty and fills itself: the classifier prompt carries the tags seen so far and
    either reuses one or coins a new snake_case tag. `count` is worth watching — a spike
    in new tags means students are hitting something nobody anticipated.

    Note there is no FK from `submissions.error_tag` to here. Classification must never
    fail because a tag row does not exist yet.
    """

    __tablename__ = "error_tags"

    tag: Mapped[str] = mapped_column(Text, primary_key=True)
    family: Mapped[ErrorFamily] = mapped_column(ERROR_FAMILY)
    description: Mapped[str | None] = mapped_column(Text)
    count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_at: Mapped[datetime]
    last_seen_at: Mapped[datetime]

    def __repr__(self) -> str:
        return f"<ErrorTag {self.tag} {self.family} x{self.count}>"


class HintCache(Base):
    """Cached hint text, keyed by everything that changes what a good hint says.

    This is the primary cost lever, not an optimisation. Gemini's context caching targets
    large contexts with minimum-token thresholds that short hint prompts never reach, so
    the saving has to come from not calling the model at all. Beginners fail in a small
    number of identical ways, so the hit rate on early lessons is high.

    `exercise_id` intentionally has no foreign key: this is a cache, and it should be
    droppable and repopulatable without touching content tables.
    """

    __tablename__ = "hint_cache"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    exercise_id: Mapped[str] = mapped_column(Text)
    hint_level: Mapped[int] = mapped_column(Integer)
    error_tag: Mapped[str | None] = mapped_column(Text)
    scaffold_state: Mapped[ScaffoldLevel | None] = mapped_column(SCAFFOLD_LEVEL)
    locale: Mapped[str] = mapped_column(Text, default="ar-EG")
    text: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    hits: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime]

    def __repr__(self) -> str:
        return f"<HintCache {self.exercise_id} rung={self.hint_level} hits={self.hits}>"
