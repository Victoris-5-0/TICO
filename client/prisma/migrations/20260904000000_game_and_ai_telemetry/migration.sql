-- Game systems and AI telemetry.
-- Written from schema.prisma as it stood on feat/build-backend, which added these
-- 13 models without a migration. Purely additive: no existing table is touched.

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('LESSON', 'DIAGNOSTIC', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('ENCOUNTER', 'EXPLORE', 'DISCOVER', 'UNDERSTAND', 'GUIDED_CODING', 'ADAPT_REMIX', 'INDEPENDENT');

-- CreateEnum
CREATE TYPE "SessionOutcome" AS ENUM ('IN_PROGRESS', 'SOLVED', 'ABANDONED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "ScaffoldLevel" AS ENUM ('NONE', 'PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "ErrorFamily" AS ENUM ('SYNTAX', 'NAME', 'TYPE', 'LOGIC', 'INCOMPLETE', 'RUNTIME', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "XpSource" AS ENUM ('EXERCISE_SOLVED', 'LESSON_COMPLETED', 'ACHIEVEMENT', 'CHALLENGE', 'STREAK_BONUS', 'MANUAL');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('COSMETIC', 'POWER_UP', 'BADGE', 'CURRENCY');

-- CreateEnum
CREATE TYPE "ClassroomRole" AS ENUM ('STUDENT', 'ASSISTANT');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "attempt_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "error_family" "ErrorFamily",
ADD COLUMN     "error_tag" TEXT,
ADD COLUMN     "hints_used_before" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "session_id" TEXT;

-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" TEXT,
    "generated_mission_id" TEXT,
    "kind" "SessionKind" NOT NULL DEFAULT 'LESSON',
    "phase" "Phase" DEFAULT 'EXPLORE',
    "outcome" "SessionOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "time_spent_ms" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hint_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "submission_id" TEXT,
    "concept_id" TEXT,
    "hint_level" INTEGER NOT NULL DEFAULT 1,
    "text" TEXT,
    "model" TEXT,
    "was_used" BOOLEAN NOT NULL DEFAULT false,
    "scaffold_state" "ScaffoldLevel",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hint_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "capability" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT,
    "input" TEXT,
    "output" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "status" TEXT,
    "moderation_flag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "amount" INTEGER NOT NULL,
    "source" "XpSource" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activity" (
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "minutes_active" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "heroes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "sprite_url" TEXT,
    "unlock_rule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heroes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_heroes" (
    "user_id" TEXT NOT NULL,
    "hero_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_heroes_pkey" PRIMARY KEY ("user_id","hero_id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "type" "ItemType" NOT NULL DEFAULT 'COSMETIC',
    "sprite_url" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_items" (
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_items_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "icon_url" TEXT,
    "criteria" JSONB,
    "xp_reward" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "user_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id","achievement_id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "join_code" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "track_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_members" (
    "classroom_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ClassroomRole" NOT NULL DEFAULT 'STUDENT',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_members_pkey" PRIMARY KEY ("classroom_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "heroes_slug_key" ON "heroes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "items_slug_key" ON "items"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_slug_key" ON "achievements"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_join_code_key" ON "classrooms"("join_code");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hint_events" ADD CONSTRAINT "hint_events_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_hero_id_fkey" FOREIGN KEY ("hero_id") REFERENCES "heroes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_items" ADD CONSTRAINT "user_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_items" ADD CONSTRAINT "user_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

