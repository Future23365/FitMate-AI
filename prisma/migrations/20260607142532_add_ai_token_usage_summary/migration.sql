CREATE TABLE "AiTokenUsageSummary" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "hasUnknownUsage" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "AiTokenUsageSummary_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiTokenUsageSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiTokenUsageSummary_identity_key"
  ON "AiTokenUsageSummary"("userId", "conversationId", "messageId");

CREATE INDEX "AiTokenUsageSummary_userId_createdAt_idx"
  ON "AiTokenUsageSummary"("userId", "createdAt");

CREATE INDEX "AiTokenUsageSummary_conversationId_createdAt_idx"
  ON "AiTokenUsageSummary"("conversationId", "createdAt");

CREATE INDEX "AiTokenUsageSummary_messageId_idx"
  ON "AiTokenUsageSummary"("messageId");
