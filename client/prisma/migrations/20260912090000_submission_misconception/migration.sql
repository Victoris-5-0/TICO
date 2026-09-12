-- Keep the sentence, not only the label.
--
-- `POST /v1/submissions/analyze` produces a one-line diagnosis of the student's
-- mental model — "thinks a single `=` compares two values" — and returned it to the
-- caller with nowhere to store it. The row kept `error_family` and `error_tag`, so a
-- teacher could see that a mistake repeated but never why the child made it.
--
-- Nullable: every existing row was classified before there was a column to hold it,
-- and backfilling would mean re-running the model over old code for no benefit.

ALTER TABLE "submissions" ADD COLUMN "misconception" TEXT;
