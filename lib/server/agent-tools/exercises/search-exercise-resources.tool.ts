import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import {
  searchExerciseResourceSummaries,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import { exerciseBodyRegionSchema } from "@/lib/shared/exercises/body-regions";
import { exerciseSortSchema } from "@/lib/shared/exercises/query-schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const optionalTextFilterSchema = z.string().trim().min(1).max(120).optional();
const publishedInputSchema = z.literal(true).optional().default(true);
const maxExcludeExerciseIds = 50;
const exerciseIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const levelFacetDescription = "当前可用精确值：beginner/初级、intermediate/中级、expert/高级。";
const equipmentFacetDescription = "当前常用精确值：body only/自重、dumbbell/哑铃、barbell/杠铃、bands/弹力带、machine/固定器械、cable/绳索器械、kettlebells/壶铃、medicine ball/药球、exercise ball/健身球、foam roll/泡沫轴、e-z curl bar/EZ 曲杆、other/其他。";
const homeRequirementFacetDescription = "当前可用精确值：none/无器械、floor/地面/瑜伽垫、support/椅子/墙面/支撑物、small_equipment/居家小器械、gym_equipment/健身房器械、partner/搭档辅助、outdoor/户外场地。";

const searchExerciseResourcesInputSchema = z.object({
  q: optionalTextFilterSchema.describe("确定性动作文本搜索字段，可匹配动作名称、公开分类、肌群、标签或 embeddingText；不是向量语义召回。"),
  category: optionalTextFilterSchema.describe("动作分类或中文分类的精确筛选值。"),
  suitability: exerciseAllowedSectionSchema.describe("动作适配阶段，只允许 warmup、training 或 stretch。").optional(),
  level: optionalTextFilterSchema.describe(`动作难度或中文难度的精确筛选值。${levelFacetDescription}`),
  force: optionalTextFilterSchema.describe("发力类型或中文发力类型的精确筛选值。"),
  mechanic: optionalTextFilterSchema.describe("动作机制或中文动作机制的精确筛选值。"),
  equipment: optionalTextFilterSchema.describe(`器械或中文器械的精确筛选值。${equipmentFacetDescription}`),
  homeRequirement: optionalTextFilterSchema.describe(`居家条件或中文居家条件的精确筛选值。${homeRequirementFacetDescription}`),
  muscle: optionalTextFilterSchema.describe("主肌群或辅助肌群的精确筛选值，只能使用动作库真实肌群 facet；腿部、下肢、上肢、全身等高层区域必须使用 bodyRegions。"),
  bodyRegions: z.array(exerciseBodyRegionSchema)
    .min(1)
    .max(4)
    .optional()
    .describe("高层身体区域筛选。上肢用 upper_body，腿部或下肢用 lower_body，核心用 core，全身用 full_body。"),
  goalTag: optionalTextFilterSchema.describe("动作目标标签的精确筛选值。"),
  riskTag: optionalTextFilterSchema.describe("动作风险标签的精确筛选值。"),
  excludeExerciseIds: z.array(exerciseIdSchema)
    .max(maxExcludeExerciseIds)
    .optional()
    .describe("刷新或用户明确排除时使用的动作 id 列表，只能排除用户已经看到或明确要求不要再出现的动作；不支持用内部候选填充。"),
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
    "bodyRegions",
    "goalTag",
    "riskTag",
    "excludeExerciseIds",
    "published",
  ]),
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
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
    bodyRegions: z.array(exerciseBodyRegionSchema).optional(),
    expandedMuscles: z.array(z.string()),
    goalTag: z.string().optional(),
    riskTag: z.string().optional(),
    excludeExerciseIds: z.array(exerciseIdSchema).optional(),
    published: z.literal(true),
    sort: exerciseSortSchema,
    appliedFilters: z.array(appliedFilterSchema),
    totalMatches: z.number().int().min(0),
    returnedCount: z.number().int().min(0),
    maxReturned: z.number().int().min(1),
    truncated: z.boolean(),
    excludedCount: z.number().int().min(0),
  }).strict(),
  exercises: z.array(exerciseResourceSummarySchema),
}).strict();

type SearchExerciseResourcesInput = z.infer<typeof searchExerciseResourcesInputSchema>;
type SearchExerciseResourcesOutput = z.infer<typeof searchExerciseResourcesOutputSchema>;

/** searchExerciseResourcesTool 是生产聊天可用的只读动作库事实查询能力，不产出训练候选资源。 */
export const searchExerciseResourcesTool = defineTool<SearchExerciseResourcesInput, SearchExerciseResourcesOutput>({
  name: "searchExerciseResources",
  version: "0.3.0",
  description: "按结构化筛选条件查询发布态动作库，并返回可用于普通文本回答的安全动作摘要。input 只接受筛选字段和受控排除字段；maxReturned、returnedCount、totalMatches、truncated 等只属于 output summary，不是可传入 input。",
  whenToUse: [
    "当用户需要一组符合明确结构化事实的发布态动作时使用，例如 bodyRegions、真实肌群 facet、器械、难度、居家条件、目标标签、风险标签、分类，或 warmup/training/stretch 适配阶段。",
    "宽泛身体区域必须使用 bodyRegions：上肢用 upper_body，腿部或下肢用 lower_body，核心用 core，全身用 full_body。",
    "当 Planner 判断需要排除用户已经看到的动作，且当前 run 有已 read/import 的用户可见动作事实时，把 displayedExerciseIds 作为 excludeExerciseIds。",
    "excludeExerciseIds 只能填写用户已经看到或明确要求排除的动作；不要从未展示的内部候选中填充。",
    `精确筛选必须使用真实 facet 值。${levelFacetDescription} ${equipmentFacetDescription} ${homeRequirementFacetDescription}`,
    "成功且 satisfied=true 的结果，可以在同一 run 通过 final_answer.usedToolResultIds 支撑最终回答；需要新结果时必须改变合法 input，例如使用 excludeExerciseIds 或调整筛选字段。",
  ].join(" "),
  whenNotToUse: [
    "不要用它生成 routine、plan、patch、训练卡片、保存 artifact、用户记忆或执行候选集合。",
    "不要用它查询未发布动作、单个动作详情、唯一动作名解析、全库 facet 统计、分页或语义向量检索。",
    "不要传入 maxReturned、returnedCount、totalMatches、truncated、limit、take、offset、page 或 pageSize；这些不是 input 字段。",
    "不要从 handler-only 结果、model observation、diagnostic 候选，或没有 read/import 为当前 run fact 的自然语言历史中提取 excludeExerciseIds。",
    "不要把 leg、lower body、upper body、full body、腿部、下肢、上肢或全身这类宽泛区域写进 muscle；必须改用 bodyRegions。",
    "failed、invalid-input 或 satisfied=false 的结果不能支撑成功的动作推荐 final_answer。",
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
      description: "查找适合胸部训练的初级自重动作。",
      input: {
        muscle: "胸部",
        equipment: "body only",
        homeRequirement: "none",
        suitability: "training",
        level: "beginner",
      },
    },
    {
      description: "查找下肢训练动作。",
      input: {
        bodyRegions: ["lower_body"],
        suitability: "training",
        sort: "name_asc",
      },
    },
    {
      description: "查找可在家完成的热身动作。",
      input: {
        suitability: "warmup",
        homeRequirement: "none",
        sort: "name_asc",
      },
    },
  ],
  handler: async (input) => {
    const excludeExerciseIds = normalizeExcludeExerciseIds(input.excludeExerciseIds);
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
      bodyRegions: input.bodyRegions,
      goalTag: input.goalTag,
      riskTag: input.riskTag,
      excludeExerciseIds,
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
        bodyRegions: result.query.bodyRegions,
        expandedMuscles: result.expandedMuscles,
        goalTag: result.query.goalTag,
        riskTag: result.query.riskTag,
        excludeExerciseIds: result.query.excludeExerciseIds,
        published: true,
        sort: result.query.sort,
        appliedFilters: result.appliedFilters,
        totalMatches: result.totalMatches,
        returnedCount: result.returnedCount,
        maxReturned: result.maxReturned,
        truncated: result.truncated,
        excludedCount: result.excludedCount,
      },
      exercises: result.exercises.map(toExerciseResourceOutput),
    };
  },
  toFulfillment: (output) => {
    if (output.query.totalMatches === 0) {
      return {
        satisfied: false,
        summary: output.query.excludedCount > 0
          ? "查询已执行，但排除用户已看到动作后没有更多满足当前筛选条件的发布态动作。"
          : "查询已执行，但没有满足当前筛选条件的发布态动作。",
      };
    }

    return {
      satisfied: true,
      summary: `查询到 ${output.query.totalMatches} 个发布态动作，返回 ${output.query.returnedCount} 个摘要。`,
    };
  },
  toModelObservation: (output) => ({
    status: output.status,
    totalMatches: output.query.totalMatches,
    returnedCount: output.query.returnedCount,
    truncated: output.query.truncated,
    excludedCount: output.query.excludedCount,
    outputSummaryNote: "totalMatches、returnedCount、truncated 和 excludedCount 是本次查询输出摘要，不是下一轮 searchExerciseResources input。",
    finalAnswerGrounding: "如果 fulfillment.satisfied=true，可以引用当前 observation 的 toolResultId 填入 final_answer.usedToolResultIds；不要为了取得同一事实重复同参调用。",
    bodyRegions: output.query.bodyRegions ?? [],
    expandedMuscles: output.query.expandedMuscles,
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
    maxReturned: output.query.maxReturned,
    truncated: output.query.truncated,
    excludedCount: output.query.excludedCount,
    bodyRegions: output.query.bodyRegions ?? [],
    expandedMuscles: output.query.expandedMuscles,
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

function normalizeExcludeExerciseIds(ids: string[] | undefined) {
  return ids ? [...new Set(ids)] : undefined;
}
