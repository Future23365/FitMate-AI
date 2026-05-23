-- AlterEnum
ALTER TYPE "WorkoutSessionStatus" ADD VALUE IF NOT EXISTS 'rest';

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "metadata" JSONB;
