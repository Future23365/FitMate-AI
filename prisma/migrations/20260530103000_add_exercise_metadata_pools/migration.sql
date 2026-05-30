ALTER TABLE "Exercise"
ADD COLUMN "allowedSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "intensityRole" TEXT,
ADD COLUMN "movementPattern" TEXT,
ADD COLUMN "difficulty" TEXT,
ADD COLUMN "contraindications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "regressionExerciseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "progressionExerciseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "substitutionGroupId" TEXT;
