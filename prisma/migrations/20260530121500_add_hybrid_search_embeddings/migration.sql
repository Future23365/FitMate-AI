ALTER TABLE "Exercise"
  ADD COLUMN "embeddingText" TEXT,
  ADD COLUMN "embedding" JSONB;

ALTER TABLE "ArtifactIndex"
  ADD COLUMN "embeddingText" TEXT,
  ADD COLUMN "embedding" JSONB;

CREATE INDEX "Exercise_embeddingText_idx" ON "Exercise"("embeddingText");
CREATE INDEX "ArtifactIndex_embeddingText_idx" ON "ArtifactIndex"("embeddingText");
