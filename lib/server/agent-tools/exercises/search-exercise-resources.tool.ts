import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { agentRuntimeConfig } from "@/lib/server/config";
import {
  getExerciseResourceSummariesByIds,
  isBodyweightExerciseResourceEquipment,
  isNoEquipmentResourceQueryValue,
  isRemovedNoEquipmentHomeRequirementValue,
  normalizeExerciseResourceFacetCatalogForPlanner,
  searchExerciseResourceSummaries,
  type ExerciseResourceFacetCatalog,
  type ExerciseResourceFilterSemantic,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import { exerciseSortSchema } from "@/lib/shared/exercises/query-schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";
import {
  summarizeVisibleTrainingResourceCoverage,
  visibleTrainingCompositionSections,
} from "@/lib/server/visible-training-proposals/visible-training-resource-coverage";

const textFilterValueSchema = z.string().trim().min(1).max(120);
const optionalTextFilterSchema = textFilterValueSchema.optional();
const publishedInputSchema = z.literal(true).optional().default(true);
const maxExcludeExerciseIds = 50;
const maxRequiredExerciseIds = 12;
const maxMuscles = 20;
const exerciseIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const catalogFacetDescription = "精确筛选值应优先从 manifest metadata.facetCatalog 的对应数组中选择；服务端只执行 schema、去空、去重和数据库查询。";
const equipmentFilterSchema = optionalTextFilterSchema
  .describe(`器械可用性或器械类别的精确筛选值；无外部器械统一使用 no_equipment。${catalogFacetDescription}`);
const homeRequirementFilterSchema = textFilterValueSchema
  .refine((value) => !isRemovedNoEquipmentHomeRequirementValue(value), {
    message: "homeRequirement 只表示环境、场地或支撑条件；无外部器械约束应使用 equipment = \"no_equipment\"。",
  })
  .optional()
  .describe(`环境、场地或支撑条件的精确筛选值，例如地面、支撑物、户外、搭档、居家小器械或健身房器械；不表示器械可用性。${catalogFacetDescription}`);

const searchExerciseResourcesInputSchema = z.object({
  q: optionalTextFilterSchema.describe("确定性动作文本搜索字段，可匹配动作名称、公开分类、肌群、标签或 embeddingText；不是向量语义召回。"),
  category: optionalTextFilterSchema.describe(`动作分类或中文分类的精确筛选值。${catalogFacetDescription}`),
  suitabilities: z.array(exerciseAllowedSectionSchema)
    .min(1)
    .max(3)
    .optional()
    .describe("动作适配用途数组，只允许 warmup、training 或 stretch；省略时按 training 主训练候选查询。目标需要 routine 或 plan、当前 run 已有 training 动作事实且缺少 warmup / stretch 时，应沿用当前目标、器械、场地、难度或肌群约束，用 [\"warmup\", \"stretch\"] 或等价缺失 section 查询补齐候选。"),
  level: optionalTextFilterSchema.describe(`动作难度或中文难度的精确筛选值。${catalogFacetDescription}`),
  force: optionalTextFilterSchema.describe(`发力类型或中文发力类型的精确筛选值。${catalogFacetDescription}`),
  mechanic: optionalTextFilterSchema.describe(`动作机制或中文动作机制的精确筛选值。${catalogFacetDescription}`),
  equipment: equipmentFilterSchema,
  homeRequirement: homeRequirementFilterSchema,
  muscles: z.array(textFilterValueSchema)
    .min(1)
    .max(maxMuscles)
    .optional()
    .describe(`一个或多个主肌群或辅助肌群真实数据库 facet 的 OR 查询数组；单个肌群也写成一项数组。${catalogFacetDescription}`),
  goalTag: optionalTextFilterSchema.describe(`动作目标标签的精确筛选值。${catalogFacetDescription}`),
  riskTag: optionalTextFilterSchema.describe(`动作风险标签的精确筛选值。${catalogFacetDescription}`),
  excludeExerciseIds: z.array(exerciseIdSchema)
    .max(maxExcludeExerciseIds)
    .optional()
    .describe("明确替换、排除或避免重复时使用的负向动作 id 列表，只能来自当前 run 可见的用户已经看到动作事实，或用户明确要求不要再出现的动作；不用于保留、复用、派生或调整已有动作，不支持用内部候选、trace 摘要或未读取完整事实填充。"),
  requiredExerciseIds: z.array(exerciseIdSchema)
    .max(maxRequiredExerciseIds)
    .optional()
    .describe("正向查询锚点；当当前 run 已有受控发布态动作 id 时使用，例如来自 resolveExerciseResourceMentions、已导入可消费训练事实或用户明确给出的受控 id。tool 会优先把这些动作纳入现有 groups.<section>.exercises 列表，并用 diagnostics 说明无法纳入或筛选不完全一致的原因。"),
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
    "muscles",
    "goalTag",
    "riskTag",
    "excludeExerciseIds",
    "requiredExerciseIds",
    "published",
  ]),
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
}).strict();

const filterSemanticSchema = z.object({
  field: z.literal("equipment"),
  requestedValue: z.string(),
  databaseMapping: z.object({
    equipment: z.array(z.string()),
    equipmentZh: z.array(z.string()),
  }).strict(),
  note: z.string(),
}).strict() satisfies z.ZodType<ExerciseResourceFilterSemantic>;

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
  allowedSections: z.array(exerciseAllowedSectionSchema)
    .describe("动作可进入哪些 visibleTrainingProposal.exerciseItems[*].section 的数据库事实字段。"),
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
  exercises: z.array(exerciseResourceSummarySchema)
    .describe("该 groups.<section> 分组下返回的发布态动作事实；生成 visibleTrainingProposal.exerciseItems[] 时，section 应与所在 group key 和动作 allowedSections 保持一致。"),
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
    muscles: z.array(z.string()).optional(),
    goalTag: z.string().optional(),
    riskTag: z.string().optional(),
    excludeExerciseIds: z.array(exerciseIdSchema).optional(),
    requiredExerciseIds: z.array(exerciseIdSchema).optional(),
    published: z.literal(true),
    sort: exerciseSortSchema,
    appliedFilters: z.array(appliedFilterSchema),
    filterSemantics: z.array(filterSemanticSchema),
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
  }).strict().describe("按 groups.<section> 分组的动作事实来源；section key 表示本次查询中这些动作作为该训练阶段候选返回。"),
  diagnostics: z.array(z.object({
    suitability: exerciseAllowedSectionSchema,
    code: z.enum([
      "no_candidates",
      "required_exercise_not_found",
      "required_exercise_unpublished",
      "required_exercise_section_conflict",
      "required_exercise_excluded",
      "required_exercise_filter_mismatch",
    ]),
    message: z.string(),
    exerciseId: exerciseIdSchema.optional(),
    conflictFields: z.array(z.string()).optional(),
  }).strict()),
}).strict();

type SearchExerciseResourcesInput = z.infer<typeof searchExerciseResourcesInputSchema>;
type SearchExerciseResourcesOutput = z.infer<typeof searchExerciseResourcesOutputSchema>;
type ExerciseResourceOutput = z.infer<typeof exerciseResourceSummarySchema>;
type SuitabilityGroupOutput = z.infer<typeof suitabilityGroupSchema>;

export type CreateSearchExerciseResourcesToolOptions = {
  facetCatalog?: ExerciseResourceFacetCatalog;
};

/** createSearchExerciseResourcesTool 构造只读动作事实查询 tool，并可注入 Planner 可见数据库 facet catalog。 */
export function createSearchExerciseResourcesTool(options: CreateSearchExerciseResourcesToolOptions = {}) {
  return defineTool<SearchExerciseResourcesInput, SearchExerciseResourcesOutput>({
    name: "searchExerciseResources",
    version: "0.8.0",
    description: "只读查询发布态 Exercise 动作事实，并按 suitabilities 返回 groups.<section>.exercises[]；这些 section-scoped exercises 是训练结构动作项的主要事实来源。",
    whenToUse: [
      "用户需要动作候选、routine 或 plan，并且已有肌群、器械、难度、场地、目标标签、section 用途或受控 exerciseId 等结构化约束时使用。",
      "所有精确 facet 值应优先从 metadata.facetCatalog 选择；muscles 必须使用 facetCatalog.muscles 中真实肌群值，宽泛身体区域应转成更具体肌群或改用澄清/其他约束。",
      "无外部器械统一写 equipment: \"no_equipment\"；homeRequirement 只表示环境、场地或支撑条件，不表示器械可用性。",
      "groups.<section>.exercises[] 是 section-scoped 动作事实来源；生成 visibleTrainingProposal.exerciseItems[] 时，section 必须等于 groups key，并且该动作 allowedSections 必须包含该 section。",
      "requiredExerciseIds 是正向锚点，用于让已解析或已导入的发布态动作优先进入 groups；excludeExerciseIds 是负向排除，用于替换或避免重复。",
      "需要补齐 warmup、training 或 stretch 某些 section 时，沿用当前目标、器械、场地、难度或肌群约束查询缺失 section。",
      "过宽查询不能支撑 visibleOutputs；如果 input 只有默认 suitabilities、published 或 sort，且没有目标约束、器械、肌群、场地、难度或 requiredExerciseIds，则结果只能用于诊断。",
    ].join(" "),
    whenNotToUse: [
      "不要用它判断当前会话有没有上一轮 visibleTrainingProposal、列出 factRef/messageId、读取完整 visibleTrainingProposal.payload，或替代历史方案读取工具。",
      "不要把 totalMatches=0、failed result、invalid-input result 或过宽查询诊断当作训练结构的动作事实。",
      "不要把 groups.training 中且 allowedSections 不包含 warmup/stretch 的动作写入 visibleTrainingProposal.exerciseItems[*].section = warmup 或 stretch；不同 section 需要对应 section 的动作事实支撑。",
      "不要用它查询未发布动作、单个动作详情、唯一动作名解析、全库 facet 统计、分页、limit、offset、page、pageSize 或语义向量检索。",
      "不要用 homeRequirement 表达器械是否可用；无外部器械是 equipment 的查询语义。",
      "不要把同一批动作同时放入 requiredExerciseIds 和 excludeExerciseIds。",
    ].join(" "),
    inputSchema: searchExerciseResourcesInputSchema,
    outputSchema: searchExerciseResourcesOutputSchema,
    // uiActivityStage 让生产聊天活动条跟随 tool 定义同步，不进入 Planner 可见 manifest。
    uiActivityStage: "querying_exercises",
    metadata: options.facetCatalog
      ? { facetCatalog: normalizeExerciseResourceFacetCatalogForPlanner(options.facetCatalog) }
      : undefined,
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
      timeoutMs: agentRuntimeConfig.tools.searchExerciseResources.timeoutMs,
    },
    examples: [
      {
        description: "按多个真实肌群、无外部器械、用途和难度查询 training 动作事实。",
        action: {
          type: "tool_call",
          toolName: "searchExerciseResources",
          input: {
            muscles: ["胸部", "肱三头肌"],
            equipment: "no_equipment",
            suitabilities: ["training"],
            level: "beginner",
          },
        },
      },
      {
        description: "为已需要 routine 或 plan 且缺少 support section 的目标，沿用当前约束查询 warmup 和 stretch 动作事实。",
        action: {
          type: "tool_call",
          toolName: "searchExerciseResources",
          input: {
            muscles: ["胸部"],
            equipment: "no_equipment",
            level: "beginner",
            suitabilities: ["warmup", "stretch"],
            sort: "name_asc",
          },
        },
      },
      {
        description: "在当前 run 已有受控 exerciseId 时，用 requiredExerciseIds 让这些发布态动作优先进入对应 groups。",
        action: {
          type: "tool_call",
          toolName: "searchExerciseResources",
          input: {
            suitabilities: ["training"],
            equipment: "no_equipment",
            level: "beginner",
            requiredExerciseIds: ["Pushups", "Bodyweight_Squat", "Plank"],
            sort: "name_asc",
          },
        },
      },
    ],
    handler: async (input) => {
      const excludeExerciseIds = normalizeExcludeExerciseIds(input.excludeExerciseIds);
      const requiredExerciseIds = normalizeRequiredExerciseIds(input.requiredExerciseIds);
      const muscles = normalizeFacetList(input.muscles);
      const normalizedInput = {
        ...input,
        muscles,
      };
      const suitabilities = normalizeSuitabilities(input.suitabilities);
      const [requiredExercises, results] = await Promise.all([
        requiredExerciseIds?.length
          ? getExerciseResourceSummariesByIds(requiredExerciseIds)
          : Promise.resolve([]),
        Promise.all(suitabilities.map((suitability) => searchExerciseResourceSummaries({
          q: input.q,
          category: input.category,
          suitability,
          level: input.level,
          force: input.force,
          mechanic: input.mechanic,
          equipment: input.equipment,
          homeRequirement: input.homeRequirement,
          muscles,
          goalTag: input.goalTag,
          riskTag: input.riskTag,
          excludeExerciseIds,
          maxReturned: agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
          published: input.published,
          sort: input.sort,
        }))),
      ]);
      const requiredById = new Map(requiredExercises.map((exercise) => [exercise.id, exercise]));
      const diagnostics: SearchExerciseResourcesOutput["diagnostics"] = [];
      const groupEntries = results.flatMap((result) => {
        const suitability = result.query.suitability;
        if (!suitability) {
          return [];
        }
        const baseExercises = result.exercises.map(toExerciseResourceOutput);
        const requiredDiagnostics = collectRequiredExerciseDiagnostics({
          requiredExerciseIds,
          requiredById,
          excludeExerciseIds,
          input: normalizedInput,
          suitability,
        });
        diagnostics.push(...requiredDiagnostics);
        const requiredExercisesForGroup = collectRequiredExercisesForGroup({
          requiredExerciseIds,
          requiredById,
          excludeExerciseIds,
          suitability,
        }).map(toExerciseResourceOutput);
        const mergedExercises = mergeExerciseOutputs(requiredExercisesForGroup, baseExercises, result.maxReturned);
        const baseExerciseIds = new Set(baseExercises.map((exercise) => exercise.exerciseId));
        const addedRequiredCount = requiredExercisesForGroup
          .filter((exercise) => !baseExerciseIds.has(exercise.exerciseId))
          .length;
        const totalMatches = result.totalMatches + addedRequiredCount;

        return [[
          suitability,
          {
            suitability,
            totalMatches,
            returnedCount: mergedExercises.length,
            truncated: result.truncated || requiredExercisesForGroup.length + baseExercises.length > result.maxReturned,
            exercises: mergedExercises,
          },
        ]];
      });
      const groups = Object.fromEntries(groupEntries) as SearchExerciseResourcesOutput["groups"];
      const firstResult = results[0];
      if (!firstResult) {
        throw new Error("searchExerciseResources requires at least one suitability.");
      }
      const totalMatches = Object.values(groups).reduce((sum, group) => sum + (group?.totalMatches ?? 0), 0);
      const returnedCount = Object.values(groups).reduce((sum, group) => sum + (group?.returnedCount ?? 0), 0);
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
          muscles: firstResult.query.muscles,
          goalTag: firstResult.query.goalTag,
          riskTag: firstResult.query.riskTag,
          excludeExerciseIds: firstResult.query.excludeExerciseIds,
          requiredExerciseIds,
          published: true,
          sort: firstResult.query.sort,
          appliedFilters: collectAppliedFilters(normalizedInput, suitabilities, excludeExerciseIds, requiredExerciseIds),
          filterSemantics: firstResult.filterSemantics ?? [],
          totalMatches,
          returnedCount,
          maxReturned,
          truncated: Object.values(groups).some((group) => Boolean(group?.truncated)),
          excludedCount: firstResult.excludedCount,
        },
        groups,
        diagnostics: [
          ...diagnostics,
          ...Object.values(groups).flatMap((group) => !group || group.totalMatches > 0
            ? []
            : [{
              suitability: group.suitability,
              code: "no_candidates" as const,
              message: outputNoCandidatesMessage(group.suitability, excludeExerciseIds),
            }]),
        ],
      };
    },
    toFulfillment: (output) => {
      if (isBroadExerciseResourceQueryOutput(output)) {
        return {
          satisfied: false,
          summary: "查询已执行，但 input 缺少可解释训练目标、facet、器械、场地、点名动作或当前 run 可见动作锚点；结果只能作为过宽查询诊断，不能支撑成功训练输出。",
        };
      }

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
    toModelObservation: (output) => {
      const coverage = buildSearchResultCoverage(output.groups);
      const broadQuery = isBroadExerciseResourceQueryOutput(output);

      return {
        status: output.status,
        factLevel: broadQuery ? "diagnostic" : "section_scoped_exercise_facts",
        fulfillment: {
          satisfied: !broadQuery,
        },
        suitabilities: output.query.suitabilities,
        totalMatches: output.query.totalMatches,
        returnedCount: output.query.returnedCount,
        truncated: output.query.truncated,
        excludedCount: output.query.excludedCount,
        availableSections: coverage.availableSections,
        sectionSummary: coverage.sectionSummary,
        missingSections: coverage.missingSections,
        querySpecificity: buildQuerySpecificityObservation(output),
        filterSemantics: output.query.filterSemantics,
        positiveAnchorBoundary: output.query.requiredExerciseIds?.length
          ? "requiredExerciseIds 是正向锚点，只表示优先纳入对应 groups.<section>.exercises 的受控动作事实。"
          : "本次查询未使用 requiredExerciseIds。",
        refreshExclusionBoundary: output.query.excludedCount > 0
          ? "本次查询已应用 excludeExerciseIds；候选不足时不得回填已排除动作。"
          : "本次查询未应用 excludeExerciseIds；该结果不证明当前 run 存在上一套可操作对象，也不代表刷新、替换或调整已完成。",
        groupSemantics: {
          groupKey: "groups.<section>",
          sectionRelation: "groups.<section>.exercises[] 中的动作是当前查询按该 section 返回的动作事实；生成 visibleTrainingProposal.exerciseItems[] 时，section 应与使用的 group key 保持一致。",
          allowedSectionsRelation: "每个动作的 allowedSections 是可进入哪些 section 的事实字段；exerciseItems[*].section 必须包含在该动作 allowedSections 中。",
        },
        appliedFilters: output.query.appliedFilters,
        groups: mapGroups(output.groups, (exercise) => ({
          exerciseId: exercise.exerciseId,
          nameZh: exercise.nameZh,
          nameEn: exercise.nameEn,
          equipmentZh: exercise.equipmentZh,
          homeRequirementZh: exercise.homeRequirementZh,
          primaryMusclesZh: exercise.primaryMusclesZh,
          allowedSections: exercise.allowedSections,
        })),
        diagnostics: output.diagnostics,
      };
    },
    toUserProjection: (output) => ({
      status: output.status,
      suitabilities: output.query.suitabilities,
      totalMatches: output.query.totalMatches,
      returnedCount: output.query.returnedCount,
      maxReturned: output.query.maxReturned,
      truncated: output.query.truncated,
      excludedCount: output.query.excludedCount,
      appliedFilters: output.query.appliedFilters,
      filterSemantics: output.query.filterSemantics,
      groups: mapGroups(output.groups, (exercise) => ({
        exerciseId: exercise.exerciseId,
        nameZh: exercise.nameZh,
        nameEn: exercise.nameEn,
        equipmentZh: exercise.equipmentZh,
        homeRequirementZh: exercise.homeRequirementZh,
        primaryMusclesZh: exercise.primaryMusclesZh,
        allowedSections: exercise.allowedSections,
        imageUrl: exercise.imageUrl,
      })),
      diagnostics: output.diagnostics,
    }),
  });
}

/** searchExerciseResourcesTool 是生产聊天可用的只读动作库事实查询能力，不产出训练候选资源。 */
export const searchExerciseResourcesTool = createSearchExerciseResourcesTool();

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

function normalizeRequiredExerciseIds(ids: string[] | undefined) {
  return ids ? [...new Set(ids)] : undefined;
}

function normalizeFacetList(values: string[] | undefined) {
  const uniqueValues = values ? [...new Set(values)] : [];
  return uniqueValues.length > 0 ? uniqueValues : undefined;
}

function normalizeSuitabilities(suitabilities: SearchExerciseResourcesInput["suitabilities"]) {
  return [...new Set(suitabilities?.length ? suitabilities : ["training"])] as Array<z.infer<typeof exerciseAllowedSectionSchema>>;
}

// isBroadExerciseResourceQueryOutput 只基于结构化 tool input 结果判断查询是否过宽，不读取用户原文。
function isBroadExerciseResourceQueryOutput(output: SearchExerciseResourcesOutput) {
  return !output.query.appliedFilters.some((filter) => isSpecificExerciseResourceFilter(filter.field));
}

function isSpecificExerciseResourceFilter(field: SearchExerciseResourcesOutput["query"]["appliedFilters"][number]["field"]) {
  return field !== "suitabilities" && field !== "published";
}

function buildQuerySpecificityObservation(output: SearchExerciseResourcesOutput): Record<string, string | string[]> {
  const broadQuery = isBroadExerciseResourceQueryOutput(output);
  const specificFilters = output.query.appliedFilters
    .filter((filter) => isSpecificExerciseResourceFilter(filter.field))
    .map((filter) => String(filter.field));

  if (broadQuery) {
    return {
      status: "too_broad",
      specificFilters,
      boundary: "本次 searchExerciseResources input 除默认 suitabilities、published、sort 外没有任何目标、facet、器械、场地、点名动作或当前 run 可见动作锚点；fulfillment.satisfied=false。",
    };
  }

  return {
    status: "constrained",
    specificFilters,
    boundary: "本次查询包含可解释结构化约束；返回事实仍需与 section、动作事实、prescription、schedule 和 terminal validator 边界共同校验。",
  };
}

function collectAppliedFilters(
  input: SearchExerciseResourcesInput,
  suitabilities: Array<z.infer<typeof exerciseAllowedSectionSchema>>,
  excludeExerciseIds: string[] | undefined,
  requiredExerciseIds: string[] | undefined,
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
    muscles: input.muscles,
    goalTag: input.goalTag,
    riskTag: input.riskTag,
    excludeExerciseIds,
    requiredExerciseIds,
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

function collectRequiredExerciseDiagnostics(input: {
  requiredExerciseIds: string[] | undefined;
  requiredById: Map<string, ExerciseResourceSummary>;
  excludeExerciseIds: string[] | undefined;
  input: SearchExerciseResourcesInput;
  suitability: z.infer<typeof exerciseAllowedSectionSchema>;
}): SearchExerciseResourcesOutput["diagnostics"] {
  if (!input.requiredExerciseIds?.length) {
    return [];
  }

  const excludedIds = new Set(input.excludeExerciseIds ?? []);
  const diagnostics: SearchExerciseResourcesOutput["diagnostics"] = [];
  for (const exerciseId of input.requiredExerciseIds) {
    const exercise = input.requiredById.get(exerciseId);
    if (!exercise) {
      diagnostics.push({
        suitability: input.suitability,
        code: "required_exercise_not_found",
        exerciseId,
        message: `指定动作 ${exerciseId} 不存在，无法纳入 ${input.suitability} 动作列表。`,
      });
      continue;
    }

    if (!exercise.isPublished) {
      diagnostics.push({
        suitability: input.suitability,
        code: "required_exercise_unpublished",
        exerciseId,
        message: `指定动作 ${exerciseId} 不是发布态动作，无法纳入 ${input.suitability} 动作列表。`,
      });
      continue;
    }

    if (excludedIds.has(exerciseId)) {
      diagnostics.push({
        suitability: input.suitability,
        code: "required_exercise_excluded",
        exerciseId,
        message: `指定动作 ${exerciseId} 同时出现在 excludeExerciseIds 中，已按排除条件阻止纳入。`,
      });
      continue;
    }

    if (!exercise.allowedSections.includes(input.suitability)) {
      diagnostics.push({
        suitability: input.suitability,
        code: "required_exercise_section_conflict",
        exerciseId,
        conflictFields: ["suitabilities"],
        message: `指定动作 ${exerciseId} 不适配 ${input.suitability} 用途，无法纳入该分组。`,
      });
      continue;
    }

    const conflictFields = collectRequiredExerciseFilterMismatches(exercise, input.input);
    if (conflictFields.length === 0) {
      continue;
    }

    diagnostics.push({
      suitability: input.suitability,
      code: "required_exercise_filter_mismatch",
      exerciseId,
      conflictFields,
      message: `指定动作 ${exerciseId} 已按用户点名优先纳入，但与当前筛选字段不完全一致：${conflictFields.join(", ")}。`,
    });
  }

  return diagnostics;
}

function collectRequiredExercisesForGroup(input: {
  requiredExerciseIds: string[] | undefined;
  requiredById: Map<string, ExerciseResourceSummary>;
  excludeExerciseIds: string[] | undefined;
  suitability: z.infer<typeof exerciseAllowedSectionSchema>;
}) {
  if (!input.requiredExerciseIds?.length) {
    return [];
  }

  const excludedIds = new Set(input.excludeExerciseIds ?? []);
  return input.requiredExerciseIds
    .map((exerciseId) => input.requiredById.get(exerciseId))
    .filter((exercise): exercise is ExerciseResourceSummary => Boolean(exercise))
    .filter((exercise) => exercise.isPublished)
    .filter((exercise) => !excludedIds.has(exercise.id))
    .filter((exercise) => exercise.allowedSections.includes(input.suitability));
}

function mergeExerciseOutputs(
  requiredExercises: ExerciseResourceOutput[],
  baseExercises: ExerciseResourceOutput[],
  maxReturned: number,
) {
  const byId = new Map<string, ExerciseResourceOutput>();
  for (const exercise of [...requiredExercises, ...baseExercises]) {
    if (!byId.has(exercise.exerciseId)) {
      byId.set(exercise.exerciseId, exercise);
    }
  }
  return [...byId.values()].slice(0, maxReturned);
}

function collectRequiredExerciseFilterMismatches(
  exercise: ExerciseResourceSummary,
  input: SearchExerciseResourcesInput,
) {
  const conflicts: string[] = [];

  if (input.q && !matchesExerciseText(exercise, input.q)) {
    conflicts.push("q");
  }
  if (input.category && !equalsAnyText(input.category, exercise.category, exercise.categoryZh)) {
    conflicts.push("category");
  }
  if (input.level && !equalsAnyText(input.level, exercise.level, exercise.levelZh)) {
    conflicts.push("level");
  }
  if (input.force && !equalsAnyText(input.force, exercise.force, exercise.forceZh)) {
    conflicts.push("force");
  }
  if (input.mechanic && !equalsAnyText(input.mechanic, exercise.mechanic, exercise.mechanicZh)) {
    conflicts.push("mechanic");
  }
  if (input.equipment && !matchesRequiredExerciseEquipment(input.equipment, exercise)) {
    conflicts.push("equipment");
  }
  if (input.homeRequirement && !equalsAnyText(input.homeRequirement, exercise.homeRequirement, exercise.homeRequirementZh)) {
    conflicts.push("homeRequirement");
  }
  const requestedMuscles = [...new Set(input.muscles ?? [])];
  if (
    requestedMuscles.length > 0
    && !requestedMuscles.some((muscle) => equalsAnyText(muscle, ...exercise.primaryMuscles, ...exercise.primaryMusclesZh, ...exercise.secondaryMuscles, ...exercise.secondaryMusclesZh))
  ) {
    if (input.muscles?.length) {
      conflicts.push("muscles");
    }
  }
  if (input.goalTag && !exercise.goalTags.includes(input.goalTag)) {
    conflicts.push("goalTag");
  }
  if (input.riskTag && !exercise.riskTags.includes(input.riskTag)) {
    conflicts.push("riskTag");
  }

  return conflicts;
}

function matchesExerciseText(exercise: ExerciseResourceSummary, query: string) {
  return matchesAnyText(
    query,
    exercise.id,
    exercise.nameEn,
    exercise.nameZh,
    exercise.category,
    exercise.categoryZh,
    exercise.level,
    exercise.levelZh,
    exercise.force,
    exercise.forceZh,
    exercise.mechanic,
    exercise.mechanicZh,
    exercise.equipment,
    exercise.equipmentZh,
    exercise.homeRequirement,
    exercise.homeRequirementZh,
    ...exercise.primaryMuscles,
    ...exercise.primaryMusclesZh,
    ...exercise.secondaryMuscles,
    ...exercise.secondaryMusclesZh,
    ...exercise.goalTags,
    ...exercise.riskTags,
  );
}

function matchesRequiredExerciseEquipment(requestedEquipment: string, exercise: ExerciseResourceSummary) {
  if (isNoEquipmentResourceQueryValue(requestedEquipment)) {
    return isBodyweightExerciseResourceEquipment(exercise);
  }

  return equalsAnyText(requestedEquipment, exercise.equipment, exercise.equipmentZh);
}

function matchesAnyText(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();
  return values.some((value) => {
    if (!value) {
      return false;
    }
    return value.toLowerCase().includes(normalizedQuery);
  });
}

function equalsAnyText(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();
  return values.some((value) => typeof value === "string" && value.toLowerCase() === normalizedQuery);
}

function outputNoCandidatesMessage(suitability: string, excludeExerciseIds: string[] | undefined) {
  if (excludeExerciseIds?.length) {
    return `${suitability} 用途在排除当前可见或明确排除动作后没有更多匹配候选。`;
  }

  return `${suitability} 用途当前没有匹配候选。`;
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

function buildSearchResultCoverage(groups: SearchExerciseResourcesOutput["groups"]) {
  const exerciseItems = visibleTrainingCompositionSections.flatMap((section) => {
    const group = groups[section];
    return group?.exercises.length
      ? group.exercises.map(() => ({ section }))
      : [];
  });

  return summarizeVisibleTrainingResourceCoverage({ exerciseItems });
}
