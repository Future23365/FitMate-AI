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
  riskTags: string[];
  goalTags: string[];
  reviewStatus: string;
  isPublished: boolean;
};

export type ExerciseListQuery = {
  q?: string;
  category?: string;
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
