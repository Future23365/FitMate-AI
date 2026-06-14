ALTER TABLE "Exercise"
  ADD COLUMN "requiresExternalEquipment" BOOLEAN,
  ADD COLUMN "requiredEquipmentTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "supportRequirementTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "setupComplexity" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "impactLevel" TEXT,
  ADD COLUMN "noiseLevel" TEXT;

CREATE INDEX "Exercise_requiresExternalEquipment_idx" ON "Exercise"("requiresExternalEquipment");
CREATE INDEX "Exercise_requiredEquipmentTags_idx" ON "Exercise" USING GIN ("requiredEquipmentTags");
CREATE INDEX "Exercise_supportRequirementTags_idx" ON "Exercise" USING GIN ("supportRequirementTags");
CREATE INDEX "Exercise_setupComplexity_idx" ON "Exercise"("setupComplexity");
CREATE INDEX "Exercise_impactLevel_idx" ON "Exercise"("impactLevel");
CREATE INDEX "Exercise_noiseLevel_idx" ON "Exercise"("noiseLevel");
