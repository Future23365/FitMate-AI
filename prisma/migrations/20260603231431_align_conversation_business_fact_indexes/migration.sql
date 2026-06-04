-- Keep ConversationBusinessFact physical index names short and stable so Prisma does not keep prompting for a rename-only migration.
ALTER INDEX IF EXISTS "ConversationBusinessFact_conversationBusinessFactIdentity_key"
  RENAME TO "ConversationBusinessFact_identity_key";

ALTER INDEX IF EXISTS "ConversationBusinessFact_userId_conversationId_kind_status_crea"
  RENAME TO "ConversationBusinessFact_lookup_idx";
