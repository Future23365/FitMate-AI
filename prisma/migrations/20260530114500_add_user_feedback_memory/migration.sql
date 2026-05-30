CREATE TYPE "UserMemoryKind" AS ENUM (
  'explicit_preference',
  'exercise_feedback',
  'constraint',
  'temporary_context',
  'injury_or_pain_signal',
  'training_behavior'
);

CREATE TYPE "UserMemorySubjectType" AS ENUM (
  'exercise',
  'body_part',
  'goal',
  'equipment',
  'schedule',
  'health',
  'general'
);

CREATE TYPE "UserMemorySource" AS ENUM (
  'chat',
  'workout_result',
  'profile',
  'system'
);

CREATE TYPE "UserMemoryStatus" AS ENUM (
  'active',
  'pending_confirmation',
  'dismissed',
  'expired'
);

CREATE TYPE "UserExerciseFeedbackKind" AS ENUM (
  'dislike',
  'too_hard',
  'too_easy',
  'pain',
  'skipped',
  'completed'
);

CREATE TABLE "UserMemory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "UserMemoryKind" NOT NULL,
  "subjectType" "UserMemorySubjectType" NOT NULL DEFAULT 'general',
  "subjectId" TEXT,
  "subjectLabel" TEXT,
  "value" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "source" "UserMemorySource" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "status" "UserMemoryStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserExerciseFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "kind" "UserExerciseFeedbackKind" NOT NULL,
  "value" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "source" "UserMemorySource" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "status" "UserMemoryStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserExerciseFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserMemory_userId_kind_idx" ON "UserMemory"("userId", "kind");
CREATE INDEX "UserMemory_userId_status_idx" ON "UserMemory"("userId", "status");
CREATE INDEX "UserMemory_userId_subjectType_subjectId_idx" ON "UserMemory"("userId", "subjectType", "subjectId");
CREATE INDEX "UserMemory_expiresAt_idx" ON "UserMemory"("expiresAt");

CREATE INDEX "UserExerciseFeedback_userId_kind_idx" ON "UserExerciseFeedback"("userId", "kind");
CREATE INDEX "UserExerciseFeedback_userId_status_idx" ON "UserExerciseFeedback"("userId", "status");
CREATE INDEX "UserExerciseFeedback_userId_exerciseId_idx" ON "UserExerciseFeedback"("userId", "exerciseId");
CREATE INDEX "UserExerciseFeedback_exerciseId_idx" ON "UserExerciseFeedback"("exerciseId");
CREATE INDEX "UserExerciseFeedback_expiresAt_idx" ON "UserExerciseFeedback"("expiresAt");

ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserExerciseFeedback" ADD CONSTRAINT "UserExerciseFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserExerciseFeedback" ADD CONSTRAINT "UserExerciseFeedback_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
