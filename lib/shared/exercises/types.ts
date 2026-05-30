import { z } from "zod";

export type ExerciseReviewStatus =
  | "machine_translated"
  | "machine_assisted"
  | "human_reviewed"
  | "rejected"
  | "fallback";

export const exerciseAllowedSectionSchema = z.enum(["warmup", "training", "stretch"]);
export const exerciseIntensityRoleSchema = z.enum([
  "activation",
  "mobility",
  "skill",
  "strength",
  "hypertrophy",
  "power",
  "cardio",
  "recovery",
]);
export const exerciseMovementPatternSchema = z.enum([
  "push",
  "pull",
  "squat",
  "hinge",
  "lunge",
  "carry",
  "rotation",
  "anti_rotation",
  "gait",
  "mobility",
  "isolation",
  "core",
  "stretch",
  "other",
]);
export const exerciseDifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

export const exerciseMetadataSchema = z.object({
  allowedSections: z.array(exerciseAllowedSectionSchema).default([]),
  intensityRole: exerciseIntensityRoleSchema.nullable().default(null),
  movementPattern: exerciseMovementPatternSchema.nullable().default(null),
  difficulty: exerciseDifficultySchema.nullable().default(null),
  riskTags: z.array(z.string().trim().min(1)).default([]),
  contraindications: z.array(z.string().trim().min(1)).default([]),
  regressionExerciseIds: z.array(z.string().trim().min(1)).default([]),
  progressionExerciseIds: z.array(z.string().trim().min(1)).default([]),
  substitutionGroupId: z.string().trim().min(1).nullable().default(null),
});

export type ExerciseAllowedSection = z.infer<typeof exerciseAllowedSectionSchema>;
export type ExerciseIntensityRole = z.infer<typeof exerciseIntensityRoleSchema>;
export type ExerciseMovementPattern = z.infer<typeof exerciseMovementPatternSchema>;
export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;
export type ExerciseMetadata = z.infer<typeof exerciseMetadataSchema>;

export type Exercise = {
  id: string;
  source: string;
  sourceUrl: string;
  sourceId: string;
  license: string;
  nameEn: string;
  nameZh: string;
  category: string | null;
  categoryZh: string | null;
  level: string | null;
  levelZh: string | null;
  force: string | null;
  forceZh: string | null;
  mechanic: string | null;
  mechanicZh: string | null;
  equipment: string | null;
  equipmentZh: string | null;
  homeRequirement: string;
  homeRequirementZh: string;
  primaryMuscles: string[];
  primaryMusclesZh: string[];
  secondaryMuscles: string[];
  secondaryMusclesZh: string[];
  instructionsEn: string[];
  instructionsZh: string[];
  images: string[];
  imageUrls: string[];
  allowedSections: ExerciseAllowedSection[];
  intensityRole: ExerciseIntensityRole | null;
  movementPattern: ExerciseMovementPattern | null;
  difficulty: ExerciseDifficulty | null;
  riskTags: string[];
  contraindications: string[];
  regressionExerciseIds: string[];
  progressionExerciseIds: string[];
  substitutionGroupId: string | null;
  goalTags: string[];
  reviewStatus: ExerciseReviewStatus;
  isPublished: boolean;
};

export type ExerciseListQuery = {
  q?: string;
  category?: string;
  suitability?: ExerciseSuitability;
  level?: string;
  force?: string;
  mechanic?: string;
  equipment?: string;
  homeRequirement?: string;
  muscle?: string;
  goalTag?: string;
  riskTag?: string;
  published?: boolean;
  sort?: ExerciseSort;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
};

export type ExerciseSuitability = "stretch" | "training" | "warmup";

export type ExerciseSort =
  | "name_asc"
  | "name_desc"
  | "level_asc"
  | "level_desc"
  | "category_asc"
  | "category_desc";

export type ExerciseFacetItem = {
  value: string;
  label: string;
  count: number;
};

export type ExerciseFacets = {
  categories: ExerciseFacetItem[];
  levels: ExerciseFacetItem[];
  force: ExerciseFacetItem[];
  mechanics: ExerciseFacetItem[];
  equipment: ExerciseFacetItem[];
  homeRequirements: ExerciseFacetItem[];
  muscles: ExerciseFacetItem[];
  goalTags: ExerciseFacetItem[];
  riskTags: ExerciseFacetItem[];
};

export type ExerciseListResult = {
  items: Exercise[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
