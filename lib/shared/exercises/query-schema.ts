import { z } from "zod";

export const exerciseSortSchema = z.enum([
  "name_asc",
  "name_desc",
  "level_asc",
  "level_desc",
  "category_asc",
  "category_desc",
]);

const optionalTextParam = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().max(120).optional(),
);

const optionalBooleanParam = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  return value;
}, z.boolean().optional());

const optionalPositiveIntParam = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return typeof value === "string" ? Number(value) : value;
}, z.number().int().min(1).optional());

const optionalOffsetParam = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return typeof value === "string" ? Number(value) : value;
}, z.number().int().min(0).optional());

// 动作用途筛选用于动作编排页右侧面板，只表达候选适配度，不改变保存时的 section。
const exerciseSuitabilityQuerySchema = z.enum(["warmup", "training", "stretch"]).optional();

// Query parsing lives in shared code so API routes and future server actions enforce the same filters.
export const exerciseListQuerySchema = z.object({
  q: optionalTextParam,
  category: optionalTextParam,
  suitability: exerciseSuitabilityQuerySchema,
  level: optionalTextParam,
  force: optionalTextParam,
  mechanic: optionalTextParam,
  equipment: optionalTextParam,
  homeRequirement: optionalTextParam,
  muscle: optionalTextParam,
  goalTag: optionalTextParam,
  riskTag: optionalTextParam,
  published: optionalBooleanParam,
  sort: exerciseSortSchema.optional(),
  page: optionalPositiveIntParam,
  pageSize: optionalPositiveIntParam,
  limit: optionalPositiveIntParam,
  offset: optionalOffsetParam,
});

export type ExerciseListQueryInput = z.infer<typeof exerciseListQuerySchema>;
