-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('credentials', 'google', 'github', 'apple', 'anonymous');

-- CreateEnum
CREATE TYPE "ExerciseReviewStatus" AS ENUM ('machine_translated', 'machine_assisted', 'human_reviewed', 'rejected', 'fallback');

-- CreateEnum
CREATE TYPE "WorkoutPlanStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "WorkoutPlanSource" AS ENUM ('ai', 'manual', 'imported');

-- CreateEnum
CREATE TYPE "WorkoutSessionStatus" AS ENUM ('planned', 'in_progress', 'completed', 'missed', 'cancelled');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('system', 'user', 'assistant', 'tool');

-- AlterTable
ALTER TABLE "Exercise"
  ALTER COLUMN "reviewStatus" DROP DEFAULT,
  ALTER COLUMN "reviewStatus" TYPE "ExerciseReviewStatus" USING "reviewStatus"::"ExerciseReviewStatus",
  ALTER COLUMN "reviewStatus" SET DEFAULT 'machine_translated';

-- AlterTable
ALTER TABLE "WorkoutPlan"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "WorkoutPlanStatus" USING "status"::"WorkoutPlanStatus",
  ALTER COLUMN "status" SET DEFAULT 'draft',
  ALTER COLUMN "source" DROP DEFAULT,
  ALTER COLUMN "source" TYPE "WorkoutPlanSource" USING "source"::"WorkoutPlanSource",
  ALTER COLUMN "source" SET DEFAULT 'ai';

-- AlterTable
ALTER TABLE "WorkoutSession"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "WorkoutSessionStatus" USING "status"::"WorkoutSessionStatus",
  ALTER COLUMN "status" SET DEFAULT 'planned';

-- AlterTable
ALTER TABLE "ChatMessage"
  ALTER COLUMN "role" TYPE "ChatMessageRole" USING "role"::"ChatMessageRole";

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_source_sourceId_key" ON "Exercise"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlanItem_workoutPlanDayId_sortOrder_key" ON "WorkoutPlanItem"("workoutPlanDayId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerAccountId_key" ON "UserIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE INDEX "UserIdentity_email_idx" ON "UserIdentity"("email");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
