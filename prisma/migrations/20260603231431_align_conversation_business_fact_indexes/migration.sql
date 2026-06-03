-- 将 ConversationBusinessFact 的物理索引名收敛为短且稳定的名称，避免 Prisma 反复提示生成纯重命名 migration。
ALTER INDEX IF EXISTS "ConversationBusinessFact_conversationBusinessFactIdentity_key"
  RENAME TO "ConversationBusinessFact_identity_key";

ALTER INDEX IF EXISTS "ConversationBusinessFact_userId_conversationId_kind_status_crea"
  RENAME TO "ConversationBusinessFact_lookup_idx";
