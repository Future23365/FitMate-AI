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
  suitabilities: z.array(exerciseAllowedSectionSchema)
    .min(1)
    .max(3)
    .optional()
    .describe("动作适配用途数组，只允许 warmup、training 或 stretch；省略时按 training 主训练候选查询。需要编排时，可用 [\"warmup\", \"stretch\"] 围绕已确定主训练动作补齐候选。"),
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
    "suitabilities",
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
  exerciseId: z.string().min(1),
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

const suitabilityGroupSchema = z.object({
  suitability: exerciseAllowedSectionSchema,
  totalMatches: z.number().int().min(0),
  returnedCount: z.number().int().min(0),
  truncated: z.boolean(),
  exercises: z.array(exerciseResourceSummarySchema),
}).strict();

const searchExerciseResourcesOutputSchema = z.object({
  status: z.literal("succeeded"),
  query: z.object({
    q: z.string().optional(),
    category: z.string().optional(),
    suitabilities: z.array(exerciseAllowedSectionSchema),
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
  groups: z.object({
    warmup: suitabilityGroupSchema.optional(),
    training: suitabilityGroupSchema.optional(),
    stretch: suitabilityGroupSchema.optional(),
  }).strict(),
  diagnostics: z.array(z.object({
    suitability: exerciseAllowedSectionSchema,
    code: z.literal("no_candidates"),
    message: z.string(),
  }).strict()),
}).strict();

type SearchExerciseResourcesInput = z.infer<typeof searchExerciseResourcesInputSchema>;
type SearchExerciseResourcesOutput = z.infer<typeof searchExerciseResourcesOutputSchema>;
type ExerciseResourceOutput = z.infer<typeof exerciseResourceSummarySchema>;
type SuitabilityGroupOutput = z.infer<typeof suitabilityGroupSchema>;

/** searchExerciseResourcesTool 是生产聊天可用的只读动作库事实查询能力，不产出训练候选资源。 */
export const searchExerciseResourcesTool = defineTool<SearchExerciseResourcesInput, SearchExerciseResourcesOutput>({
  name: "searchExerciseResources",
  version: "0.4.0",
  description: "按结构化筛选条件查询发布态动作库，并按 suitabilities 分组返回安全动作摘要；totalMatches=0 也是已完成的事实查询结果，不是数据库失败。input 只接受筛选字段和受控排除字段；maxReturned、returnedCount、totalMatches、truncated 等只属于 output summary，不是可传入 input。",
  whenToUse: [
    "当用户需要一组符合明确结构化事实的发布态动作时使用，例如 bodyRegions、真实肌群 facet、器械、难度、居家条件、目标标签、风险标签、分类，或 suitabilities 指定的 warmup/training/stretch 用途。",
    "只推荐一批动作时通常查询 suitabilities = [\"training\"] 或省略 suitabilities；返回的 exerciseId 可写入 final_answer.visibleOutputs[] 的 visibleTrainingProposal.payload.exerciseItems。",
    "需要一次可执行编排时，先确定 training 主训练动作；再围绕这些主训练动作和用户目标查询 suitabilities = [\"warmup\", \"stretch\"] 补充热身和拉伸候选。",
    "宽泛身体区域必须使用 bodyRegions：上肢用 upper_body，腿部或下肢用 lower_body，核心用 core，全身用 full_body。",
    "excludeExerciseIds 只能填写用户已经看到或明确要求排除的动作；如果来自上一轮方案，应从 recentVisibleTrainingProposals 或 visible_training_proposal_fact 中复制真实 exerciseId，不要从未展示的内部候选中填充。",
    `精确筛选必须使用真实 facet 值。${levelFacetDescription} ${equipmentFacetDescription} ${homeRequirementFacetDescription}`,
    "查询成功且 satisfied=true 的结果，包括 totalMatches=0 的结果，可以在同一 run 通过 final_answer.usedToolResultIds 支撑普通事实回答；训练推送事实必须写入 final_answer.visibleOutputs[]，不要只写正文。",
  ].join(" "),
  whenNotToUse: [
    "不要用它生成 visibleTrainingProposal、routine、plan、patch、prescription、schedule、训练卡片、保存 artifact、用户记忆或执行候选集合。",
    "不要把 0 条事实查询结果当作 visibleTrainingProposal、routine、plan、训练卡片或推荐候选集合的消费证据；模型应基于 diagnostics 选择重查、澄清或失败收口。",
    "不要用它查询未发布动作、单个动作详情、唯一动作名解析、全库 facet 统计、分页或语义向量检索。",
    "不要传入 maxReturned、returnedCount、totalMatches、truncated、limit、take、offset、page 或 pageSize；这些不是 input 字段。",
    "不要从 handler-only 结果、model observation、diagnostic 候选，或没有进入 visibleTrainingProposal 的自然语言历史中提取 excludeExerciseIds。",
    "不要把 leg、lower body、upper body、full body、腿部、下肢、上肢或全身这类宽泛区域写进 muscle；必须改用 bodyRegions。",
    "failed、invalid-input 或 satisfied=false 的结果不能支撑成功 final_answer。",
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
        suitabilities: ["training"],
        level: "beginner",
      },
    },
    {
      description: "查找下肢训练动作。",
      input: {
        bodyRegions: ["lower_body"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
    },
    {
      description: "围绕已确定主训练动作补充居家热身和拉伸候选。",
      input: {
        suitabilities: ["warmup", "stretch"],
        homeRequirement: "none",
        sort: "name_asc",
      },
    },
  ],
  handler: async (input) => {
    const excludeExerciseIds = normalizeExcludeExerciseIds(input.excludeExerciseIds);
    const suitabilities = normalizeSuitabilities(input.suitabilities);
    const results = await Promise.all(suitabilities.map((suitability) => searchExerciseResourceSummaries({
      q: input.q,
      category: input.category,
      suitability,
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
    })));
    const groups = Object.fromEntries(results.flatMap((result) => {
      const suitability = result.query.suitability;
      if (!suitability) {
        return [];
      }

      return [[
        suitability,
        {
          suitability,
          totalMatches: result.totalMatches,
          returnedCount: result.returnedCount,
          truncated: result.truncated,
          exercises: result.exercises.map(toExerciseResourceOutput),
        },
      ]];
    })) as SearchExerciseResourcesOutput["groups"];
    const firstResult = results[0];
    if (!firstResult) {
      throw new Error("searchExerciseResources requires at least one suitability.");
    }
    const totalMatches = results.reduce((sum, result) => sum + result.totalMatches, 0);
    const returnedCount = results.reduce((sum, result) => sum + result.returnedCount, 0);
    const maxReturned = results.reduce((sum, result) => sum + result.maxReturned, 0);

    return {
      status: "succeeded",
      query: {
        q: firstResult.query.q,
        category: firstResult.query.category,
        suitabilities,
        level: firstResult.query.level,
        force: firstResult.query.force,
        mechanic: firstResult.query.mechanic,
        equipment: firstResult.query.equipment,
        homeRequirement: firstResult.query.homeRequirement,
        muscle: firstResult.query.muscle,
        bodyRegions: firstResult.query.bodyRegions,
        expandedMuscles: firstResult.expandedMuscles,
        goalTag: firstResult.query.goalTag,
        riskTag: firstResult.query.riskTag,
        excludeExerciseIds: firstResult.query.excludeExerciseIds,
        published: true,
        sort: firstResult.query.sort,
        appliedFilters: collectAppliedFilters(input, suitabilities, excludeExerciseIds),
        totalMatches,
        returnedCount,
        maxReturned,
        truncated: results.some((result) => result.truncated),
        excludedCount: firstResult.excludedCount,
      },
      groups,
      diagnostics: results.flatMap((result) => result.totalMatches === 0
        ? [{
            suitability: result.query.suitability ?? "training",
            code: "no_candidates" as const,
            message: `${result.query.suitability ?? "training"} 用途当前没有匹配候选；Agent 可调整结构化筛选、澄清用户条件或失败收口。`,
          }]
        : []),
    };
  },
  toFulfillment: (output) => {
    if (output.query.totalMatches === 0) {
      return {
        satisfied: true,
        summary: output.query.excludedCount > 0
          ? "查询已执行，排除用户已看到动作后当前发布态动作库没有更多匹配结果。"
          : "查询已执行，当前发布态动作库没有匹配结果。",
      };
    }

    return {
      satisfied: true,
      summary: `按 ${output.query.suitabilities.join("/")} 查询到 ${output.query.totalMatches} 个发布态动作，返回 ${output.query.returnedCount} 个摘要。`,
    };
  },
  toModelObservation: (output) => ({
    status: output.status,
    suitabilities: output.query.suitabilities,
    totalMatches: output.query.totalMatches,
    returnedCount: output.query.returnedCount,
    truncated: output.query.truncated,
    excludedCount: output.query.excludedCount,
    outputSummaryNote: "totalMatches、returnedCount、truncated、excludedCount、groups 和 diagnostics 是本次查询输出摘要，不是下一轮 searchExerciseResources input。",
    finalAnswerGrounding: "本次查询事实（包括 totalMatches=0）如果 fulfillment.satisfied=true，可以引用当前 observation 的 toolResultId 填入 final_answer.usedToolResultIds；训练方案必须放入 final_answer.visibleOutputs[]。",
    candidateConsumptionBoundary: "该 observation 只提供候选事实，不是 visibleTrainingProposal、routine、plan、prescription、schedule 或训练卡片；最终训练事实只能来自 final_answer.visibleOutputs[]。",
    bodyRegions: output.query.bodyRegions ?? [],
    expandedMuscles: output.query.expandedMuscles,
    appliedFilters: output.query.appliedFilters,
    groups: mapGroups(output.groups, (exercise) => ({
      exerciseId: exercise.exerciseId,
      nameZh: exercise.nameZh,
      nameEn: exercise.nameEn,
      equipmentZh: exercise.equipmentZh,
      primaryMusclesZh: exercise.primaryMusclesZh,
      allowedSections: exercise.allowedSections,
    })),
    diagnostics: output.diagnostics,
  }),
  toUserProjection: (output) => ({
    status: output.status,
    suitabilities: output.query.suitabilities,
    totalMatches: output.query.totalMatches,
    returnedCount: output.query.returnedCount,
    maxReturned: output.query.maxReturned,
    truncated: output.query.truncated,
    excludedCount: output.query.excludedCount,
    bodyRegions: output.query.bodyRegions ?? [],
    expandedMuscles: output.query.expandedMuscles,
    appliedFilters: output.query.appliedFilters,
    groups: mapGroups(output.groups, (exercise) => ({
      exerciseId: exercise.exerciseId,
      nameZh: exercise.nameZh,
      nameEn: exercise.nameEn,
      equipmentZh: exercise.equipmentZh,
      primaryMusclesZh: exercise.primaryMusclesZh,
      allowedSections: exercise.allowedSections,
      imageUrl: exercise.imageUrl,
    })),
    diagnostics: output.diagnostics,
  }),
});

export {
  searchExerciseResourcesInputSchema,
  searchExerciseResourcesOutputSchema,
};

function toExerciseResourceOutput(summary: ExerciseResourceSummary): ExerciseResourceOutput {
  return {
    exerciseId: summary.id,
    nameEn: summary.nameEn,
    nameZh: summary.nameZh,
    category: summary.category,
    categoryZh: summary.categoryZh,
    level: summary.level,
    levelZh: summary.levelZh,
    force: summary.force,
    forceZh: summary.forceZh,
    mechanic: summary.mechanic,
    mechanicZh: summary.mechanicZh,
    equipment: summary.equipment,
    equipmentZh: summary.equipmentZh,
    homeRequirement: summary.homeRequirement,
    homeRequirementZh: summary.homeRequirementZh,
    primaryMuscles: summary.primaryMuscles,
    primaryMusclesZh: summary.primaryMusclesZh,
    secondaryMuscles: summary.secondaryMuscles,
    secondaryMusclesZh: summary.secondaryMusclesZh,
    imageUrls: summary.imageUrls,
    imageUrl: summary.imageUrls[0] ?? null,
    allowedSections: summary.allowedSections,
    goalTags: summary.goalTags,
    riskTags: summary.riskTags,
    reviewStatus: summary.reviewStatus,
    isPublished: summary.isPublished,
  };
}

function normalizeExcludeExerciseIds(ids: string[] | undefined) {
  return ids ? [...new Set(ids)] : undefined;
}

function normalizeSuitabilities(suitabilities: SearchExerciseResourcesInput["suitabilities"]) {
  return [...new Set(suitabilities?.length ? suitabilities : ["training"])] as Array<z.infer<typeof exerciseAllowedSectionSchema>>;
}

function collectAppliedFilters(
  input: SearchExerciseResourcesInput,
  suitabilities: Array<z.infer<typeof exerciseAllowedSectionSchema>>,
  excludeExerciseIds: string[] | undefined,
): SearchExerciseResourcesOutput["query"]["appliedFilters"] {
  const filters: SearchExerciseResourcesOutput["query"]["appliedFilters"] = [];
  const entries = {
    q: input.q,
    category: input.category,
    suitabilities,
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
  } as const;

  for (const [field, value] of Object.entries(entries)) {
    if (value !== undefined) {
      filters.push({
        field: field as SearchExerciseResourcesOutput["query"]["appliedFilters"][number]["field"],
        value,
      });
    }
  }

  return filters;
}

function mapGroups<T>(
  groups: SearchExerciseResourcesOutput["groups"],
  mapExercise: (exercise: ExerciseResourceOutput) => T,
) {
  return Object.fromEntries(Object.entries(groups).flatMap(([section, group]) => {
    if (!group) {
      return [];
    }

    const typedGroup = group as SuitabilityGroupOutput;
    return [[
      section,
      {
        suitability: typedGroup.suitability,
        totalMatches: typedGroup.totalMatches,
        returnedCount: typedGroup.returnedCount,
        truncated: typedGroup.truncated,
        exercises: typedGroup.exercises.map(mapExercise),
      },
    ]];
  }));
}
