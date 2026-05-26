-- 本迁移只破坏性替换训练相关表和 enum，不触碰 Exercise、User、ChatSession、ChatMessage。
DROP TABLE IF EXISTS "WorkoutSession" CASCADE;
DROP TABLE IF EXISTS "WorkoutPlanItem" CASCADE;
DROP TABLE IF EXISTS "WorkoutPlanDay" CASCADE;
DROP TABLE IF EXISTS "WorkoutPlan" CASCADE;

DROP TYPE IF EXISTS "WorkoutSessionStatus";
DROP TYPE IF EXISTS "WorkoutPlanSource";
DROP TYPE IF EXISTS "WorkoutPlanStatus";

CREATE TYPE "WorkoutRoutineStatus" AS ENUM ('active', 'archived');
CREATE TYPE "WorkoutRoutineSource" AS ENUM ('ai', 'manual', 'imported');
CREATE TYPE "WorkoutScheduleStatus" AS ENUM ('planned', 'completed', 'missed', 'cancelled', 'rest');
CREATE TYPE "WorkoutSessionResultStatus" AS ENUM ('completed', 'abandoned');

CREATE TABLE "WorkoutRoutine" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "estimatedMinutes" INTEGER NOT NULL,
  "estimatedCalories" INTEGER NOT NULL DEFAULT 0,
  "status" "WorkoutRoutineStatus" NOT NULL DEFAULT 'active',
  "source" "WorkoutRoutineSource" NOT NULL DEFAULT 'ai',
  "trainingLoopRounds" INTEGER,
  "trainingLoopRestSeconds" INTEGER,
  "sourceAiTraceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutRoutine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutRoutineItem" (
  "id" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "target" INTEGER NOT NULL,
  "sets" INTEGER NOT NULL,
  "setRestSeconds" INTEGER NOT NULL,
  "transitionRestSeconds" INTEGER NOT NULL,
  "section" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutRoutineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSchedule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "routineId" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "WorkoutScheduleStatus" NOT NULL DEFAULT 'planned',
  "titleSnapshot" TEXT NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
  "estimatedCalories" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSessionResult" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "routineId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "completedStepCount" INTEGER NOT NULL,
  "totalStepCount" INTEGER NOT NULL,
  "completedExerciseCount" INTEGER NOT NULL,
  "totalExerciseCount" INTEGER NOT NULL,
  "estimatedCalories" INTEGER NOT NULL,
  "actualCalories" INTEGER,
  "status" "WorkoutSessionResultStatus" NOT NULL DEFAULT 'completed',
  "feedback" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutSessionResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutRoutine_userId_idx" ON "WorkoutRoutine"("userId");
CREATE INDEX "WorkoutRoutine_status_idx" ON "WorkoutRoutine"("status");

CREATE UNIQUE INDEX "WorkoutRoutineItem_routineId_sortOrder_key" ON "WorkoutRoutineItem"("routineId", "sortOrder");
CREATE INDEX "WorkoutRoutineItem_exerciseId_idx" ON "WorkoutRoutineItem"("exerciseId");
CREATE INDEX "WorkoutRoutineItem_routineId_sortOrder_idx" ON "WorkoutRoutineItem"("routineId", "sortOrder");

CREATE INDEX "WorkoutSchedule_userId_idx" ON "WorkoutSchedule"("userId");
CREATE INDEX "WorkoutSchedule_status_idx" ON "WorkoutSchedule"("status");
CREATE INDEX "WorkoutSchedule_scheduledFor_idx" ON "WorkoutSchedule"("scheduledFor");
CREATE INDEX "WorkoutSchedule_routineId_idx" ON "WorkoutSchedule"("routineId");

CREATE UNIQUE INDEX "WorkoutSessionResult_scheduleId_key" ON "WorkoutSessionResult"("scheduleId");
CREATE INDEX "WorkoutSessionResult_userId_idx" ON "WorkoutSessionResult"("userId");
CREATE INDEX "WorkoutSessionResult_routineId_idx" ON "WorkoutSessionResult"("routineId");
CREATE INDEX "WorkoutSessionResult_status_idx" ON "WorkoutSessionResult"("status");

ALTER TABLE "WorkoutRoutine" ADD CONSTRAINT "WorkoutRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutRoutineItem" ADD CONSTRAINT "WorkoutRoutineItem_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutRoutineItem" ADD CONSTRAINT "WorkoutRoutineItem_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutSchedule" ADD CONSTRAINT "WorkoutSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSchedule" ADD CONSTRAINT "WorkoutSchedule_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutSessionResult" ADD CONSTRAINT "WorkoutSessionResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSessionResult" ADD CONSTRAINT "WorkoutSessionResult_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkoutSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSessionResult" ADD CONSTRAINT "WorkoutSessionResult_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
