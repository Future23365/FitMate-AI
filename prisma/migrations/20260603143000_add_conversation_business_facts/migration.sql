CREATE TABLE "ConversationBusinessFact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "schemaVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ConversationBusinessFact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationBusinessFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConversationBusinessFact_conversationBusinessFactIdentity_key"
  ON "ConversationBusinessFact"("userId", "conversationId", "messageId", "kind", "schemaVersion");

CREATE INDEX "ConversationBusinessFact_userId_conversationId_kind_status_createdAt_idx"
  ON "ConversationBusinessFact"("userId", "conversationId", "kind", "status", "createdAt");

CREATE INDEX "ConversationBusinessFact_messageId_idx"
  ON "ConversationBusinessFact"("messageId");
