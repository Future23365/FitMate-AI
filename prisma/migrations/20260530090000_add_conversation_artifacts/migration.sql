CREATE TYPE "ConversationArtifactKind" AS ENUM ('exercise_recommendation', 'routine', 'plan');

CREATE TYPE "ConversationArtifactScope" AS ENUM ('chat');

CREATE TYPE "ConversationArtifactStatus" AS ENUM ('active', 'superseded', 'archived');

CREATE TYPE "ConversationArtifactSourceEntityKind" AS ENUM ('workout_routine', 'workout_schedule');

CREATE TABLE "ConversationArtifact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "messageId" TEXT,
  "kind" "ConversationArtifactKind" NOT NULL,
  "scope" "ConversationArtifactScope" NOT NULL DEFAULT 'chat',
  "payloadSchemaVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "ConversationArtifactStatus" NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "revisionOfArtifactId" TEXT,
  "sourceEntityKind" "ConversationArtifactSourceEntityKind",
  "sourceEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtifactIndex" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "kind" "ConversationArtifactKind" NOT NULL,
  "scope" "ConversationArtifactScope" NOT NULL DEFAULT 'chat',
  "status" "ConversationArtifactStatus" NOT NULL DEFAULT 'active',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "exerciseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "goals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "muscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "equipment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sessionMinutes" INTEGER,
  "weeklyFrequency" INTEGER,
  "trainingDayCount" INTEGER,
  "sourceMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArtifactIndex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationArtifact_messageId_kind_revision_key" ON "ConversationArtifact"("messageId", "kind", "revision");
CREATE INDEX "ConversationArtifact_userId_sessionId_status_updatedAt_idx" ON "ConversationArtifact"("userId", "sessionId", "status", "updatedAt");
CREATE INDEX "ConversationArtifact_messageId_kind_status_idx" ON "ConversationArtifact"("messageId", "kind", "status");
CREATE INDEX "ConversationArtifact_revisionOfArtifactId_idx" ON "ConversationArtifact"("revisionOfArtifactId");
CREATE INDEX "ConversationArtifact_sourceEntityKind_sourceEntityId_idx" ON "ConversationArtifact"("sourceEntityKind", "sourceEntityId");

CREATE UNIQUE INDEX "ArtifactIndex_artifactId_key" ON "ArtifactIndex"("artifactId");
CREATE INDEX "ArtifactIndex_userId_sessionId_status_updatedAt_idx" ON "ArtifactIndex"("userId", "sessionId", "status", "updatedAt");
CREATE INDEX "ArtifactIndex_kind_idx" ON "ArtifactIndex"("kind");
CREATE INDEX "ArtifactIndex_sourceMessageId_idx" ON "ArtifactIndex"("sourceMessageId");

ALTER TABLE "ConversationArtifact" ADD CONSTRAINT "ConversationArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationArtifact" ADD CONSTRAINT "ConversationArtifact_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationArtifact" ADD CONSTRAINT "ConversationArtifact_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationArtifact" ADD CONSTRAINT "ConversationArtifact_revisionOfArtifactId_fkey" FOREIGN KEY ("revisionOfArtifactId") REFERENCES "ConversationArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArtifactIndex" ADD CONSTRAINT "ArtifactIndex_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ConversationArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactIndex" ADD CONSTRAINT "ArtifactIndex_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactIndex" ADD CONSTRAINT "ArtifactIndex_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
