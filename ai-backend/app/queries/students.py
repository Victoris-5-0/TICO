"""Queries over the student model: profile, mastery, lesson plan, concepts.

Read-heavy. Every prompt in the system loads some of this, so these are the functions on
the hot path — `profile_bundle` exists so a hint request makes one round trip instead of
four.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models_tables import Concept, ConceptMastery, LessonPlan, StudentProfile
from app.models_tables.enums import LessonRequirement


# ------------------------------------------------------------------------- concepts


def concepts_in_order(db: Session) -> list[Concept]:
    """The roadmap. `sequence_order` IS the order — there is no prerequisite graph."""
    return list(db.execute(select(Concept).order_by(Concept.sequence_order)).scalars())


def concept_by_slug(db: Session, slug: str) -> Concept | None:
    return db.execute(select(Concept).where(Concept.slug == slug)).scalar_one_or_none()


# -------------------------------------------------------------------------- profile


def get_profile(db: Session, user_id: str) -> StudentProfile | None:
    return db.get(StudentProfile, user_id)


def ensure_profile(db: Session, user_id: str, *, locale: str = "ar-EG") -> StudentProfile:
    """Fetch the profile, creating a default one on first contact.

    A student can reach a hint before anything has computed a profile for them — first
    session, first mistake. Returning `None` there would push a null check into every
    prompt builder, so instead they get the neutral defaults: ON_LEVEL, no hint
    dependency, an even syntax/logic split.
    """
    profile = db.get(StudentProfile, user_id)
    if profile is None:
        profile = StudentProfile(user_id=user_id, locale=locale)
        db.add(profile)
        db.flush()
    return profile


# -------------------------------------------------------------------------- mastery


def mastery_map(db: Session, user_id: str) -> dict[str, ConceptMastery]:
    """`{concept_id: ConceptMastery}` for this student. Concepts never practised are absent."""
    rows = db.execute(
        select(ConceptMastery).where(ConceptMastery.user_id == user_id)
    ).scalars()
    return {r.concept_id: r for r in rows}


def mastery_for(db: Session, user_id: str, concept_id: str) -> ConceptMastery | None:
    return db.get(ConceptMastery, (user_id, concept_id))


def weakest_concepts(db: Session, user_id: str, limit: int = 3) -> list[ConceptMastery]:
    """Lowest mastery first, ignoring concepts with no evidence.

    Used to weight the challenge arena toward what a student actually finds hard. The
    `evidence_count > 0` filter matters: a concept nobody has attempted has mastery 0.0 and
    would otherwise always look like the weakest, when it is simply unmeasured.
    """
    return list(
        db.execute(
            select(ConceptMastery)
            .where(ConceptMastery.user_id == user_id, ConceptMastery.evidence_count > 0)
            .order_by(ConceptMastery.mastery)
            .limit(limit)
        ).scalars()
    )


# ---------------------------------------------------------------------- lesson plan


def lesson_plan(db: Session, user_id: str) -> list[LessonPlan]:
    return list(
        db.execute(select(LessonPlan).where(LessonPlan.user_id == user_id)).scalars()
    )


def plan_entry(db: Session, user_id: str, lesson_id: str) -> LessonPlan | None:
    return db.get(LessonPlan, (user_id, lesson_id))


def required_count(db: Session, user_id: str) -> int:
    return db.execute(
        select(func.count())
        .select_from(LessonPlan)
        .where(
            LessonPlan.user_id == user_id,
            LessonPlan.requirement == LessonRequirement.REQUIRED,
        )
    ).scalar_one()


# --------------------------------------------------------------------------- bundle


def profile_bundle(db: Session, user_id: str) -> dict:
    """Everything a prompt needs about a student, in one call.

    A hint request needs the profile, the mastery map and the concept list. Fetching them
    separately is three round trips on the path a child is waiting on, and the whole point
    of the profile table is that this stays cheap.
    """
    return {
        "profile": ensure_profile(db, user_id),
        "mastery": mastery_map(db, user_id),
        "concepts": concepts_in_order(db),
    }
