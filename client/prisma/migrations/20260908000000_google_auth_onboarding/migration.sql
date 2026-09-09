-- Persist the Google account onboarding state in the Prisma-owned database.
-- All fields are additive and nullable so existing student profiles safely resume
-- onboarding on their next authenticated visit.
ALTER TABLE "student_profiles"
ADD COLUMN "age_band" TEXT,
ADD COLUMN "learner_preference" TEXT,
ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);
