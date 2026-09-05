-- The adaptive spine: concepts, mastery, per-student plans, runtime mission
-- generation, and the error/hint caches.
-- Purely additive. Existing models gain only back-relations, which are a Prisma-level
-- construct and emit no SQL against their tables.

-- CreateEnum
CREATE TYPE "LessonRequirement" AS ENUM ('REQUIRED', 'OPTIONAL', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DecidedBy" AS ENUM ('RULE', 'MODEL');

-- CreateEnum
CREATE TYPE "SkillBand" AS ENUM ('STRUGGLING', 'ON_LEVEL', 'READY_TO_STRETCH');

-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "sequence_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_concepts" (
    "exercise_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "exercise_concepts_pkey" PRIMARY KEY ("exercise_id","concept_id")
);

-- CreateTable
CREATE TABLE "concept_mastery" (
    "user_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_mastery_pkey" PRIMARY KEY ("user_id","concept_id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" TEXT NOT NULL,
    "self_reported_level" TEXT,
    "skill_band" "SkillBand" NOT NULL DEFAULT 'ON_LEVEL',
    "hint_dependency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "syntax_vs_logic" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "pace" DOUBLE PRECISION,
    "locale" TEXT NOT NULL DEFAULT 'ar-EG',
    "last_computed_at" TIMESTAMP(3),
    "model_version" TEXT,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "user_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "requirement" "LessonRequirement" NOT NULL DEFAULT 'REQUIRED',
    "reason" TEXT,
    "decided_by" "DecidedBy" NOT NULL DEFAULT 'RULE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("user_id","lesson_id")
);

-- CreateTable
CREATE TABLE "mission_templates" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "mechanic_id" TEXT NOT NULL,
    "target_concept_id" TEXT NOT NULL,
    "carried_concept_ids" TEXT[],
    "scenes" TEXT[],
    "props_required" TEXT[],
    "param_schema" JSONB NOT NULL,
    "difficulty_band" INTEGER NOT NULL DEFAULT 5,
    "manifest_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_missions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "user_id" TEXT,
    "scene_id" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "scaffold_plan" JSONB NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "engine_version" TEXT,
    "manifest_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_tags" (
    "tag" TEXT NOT NULL,
    "family" "ErrorFamily" NOT NULL,
    "description" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "error_tags_pkey" PRIMARY KEY ("tag")
);

-- CreateTable
CREATE TABLE "hint_cache" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "hint_level" INTEGER NOT NULL,
    "error_tag" TEXT,
    "scaffold_state" "ScaffoldLevel",
    "locale" TEXT NOT NULL DEFAULT 'ar-EG',
    "text" TEXT NOT NULL,
    "model" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hint_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "concepts_slug_key" ON "concepts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_sequence_order_key" ON "concepts"("sequence_order");

-- CreateIndex
CREATE UNIQUE INDEX "hint_cache_exercise_id_hint_level_error_tag_scaffold_state__key" ON "hint_cache"("exercise_id", "hint_level", "error_tag", "scaffold_state", "locale");

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_generated_mission_id_fkey" FOREIGN KEY ("generated_mission_id") REFERENCES "generated_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_concepts" ADD CONSTRAINT "exercise_concepts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_concepts" ADD CONSTRAINT "exercise_concepts_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_templates" ADD CONSTRAINT "mission_templates_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_missions" ADD CONSTRAINT "generated_missions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "mission_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_missions" ADD CONSTRAINT "generated_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

