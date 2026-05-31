-- 本地匿名用户重置使用用户级软删除，保留历史业务数据但阻止旧 cookie 恢复。
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
