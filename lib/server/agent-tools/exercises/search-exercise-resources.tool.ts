import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import {
  getExerciseResourceSummariesByIds,
  searchExerciseResourceSummaries,
  type ExerciseResourceFacetCatalog,
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

const searchExerciseResourcesInputSchema = z.object({
  q: optionalTextFilterSchema.describe("确定性动作文本搜索字段，可匹配动作名称、公开分类、肌群、标签或 embeddingText；不是向量语义召回。"),
  category: optionalTextFilterSchema.describe(`动作分类或中文分类的精确筛选值。${catalogFacetDescription}`),
  suitabilities: z.array(exerciseAllowedSectionSchema)
    .min(1)
    .max(3)
    .optional()
    .describe("动作适配用途数组，只允许 warmup、training 或 stretch；省略时按 training 主训练候选查询。目标需要 routine 或 plan 且当前 run 缺少 warmup / stretch 动作事实时，可用 [\"warmup\", \"stretch\"] 或等价缺失 section 查询补齐候选。"),
  level: optionalTextFilterSchema.describe(`动作难度或中文难度的精确筛选值。${catalogFacetDescription}`),
  force: optionalTextFilterSchema.describe(`发力类型或中文发力类型的精确筛选值。${catalogFacetDescription}`),
  mechanic: optionalTextFilterSchema.describe(`动作机制或中文动作机制的精确筛选值。${catalogFacetDescription}`),
  equipment: optionalTextFilterSchema.describe(`器械或中文器械的精确筛选值。${catalogFacetDescription}`),
  homeRequirement: optionalTextFilterSchema.describe(`居家条件或中文居家条件的精确筛选值。${catalogFacetDescription}`),
  muscle: optionalTextFilterSchema.describe(`单个主肌群或辅助肌群的真实数据库 facet。${catalogFacetDescription}`),
  muscles: z.array(textFilterValueSchema)
    .min(1)
    .max(maxMuscles)
    .optional()
    .describe(`多个主肌群或辅助肌群真实数据库 facet 的 OR 查询数组。${catalogFacetDescription}`),
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
    "muscle",
    "muscles",
    "goalTag",
    "riskTag",
    "excludeExerciseIds",
    "requiredExerciseIds",
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
    muscle: z.string().optional(),
    muscles: z.array(z.string()).optional(),
    goalTag: z.string().optional(),
    riskTag: z.string().optional(),
    excludeExerciseIds: z.array(exerciseIdSchema).optional(),
    requiredExerciseIds: z.array(exerciseIdSchema).optional(),
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
    version: "0.5.0",
    description: "只读查询发布态动作事实原料，并按 suitabilities 分组返回安全动作摘要；它不生成最终 visibleTrainingProposal、routine、plan、prescription、schedule、保存结果或用户记忆。totalMatches=0 也是已完成的事实查询结果，不是数据库失败。",
    whenToUse: [
      "用于查询符合明确结构化条件的发布态动作列表，例如真实肌群 facet、多个肌群 OR 查询、器械、难度、居家条件、目标标签、风险标签、分类，或 suitabilities 指定的 warmup/training/stretch 用途。",
      "所有精确 facet 值应优先从 metadata.facetCatalog 中选择；muscle 表示单个真实肌群 facet，muscles 表示多个真实肌群 facet 的 OR 查询。",
      "旧高层身体区域查询字段已删除；模型应基于用户目标、对话上下文和 facetCatalog 自主选择真实数据库 facet，不要输出 input schema 中不存在的字段。",
      "如果需要确认当前会话是否存在可引用 visibleTrainingProposal，先使用 inspectVisibleTrainingProposals(operation = \"list_recent\")；如果需要复用具体上一轮方案，先使用 inspectVisibleTrainingProposals(operation = \"read_recent\") 导入当前 run。",
      "用户明确提出新的动作查询目标、结构化筛选条件或普通动作事实问题时，可以直接调用 searchExerciseResources，不需要强制先 inspectVisibleTrainingProposals。",
      "groups.<section>.exercises[*].exerciseId 是该查询结果中对应 section 的动作事实来源；当 fulfillment.satisfied = true 时，可作为 final_answer.visibleOutputs[] 中 visibleTrainingProposal.exerciseItems[*].exerciseId 的受控来源。",
      "最终训练输出只能由 final_answer.visibleOutputs[] 承载；如果生成 visibleTrainingProposal.exerciseItems[]，exerciseItems[*].section 应对应使用的 groups.<section> key，并且必须被该动作 allowedSections 包含；allowedSections 是动作可进入哪些 section 的动作事实字段。",
      "requiredExerciseIds 是正向查询锚点：当当前 run 已有受控发布态 exerciseId，例如来自 resolveExerciseResourceMentions、已导入可消费训练事实或用户明确给出的受控 id 时，可传入 requiredExerciseIds，让这些动作优先进入现有 groups.<section>.exercises；它不是排除列表，也不表示替换。",
      "当用户点名多个具体动作时，应先调用 resolveExerciseResourceMentions 解析 mentions；再把 matched exerciseId 或模型从 ambiguous 中选择的 exerciseId 传入 requiredExerciseIds，让这些发布态动作优先进入现有 groups.<section>.exercises。",
      "当 Planner 已判断需要替换上一套用户可见 visibleTrainingProposal 的动作，并且已通过当前 run 可见事实获得上一套已看到 exerciseItems 时，可以在保留原目标、器械、难度、居家条件、section、时长或计划约束的前提下，用 excludeExerciseIds 查询替代动作；不同 section 的替代动作仍必须来自对应 groups.<section>.exercises。",
      "如果模型根据用户目标已经需要 routine 或 plan，且当前 run 只有 training 动作事实或缺少 warmup / stretch 动作事实，应优先使用 suitabilities = [\"warmup\", \"stretch\"] 或等价缺失 section 查询补齐热身和拉伸候选；不得因为当前只查到 training 动作事实就把 routine 或 plan 目标降级输出为 payload.kind = \"exercise_selection\"。",
      "继续查询缺失 section 只适用于模型已判断目标需要 routine 或 plan 的场景；普通动作推荐和动作事实问答不要求固定查询 warmup / training / stretch，也不要求固定 tool 调用次数或顺序。",
      "excludeExerciseIds 是负向约束，只能填写用户已经看到且当前目标确实需要替换、排除或避免重复的动作，或用户明确要求排除的动作；如果来自上一轮方案，应先通过 inspectVisibleTrainingProposals(operation = \"read_recent\") 导入 visible_training_proposal_fact 后复制真实 exerciseId，不要从未展示的内部候选、trace 摘要、handler-only 结果或 list_recent 索引中填充。",
      "精确筛选必须使用真实数据库 facet 值；服务端只执行 schema、去空、去重、权限边界和数据库查询，不根据用户原文替模型增删 facet。",
      "查询成功且 satisfied=true 的结果，包括 totalMatches=0 的结果，可以在同一 run 通过 final_answer.usedToolResultIds 支撑普通事实回答；训练推送事实必须写入 final_answer.visibleOutputs[]，不要只写正文。",
      "本 tool 不要求固定 tool 调用次数或顺序；它只提供当前查询实际返回 section 的动作事实。",
    ].join(" "),
    whenNotToUse: [
      "不要用它生成 visibleTrainingProposal、routine、plan、patch、prescription、schedule、训练卡片、保存 artifact、用户记忆或执行候选集合。",
      "不要用它判断当前会话有没有上一轮 visibleTrainingProposal、列出 factRef/messageId、读取完整 visibleTrainingProposal.payload，或替代 inspectVisibleTrainingProposals 的 list_recent / read_recent 事实查询。",
      "不要把 0 条事实查询结果当作 visibleTrainingProposal、routine、plan、训练卡片或推荐候选集合的消费证据；模型应基于 diagnostics 选择重查、澄清或失败收口。",
      "不要把 groups.training 中且 allowedSections 不包含 warmup/stretch 的动作写入 visibleTrainingProposal.exerciseItems[*].section = warmup 或 stretch；不同 section 需要对应 section 的动作事实支撑。",
      "不要因为当前只查到 training 动作事实，就把模型已经判断需要 routine 或 plan 的目标降级输出为 payload.kind = \"exercise_selection\"；应继续补查缺失 section、澄清或失败收口。",
      "不要用它查询未发布动作、单个动作详情、唯一动作名解析、全库 facet 统计、分页或语义向量检索。",
      "不要把需要保留、复用、派生或调整的动作写进 excludeExerciseIds；这些目标应把受控动作作为正向事实来源，必要时通过 requiredExerciseIds 锚定查询。",
      "不要在没有 resolveExerciseResourceMentions、已导入可消费训练事实或其他当前 run 可见数据库事实支撑时编造 requiredExerciseIds；该字段只能填真实发布态动作 id，不能填自然语言动作名。",
      "不要传入 maxReturned、returnedCount、totalMatches、truncated、limit、take、offset、page 或 pageSize；这些不是 input 字段。",
      "不要从 handler-only 结果、model observation、diagnostic 候选，未进入用户可见 visibleTrainingProposal 的内部候选，或未导入当前 run 的自然语言历史中提取 excludeExerciseIds。",
      "不要把 leg、lower body、upper body、full body、腿部、下肢、上肢或全身这类宽泛区域直接当成真实 muscle facet；应由模型基于 facetCatalog 选择数据库中真实存在的一个或多个肌群。",
      "failed、invalid-input 或 satisfied=false 的结果不能支撑成功 final_answer。",
    ].join(" "),
    inputSchema: searchExerciseResourcesInputSchema,
    outputSchema: searchExerciseResourcesOutputSchema,
    metadata: options.facetCatalog ? { facetCatalog: options.facetCatalog } : undefined,
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
      timeoutMs: 1_000,
    },
    examples: [
      {
        description: "按多个真实肌群、器械、居家条件、用途和难度查询 training 动作事实。",
        input: {
          muscles: ["胸部", "肱三头肌"],
          equipment: "body only",
          homeRequirement: "none",
          suitabilities: ["training"],
          level: "beginner",
        },
      },
      {
        description: "当 routine 或 plan 目标已有 training 动作事实但缺少热身和拉伸时，基于数据库真实 facet 同时查询 warmup 和 stretch 用途的动作事实。",
        input: {
          suitabilities: ["warmup", "stretch"],
          homeRequirement: "none",
          sort: "name_asc",
        },
      },
      {
        description: "在当前 run 已有受控 exerciseId 时，用 requiredExerciseIds 要求这些发布态动作优先进入对应 groups。",
        input: {
          suitabilities: ["training"],
          equipment: "body only",
          homeRequirement: "none",
          level: "beginner",
          requiredExerciseIds: ["Pushups", "Bodyweight_Squat", "Plank"],
          sort: "name_asc",
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
          muscle: input.muscle,
          muscles,
          goalTag: input.goalTag,
          riskTag: input.riskTag,
          excludeExerciseIds,
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
          muscle: firstResult.query.muscle,
          muscles: firstResult.query.muscles,
          goalTag: firstResult.query.goalTag,
          riskTag: firstResult.query.riskTag,
          excludeExerciseIds: firstResult.query.excludeExerciseIds,
          requiredExerciseIds,
          published: true,
          sort: firstResult.query.sort,
          appliedFilters: collectAppliedFilters(normalizedInput, suitabilities, excludeExerciseIds, requiredExerciseIds),
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

      return {
        status: output.status,
        suitabilities: output.query.suitabilities,
        totalMatches: output.query.totalMatches,
        returnedCount: output.query.returnedCount,
        truncated: output.query.truncated,
        excludedCount: output.query.excludedCount,
        availableSections: coverage.availableSections,
        sectionSummary: coverage.sectionSummary,
        missingSectionsForRoutineOrPlan: coverage.missingSectionsForRoutineOrPlan,
        supportsOutputKinds: coverage.supportsOutputKinds,
        outputSummaryNote: "totalMatches、returnedCount、truncated、excludedCount、groups 和 diagnostics 是本次查询输出摘要，不是下一轮 searchExerciseResources input。",
        finalAnswerGrounding: "当 fulfillment.satisfied=true，本次查询事实包括 totalMatches=0 的结果，toolResultId 可支撑 final_answer.usedToolResultIds 中的普通事实回答；如果要推送训练结构，最终事实必须写入 final_answer.visibleOutputs[] 的 visibleTrainingProposal.payload。",
        candidateConsumptionBoundary: "groups.<section>.exercises[*].exerciseId 可作为 visibleTrainingProposal.exerciseItems[*].exerciseId 的事实来源；当前 observation 只提供本次查询实际返回动作的 section-scoped 事实原料，availableSections 只包含本次 groups 中确实返回动作的 section。本次动作查询不证明当前 run 存在可操作的上一轮 visibleTrainingProposal，也不证明已经完成刷新、替换或调整。prescription、schedule 和最终 payload.kind 需要由 final_answer.visibleOutputs[] 明确输出。若目标结构还缺 section 或字段，模型应基于可见事实自主继续查询、澄清、失败收口或输出当前事实可支撑的结构。",
        positiveAnchorBoundary: output.query.requiredExerciseIds?.length
          ? "本次查询使用 requiredExerciseIds 作为正向锚点；这些 id 只表示应优先纳入对应 groups.<section>.exercises 的受控动作事实，不表示排除、替换或已经生成最终训练方案。"
          : "本次查询未使用 requiredExerciseIds；如果目标是保留、复用、派生或调整当前 run 可见动作，应优先把受控动作作为正向事实来源，而不是写入 excludeExerciseIds。",
        refreshExclusionBoundary: output.query.excludedCount > 0
          ? "本次查询已应用 excludeExerciseIds；这些 id 只能代表当前 run 可见且当前目标需要替换、排除或避免重复的动作，或用户明确要求排除的动作。若当前条件下可替代候选不足，模型应说明无法完全换新、询问是否放宽条件或只输出可支撑结构，不得为了填满新方案回填已排除动作。"
          : "本次查询未应用 excludeExerciseIds；该查询只提供动作事实，不证明当前 run 存在上一套可操作的 visibleTrainingProposal，也不证明已经完成刷新、替换或调整。如果目标是操作已有对象，应先基于当前可见引用事实确认对象；引用对象不可见时，不得用本查询结果宣称刷新、替换或调整成功。",
        routinePlanCompositionBoundary: buildRoutinePlanCompositionBoundary(output.groups),
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
    muscle: input.muscle,
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
  if (input.equipment && !equalsAnyText(input.equipment, exercise.equipment, exercise.equipmentZh)) {
    conflicts.push("equipment");
  }
  if (input.homeRequirement && !equalsAnyText(input.homeRequirement, exercise.homeRequirement, exercise.homeRequirementZh)) {
    conflicts.push("homeRequirement");
  }
  const requestedMuscles = [...new Set([input.muscle, ...(input.muscles ?? [])].filter((value): value is string => Boolean(value)))];
  if (
    requestedMuscles.length > 0
    && !requestedMuscles.some((muscle) => equalsAnyText(muscle, ...exercise.primaryMuscles, ...exercise.primaryMusclesZh, ...exercise.secondaryMuscles, ...exercise.secondaryMusclesZh))
  ) {
    if (input.muscle) {
      conflicts.push("muscle");
    }
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
    return `${suitability} 用途在排除用户已看到或明确要求排除的动作后没有更多匹配候选；Agent 可说明无法完全换新、询问是否放宽条件或只输出当前事实可支撑的结构，不得回填已排除动作。`;
  }

  return `${suitability} 用途当前没有匹配候选；Agent 可调整结构化筛选、澄清用户条件或失败收口。`;
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

function buildRoutinePlanCompositionBoundary(groups: SearchExerciseResourcesOutput["groups"]) {
  const coverage = buildSearchResultCoverage(groups);
  const returnedSections = coverage.availableSections;
  const missingSectionsForRoutineOrPlan = coverage.missingSectionsForRoutineOrPlan;
  const onlyTrainingReturned = returnedSections.length === 1 && returnedSections[0] === "training";

  return {
    returnedSections,
    availableSections: coverage.availableSections,
    missingSectionsForRoutineOrPlan,
    supportsOutputKinds: coverage.supportsOutputKinds,
    note: onlyTrainingReturned
      ? "当前结果只提供 training 动作事实；如果最终目标是 routine 或 plan，还需要当前 run 可消费的 warmup 和 stretch 动作事实，可用 suitabilities = [\"warmup\", \"stretch\"] 或等价缺失 section 查询补齐候选。不得把未返回的 section 伪造成已获得事实，也不得把本次 tool result 直接当作最终 visibleTrainingProposal。"
      : "如果最终目标是 routine 或 plan，模型应检查 returnedSections 与 missingSectionsForRoutineOrPlan；缺失 section 可通过 suitabilities 指定缺失用途继续查询。不得把未返回的 section 伪造成已获得事实，也不得把本次 tool result 直接当作最终 visibleTrainingProposal。",
  };
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
