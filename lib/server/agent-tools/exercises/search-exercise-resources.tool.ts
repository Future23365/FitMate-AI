import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import {
  searchExerciseResourceSummaries,
  type ExerciseResourceAppliedFilter,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import { exerciseSortSchema } from "@/lib/shared/exercises/query-schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const optionalTextFilterSchema = z.string().trim().min(1).max(120).optional();
const publishedInputSchema = z.literal(true).optional().default(true);

const searchExerciseResourcesInputSchema = z.object({
  q: optionalTextFilterSchema.describe("确定性动作文本搜索字段，可匹配动作名称、公开分类、肌群、标签或 embeddingText；不是向量语义召回。"),
  category: optionalTextFilterSchema.describe("动作分类或中文分类的精确筛选值。"),
  suitability: exerciseAllowedSectionSchema.describe("动作适配阶段，只允许 warmup、training 或 stretch。").optional(),
  level: optionalTextFilterSchema.describe("动作难度或中文难度的精确筛选值。"),
  force: optionalTextFilterSchema.describe("发力类型或中文发力类型的精确筛选值。"),
  mechanic: optionalTextFilterSchema.describe("动作机制或中文动作机制的精确筛选值。"),
  equipment: optionalTextFilterSchema.describe("器械或中文器械的精确筛选值。"),
  homeRequirement: optionalTextFilterSchema.describe("居家条件或中文居家条件的精确筛选值。"),
  muscle: optionalTextFilterSchema.describe("主肌群或辅助肌群的精确筛选值，可使用英文或中文肌群名。"),
  goalTag: optionalTextFilterSchema.describe("动作目标标签的精确筛选值。"),
  riskTag: optionalTextFilterSchema.describe("动作风险标签的精确筛选值。"),
  published: publishedInputSchema.describe("生产聊天只能查询发布态动作；省略时固定为 true，显式 false 会被拒绝。"),
  sort: exerciseSortSchema.default("name_asc").describe("固定排序字段，不支持分页、limit、offset、page 或 pageSize。"),
}).strict();

const appliedFilterSchema = z.object({
  field: z.enum([
    "q",
    "category",
    "suitability",
    "level",
    "force",
    "mechanic",
    "equipment",
    "homeRequirement",
    "muscle",
    "goalTag",
    "riskTag",
    "published",
  ]),
  value: z.union([z.string(), z.boolean()]),
}).strict();

const exerciseResourceSummarySchema = z.object({
  id: z.string().min(1),
  nameEn: z.string(),
  nameZh: z.string(),
  category: z.string().nullable(),
  categoryZh: z.string().nullable(),
  level: z.string().nullable(),
  levelZh: z.string().nullable(),
  force: z.string().nullable(),
  forceZh: z.string().nullable(),
  mechanic: z.string().nullable(),
  mechanicZh: z.string().nullable(),
  equipment: z.string().nullable(),
  equipmentZh: z.string().nullable(),
  homeRequirement: z.string(),
  homeRequirementZh: z.string(),
  primaryMuscles: z.array(z.string()),
  primaryMusclesZh: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  secondaryMusclesZh: z.array(z.string()),
  imageUrls: z.array(z.string()),
  imageUrl: z.string().nullable(),
  allowedSections: z.array(exerciseAllowedSectionSchema),
  goalTags: z.array(z.string()),
  riskTags: z.array(z.string()),
  reviewStatus: z.string(),
  isPublished: z.boolean(),
}).strict();

const searchExerciseResourcesOutputSchema = z.object({
  status: z.literal("succeeded"),
  query: z.object({
    q: z.string().optional(),
    category: z.string().optional(),
    suitability: exerciseAllowedSectionSchema.optional(),
    level: z.string().optional(),
    force: z.string().optional(),
    mechanic: z.string().optional(),
    equipment: z.string().optional(),
    homeRequirement: z.string().optional(),
    muscle: z.string().optional(),
    goalTag: z.string().optional(),
    riskTag: z.string().optional(),
    published: z.literal(true),
    sort: exerciseSortSchema,
    appliedFilters: z.array(appliedFilterSchema),
    totalMatches: z.number().int().min(0),
    returnedCount: z.number().int().min(0),
    maxReturned: z.number().int().min(1),
    truncated: z.boolean(),
  }).strict(),
  exercises: z.array(exerciseResourceSummarySchema),
}).strict();

type SearchExerciseResourcesInput = z.infer<typeof searchExerciseResourcesInputSchema>;
type SearchExerciseResourcesOutput = z.infer<typeof searchExerciseResourcesOutputSchema>;

/** searchExerciseResourcesTool 是生产聊天可用的只读动作库事实查询能力，不产出训练候选资源。 */
export const searchExerciseResourcesTool = defineTool<SearchExerciseResourcesInput, SearchExerciseResourcesOutput>({
  name: "searchExerciseResources",
  version: "0.1.0",
  description: "Query published exercise resources by structured filters and return safe exercise summaries for ordinary text answers.",
  whenToUse: [
    "Use when the user asks for a list of published exercises that match explicit structured facts such as muscle, equipment, level, home requirement, goal tag, risk tag, category, or warmup/training/stretch suitability.",
    "Successful results, including empty results, may support a final_answer through usedToolResultIds in the same run.",
  ].join(" "),
  whenNotToUse: [
    "Do not use to generate routines, plans, patches, workout cards, saved artifacts, user memory, or execution candidate sets.",
    "Do not use for unpublished exercises, single-exercise detail lookup, unique-name resolution, full-library facet statistics, pagination, or semantic vector retrieval.",
    "Failed or invalid-input results cannot support a successful final_answer.",
  ].join(" "),
  inputSchema: searchExerciseResourcesInputSchema,
  outputSchema: searchExerciseResourcesOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 1_000,
  },
  examples: [
    {
      description: "Find beginner bodyweight training exercises for chest.",
      input: {
        muscle: "胸部",
        equipment: "body only",
        suitability: "training",
        level: "beginner",
      },
    },
    {
      description: "Find warmup exercises that can be done at home.",
      input: {
        suitability: "warmup",
        homeRequirement: "home_friendly",
        sort: "name_asc",
      },
    },
    {
      description: "Search published stretching resources by deterministic text.",
      input: {
        q: "肩部",
        suitability: "stretch",
      },
    },
  ],
  handler: async (input) => {
    const result = await searchExerciseResourceSummaries({
      q: input.q,
      category: input.category,
      suitability: input.suitability,
      level: input.level,
      force: input.force,
      mechanic: input.mechanic,
      equipment: input.equipment,
      homeRequirement: input.homeRequirement,
      muscle: input.muscle,
      goalTag: input.goalTag,
      riskTag: input.riskTag,
      published: input.published,
      sort: input.sort,
    });

    return {
      status: "succeeded",
      query: {
        q: result.query.q,
        category: result.query.category,
        suitability: result.query.suitability,
        level: result.query.level,
        force: result.query.force,
        mechanic: result.query.mechanic,
        equipment: result.query.equipment,
        homeRequirement: result.query.homeRequirement,
        muscle: result.query.muscle,
        goalTag: result.query.goalTag,
        riskTag: result.query.riskTag,
        published: true,
        sort: result.query.sort,
        appliedFilters: result.appliedFilters,
        totalMatches: result.totalMatches,
        returnedCount: result.returnedCount,
        maxReturned: result.maxReturned,
        truncated: result.truncated,
      },
      exercises: result.exercises.map(toExerciseResourceOutput),
    };
  },
  toFulfillment: (output) => ({
    satisfied: true,
    summary: `查询到 ${output.query.totalMatches} 个发布态动作，返回 ${output.query.returnedCount} 个摘要。`,
  }),
  toModelObservation: (output) => ({
    status: output.status,
    totalMatches: output.query.totalMatches,
    returnedCount: output.query.returnedCount,
    truncated: output.query.truncated,
    appliedFilters: output.query.appliedFilters,
    exercises: output.exercises.map((exercise) => ({
      id: exercise.id,
      nameZh: exercise.nameZh,
      nameEn: exercise.nameEn,
      equipmentZh: exercise.equipmentZh,
      primaryMusclesZh: exercise.primaryMusclesZh,
      allowedSections: exercise.allowedSections,
    })),
  }),
  toUserProjection: (output) => ({
    status: output.status,
    totalMatches: output.query.totalMatches,
    returnedCount: output.query.returnedCount,
    truncated: output.query.truncated,
    appliedFilters: output.query.appliedFilters,
    exercises: output.exercises.map((exercise) => ({
      id: exercise.id,
      nameZh: exercise.nameZh,
      nameEn: exercise.nameEn,
      equipmentZh: exercise.equipmentZh,
      primaryMusclesZh: exercise.primaryMusclesZh,
      allowedSections: exercise.allowedSections,
      imageUrl: exercise.imageUrl,
    })),
  }),
});

export {
  searchExerciseResourcesInputSchema,
  searchExerciseResourcesOutputSchema,
};

function toExerciseResourceOutput(summary: ExerciseResourceSummary): SearchExerciseResourcesOutput["exercises"][number] {
  return {
    ...summary,
    imageUrl: summary.imageUrls[0] ?? null,
  };
}

export function summarizeSearchExerciseResourcesTrace(output: SearchExerciseResourcesOutput) {
  return {
    status: output.status,
    totalMatches: output.query.totalMatches,
    returnedCount: output.query.returnedCount,
    truncated: output.query.truncated,
    appliedFilters: output.query.appliedFilters.map((filter: ExerciseResourceAppliedFilter) => ({
      field: filter.field,
      value: filter.value,
    })),
  };
}
