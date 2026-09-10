-- Give a practice session a lesson.
--
-- `practice_sessions` linked to an exercise or to a generated mission, and only the
-- exercise carries a lesson. A session opened on a runtime-generated mission therefore
-- could not be attributed to a lesson at all — the client sent `levelId` when opening it
-- and the server had nowhere to put it, so `SessionOut.levelId` came back null.
--
-- Nullable: existing rows have no lesson to backfill from unless they have an exercise,
-- and ON DELETE SET NULL because losing a lesson should not delete the evidence of
-- someone having played it.

ALTER TABLE "practice_sessions" ADD COLUMN "lesson_id" TEXT;

ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_sessions_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "practice_sessions_lesson_id_idx" ON "practice_sessions"("lesson_id");

-- Backfill what can be derived: a session on an authored exercise already implies its
-- lesson. Sessions on generated missions stay null, which is correct rather than a gap.
UPDATE "practice_sessions" ps
   SET "lesson_id" = e."lessonId"
  FROM "exercises" e
 WHERE ps."exercise_id" = e."id"
   AND ps."lesson_id" IS NULL;
