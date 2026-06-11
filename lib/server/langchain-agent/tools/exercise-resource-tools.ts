import "server-only";

import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  getExerciseResourceSummariesByIds,
  isBodyweightExerciseResourceEquipment,
  isNoEquipmentResourceQueryValue,
  isRemovedNoEquipmentHomeRequirementValue,
  normalizeExerciseResourceFacetCatalogForPlanner,
  resolveExerciseResourceMentionSummaries,
  searchExerciseResourceSummaries,
  type ExerciseResourceFacetCatalog,
  type ExerciseResourceFilterSemantic,
  type ExerciseResourceMentionResolutionResult,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import {
  buildExerciseResourceFilterApplication,
  EXERCISE_RESOURCE_FILTER_APPLICATION_FIELDS,
  EXERCISE_RESOURCE_SUPPORT_SECTION_UNAPPLIED_FILTER_CODE,
  type ExerciseResourceFilterApplication,
} from "@/lib/server/exercises/exercise-resource-filter-policy";
import { summarizeVisibleTrainingResourceCoverage, visibleTrainingCompositionSections } from "@/lib/server/visible-training-proposals/visible-training-resource-coverage";
import { exerciseSortSchema } from "@/lib/shared/exercises/query-schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

import { defineLangChainToolWrapper } from "../tool-wrapper";
import { toLangChainJsonValue } from "../utils";

const maxMentionCount = 12;
const textFilterValueSchema = z.string().trim().min(1).max(120);
const optionalTextFilterSchema = textFilterValueSchema.optional();
const publishedInputSchema = z.literal(true).optional().default(true);
const maxExcludeExerciseIds = 50;
const maxRequiredExerciseIds = 12;
const maxMuscles = 20;
const exerciseIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const catalogFacetDescription = "精确筛选值应优先从动作库 facet catalog 的对应数组中选择；服务端只执行 schema、去空、去重和数据库查询。";
const trainingPolicyFacetDescription = `${catalogFacetDescription}该字段在 training policy 中作为 hard filter；warmup / stretch 的 support_section policy 会在 filterApplications.unappliedInputFilters 中披露其未作为 hard filter 使用。`;

const mentionInputSchema = z.object({
  text: z.string()
    .trim()
    .min(1)
    .max(80)
    .describe("模型从用户表达中结构化提取出的单个动作点名文本；不要传入完整用户消息、历史摘要或多个动作拼成的长句。"),
  sectionHint: exerciseAllowedSectionSchema
    .optional()
    .describe("可选动作用途提示，只允许 warmup、training 或 stretch；该字段只辅助模型理解结果，不替代数据库 allowedSections。"),
}).strict();

const exerciseMentionSummarySchema = z.object({
  exerciseId: z.string().min(1),
  nameEn: z.string(),
  nameZh: z.string(),
  categoryZh: z.string().nullable(),
  levelZh: z.string().nullable(),
  equipmentZh: z.string().nullable(),
  homeRequirementZh: z.string(),
  primaryMusclesZh: z.array(z.string()),
  allowedSections: z.array(exerciseAllowedSectionSchema),
  imageUrl: z.string().nullable(),
  reviewStatus: z.string(),
  isPublished: z.literal(true),
}).strict();

const mentionDiagnosticSchema = z.object({
  code: z.enum(["mention_ambiguous", "mention_not_found"]),
  message: z.string(),
  text: z.string(),
  sectionHint: exerciseAllowedSectionSchema.optional(),
}).strict();

const mentionResolutionResultSchema = z.object({
  text: z.string(),
  sectionHint: exerciseAllowedSectionSchema.optional(),
  status: z.enum(["matched", "ambiguous", "not_found"]),
  totalMatches: z.number().int().min(0),
  returnedCount: z.number().int().min(0),
  truncated: z.boolean(),
  matches: z.array(exerciseMentionSummarySchema),
  diagnostics: z.array(mentionDiagnosticSchema),
}).strict();

const equipmentFilterSchema = optionalTextFilterSchema
  .describe(`器械可用性或器械类别的精确筛选值；无外部器械统一使用 no_equipment。${catalogFacetDescription}`);
const homeRequirementFilterSchema = textFilterValueSchema
  .refine((value) => !isRemovedNoEquipmentHomeRequirementValue(value), {
    message: "homeRequirement 只表示环境、场地或支撑条件；无外部器械约束应使用 equipment = \"no_equipment\"。",
  })
  .optional()
  .describe(`环境、场地或支撑条件的精确筛选值，例如地面、支撑物、户外、搭档、居家小器械或健身房器械；不表示器械可用性。${catalogFacetDescription}`);

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

const filterApplicationFieldSchema = z.enum(EXERCISE_RESOURCE_FILTER_APPLICATION_FIELDS);
const hardFilterPolicySchema = z.enum(["training", "support_section"]);
const unappliedInputFilterSchema = z.object({
  field: filterApplicationFieldSchema,
  code: z.literal(EXERCISE_RESOURCE_SUPPORT_SECTION_UNAPPLIED_FILTER_CODE),
  valueSummary: z.string().max(80).optional(),
}).strict();
const filterApplicationSchema = z.object({
  section: exerciseAllowedSectionSchema,
  hardFilterPolicy: hardFilterPolicySchema,
  appliedHardFilters: z.array(filterApplicationFieldSchema),
  unappliedInputFilters: z.array(unappliedInputFilterSchema),
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

/** resolveExerciseResourceMentionsInputSchema 定义模型可调用的点名动作解析输入，只接受结构化 mention。 */
export const resolveExerciseResourceMentionsInputSchema = z.object({
  mentions: z.array(mentionInputSchema)
    .min(1)
    .max(maxMentionCount)
    .describe("用户明确点名的动作数组，由模型负责从自然语言中结构化提取；服务端只处理这里的文本。"),
}).strict();

/** resolveExerciseResourceMentionsOutputSchema 校验点名解析工具返回给模型和 trace 的发布态候选事实。 */
export const resolveExerciseResourceMentionsOutputSchema = z.object({
  status: z.literal("succeeded"),
  mentionCount: z.number().int().min(0),
  matchedCount: z.number().int().min(0),
  ambiguousCount: z.number().int().min(0),
  notFoundCount: z.number().int().min(0),
  results: z.array(mentionResolutionResultSchema),
}).strict();

/** searchExerciseResourcesInputSchema 定义发布态动作事实查询输入，不接受分页、limit、userId 或自然语言分流参数。 */
export const searchExerciseResourcesInputSchema = z.object({
  q: optionalTextFilterSchema.describe("确定性动作文本搜索字段，可匹配动作名称、公开分类、肌群、标签或 embeddingText；不是向量语义召回；仅在 training policy 中作为 hard filter，support_section policy 会披露其未作为 hard filter 使用且模型可见投影不回灌 q 原文。"),
  category: optionalTextFilterSchema.describe(`动作分类或中文分类的精确筛选值。${trainingPolicyFacetDescription}`),
  suitabilities: z.array(exerciseAllowedSectionSchema)
    .min(1)
    .max(3)
    .optional()
    .describe("动作适配用途数组，只允许 warmup、training 或 stretch；省略时按 training 主训练候选查询。training 使用严格 hard filter policy；warmup / stretch 使用 support_section policy，只把发布态、section、器械、场地、肌群和受控动作 id 作为 hard filter。目标需要 routine 或 plan、当前 run 已有 training 动作事实且缺少 warmup / stretch 时，可用 [\"warmup\", \"stretch\"] 或等价缺失 section 查询补齐候选。"),
  level: optionalTextFilterSchema.describe(`动作难度或中文难度的精确筛选值。${trainingPolicyFacetDescription}`),
  force: optionalTextFilterSchema.describe(`发力类型或中文发力类型的精确筛选值。${trainingPolicyFacetDescription}`),
  mechanic: optionalTextFilterSchema.describe(`动作机制或中文动作机制的精确筛选值。${trainingPolicyFacetDescription}`),
  equipment: equipmentFilterSchema,
  homeRequirement: homeRequirementFilterSchema,
  muscles: z.array(textFilterValueSchema)
    .min(1)
    .max(maxMuscles)
    .optional()
    .describe(`一个或多个主肌群或辅助肌群真实数据库 facet 的 OR 查询数组；单个肌群也写成一项数组。${catalogFacetDescription}`),
  goalTag: optionalTextFilterSchema.describe(`动作目标标签的精确筛选值。${trainingPolicyFacetDescription}`),
  riskTag: optionalTextFilterSchema.describe(`动作风险标签的精确筛选值。${trainingPolicyFacetDescription}`),
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

/** searchExerciseResourcesOutputSchema 校验 section-scoped 动作事实和查询诊断摘要。 */
export const searchExerciseResourcesOutputSchema = z.object({
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
    filterApplications: z.array(filterApplicationSchema)
      .describe("section 级 tool 执行事实摘要；hardFilterPolicy 只表示该 section 的数据库 hard filter 口径，不表示 Planner 下一步行为策略。"),
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

type ResolveExerciseResourceMentionsInput = z.infer<typeof resolveExerciseResourceMentionsInputSchema>;
type ResolveExerciseResourceMentionsOutput = z.infer<typeof resolveExerciseResourceMentionsOutputSchema>;
type MentionInput = z.infer<typeof mentionInputSchema>;
type MentionResolutionOutput = z.infer<typeof mentionResolutionResultSchema>;
type ExerciseMentionSummaryOutput = z.infer<typeof exerciseMentionSummarySchema>;
type SearchExerciseResourcesInput = z.infer<typeof searchExerciseResourcesInputSchema>;
type SearchExerciseResourcesOutput = z.infer<typeof searchExerciseResourcesOutputSchema>;
type ExerciseResourceOutput = z.infer<typeof exerciseResourceSummarySchema>;
type SuitabilityGroupOutput = z.infer<typeof suitabilityGroupSchema>;

export type CreateSearchExerciseResourcesLangChainToolOptions = {
  facetCatalog?: ExerciseResourceFacetCatalog;
};

/** resolveExerciseResourceMentionsLangChainTool 解析用户明确点名的动作到发布态 Exercise 候选，不做自然语言分流。 */
export const resolveExerciseResourceMentionsLangChainTool = defineLangChainToolWrapper<
  typeof resolveExerciseResourceMentionsInputSchema,
  ResolveExerciseResourceMentionsOutput
>({
  name: "resolveExerciseResourceMentions",
  description: [
    "把用户明确点名的单个动作名解析为发布态 Exercise 候选，返回 matched、ambiguous 或 not_found。",
    "使用边界：mentions[].text 只放单个动作名；不要传完整用户消息、历史摘要、分页、userId、sql 或训练生成参数。",
    "matched exerciseId 只能作为后续 searchExerciseResources.requiredExerciseIds；本 tool result 不能直接写入 visibleTrainingProposal.exerciseItems。",
    "ambiguous 需要模型选择候选、重新查询或向用户澄清；not_found 不能作为动作事实。",
  ].join("\n"),
  inputSchema: resolveExerciseResourceMentionsInputSchema,
  outputSchema: resolveExerciseResourceMentionsOutputSchema,
  timeoutMs: agentRuntimeConfig.tools.resolveExerciseResourceMentions.timeoutMs,
  handler: async (input) => {
    const resolved = await Promise.all(input.mentions.map(async (mention) => {
      const result = await resolveExerciseResourceMentionSummaries({
        text: mention.text,
        maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches,
      });
      return toMentionResolutionOutput(mention, result);
    }));

    return {
      status: "succeeded",
      mentionCount: input.mentions.length,
      matchedCount: resolved.filter((result) => result.status === "matched").length,
      ambiguousCount: resolved.filter((result) => result.status === "ambiguous").length,
      notFoundCount: resolved.filter((result) => result.status === "not_found").length,
      results: resolved,
    };
  },
  toModelVisibleSummary: (output) => ({
    status: output.status,
    factLevel: "resolved_candidates",
    fulfillment: {
      satisfied: true,
    },
    mentionCount: output.mentionCount,
    matchedCount: output.matchedCount,
    ambiguousCount: output.ambiguousCount,
    notFoundCount: output.notFoundCount,
    requiredExerciseIdsBoundary: "matched 或模型从 ambiguous 候选中选择的 exerciseId 可作为后续 requiredExerciseIds 正向锚点。",
    outputBoundary: "本 observation 不能直接作为 visibleTrainingProposal.exerciseItems[*].exerciseId 的动作事实来源；最终动作事实仍需来自 section-scoped 动作查询结果或已导入的训练业务事实。",
    results: output.results.map((result) => ({
      text: result.text,
      ...(result.sectionHint ? { sectionHint: result.sectionHint } : {}),
      status: result.status,
      totalMatches: result.totalMatches,
      returnedCount: result.returnedCount,
      truncated: result.truncated,
      matches: result.matches.map((match) => ({
        exerciseId: match.exerciseId,
        nameZh: match.nameZh,
        nameEn: match.nameEn,
        equipmentZh: match.equipmentZh,
        homeRequirementZh: match.homeRequirementZh,
        primaryMusclesZh: match.primaryMusclesZh,
        allowedSections: match.allowedSections,
        imageUrl: match.imageUrl,
      })),
      diagnostics: result.diagnostics.map(toJsonMentionDiagnostic),
    })),
  }),
  toUserProjection: (output) => ({
    status: output.status,
    mentionCount: output.mentionCount,
    matchedCount: output.matchedCount,
    ambiguousCount: output.ambiguousCount,
    notFoundCount: output.notFoundCount,
    results: output.results.map((result) => ({
      text: result.text,
      ...(result.sectionHint ? { sectionHint: result.sectionHint } : {}),
      status: result.status,
      matches: result.matches.map((match) => ({
        exerciseId: match.exerciseId,
        nameZh: match.nameZh,
        nameEn: match.nameEn,
        equipmentZh: match.equipmentZh,
        homeRequirementZh: match.homeRequirementZh,
        primaryMusclesZh: match.primaryMusclesZh,
        allowedSections: match.allowedSections,
        imageUrl: match.imageUrl,
      })),
      diagnostics: result.diagnostics.map(toJsonMentionDiagnostic),
    })),
  }),
  toTraceSummary: (output) => ({
    status: output.status,
    mentionCount: output.mentionCount,
    matchedCount: output.matchedCount,
    ambiguousCount: output.ambiguousCount,
    notFoundCount: output.notFoundCount,
  }),
});

/** createSearchExerciseResourcesLangChainTool 构造发布态动作事实查询 LangChain tool，可注入当前动作库 facet catalog。 */
export function createSearchExerciseResourcesLangChainTool(
  options: CreateSearchExerciseResourcesLangChainToolOptions = {},
) {
  return defineLangChainToolWrapper<typeof searchExerciseResourcesInputSchema, SearchExerciseResourcesOutput>({
    name: "searchExerciseResources",
    description: [
      "只读查询发布态 Exercise 动作事实，并按 suitabilities 返回 groups.<section>.exercises[]；这些 section-scoped exercises 是训练结构动作项的主要事实来源。",
      "使用边界：用户需要动作候选、routine 或 plan，并且已有肌群、器械、难度、场地、目标标签、section 用途或受控 exerciseId 等结构化约束时使用。",
      "所有精确 facet 值应优先从动作库 facet catalog 选择；无外部器械统一写 equipment: \"no_equipment\"；homeRequirement 只表示环境、场地或支撑条件。",
      "requiredExerciseIds 是正向锚点，用于让已解析或已导入的发布态动作优先进入 groups；excludeExerciseIds 是负向排除，用于替换或避免重复。",
      "不要用本 tool 判断当前会话有没有上一轮 visibleTrainingProposal、读取完整历史方案、查询未发布动作、分页、limit、offset、page、pageSize 或语义向量检索。",
      formatFacetCatalogForDescription(options.facetCatalog),
    ].filter(Boolean).join("\n"),
    inputSchema: searchExerciseResourcesInputSchema,
    outputSchema: searchExerciseResourcesOutputSchema,
    timeoutMs: agentRuntimeConfig.tools.searchExerciseResources.timeoutMs,
    handler: async (input) => {
      const excludeExerciseIds = normalizeExcludeExerciseIds(input.excludeExerciseIds);
      const requiredExerciseIds = normalizeRequiredExerciseIds(input.requiredExerciseIds);
      const muscles = normalizeFacetList(input.muscles);
      const normalizedInput = {
        ...input,
        muscles,
      };
      const suitabilities = normalizeSuitabilities(input.suitabilities);
      const filterApplications = suitabilities.map((suitability) => buildExerciseResourceFilterApplication({
        ...normalizedInput,
        suitability,
        excludeExerciseIds,
        requiredExerciseIds,
        published: input.published,
      }));
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
          requiredExerciseIds,
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
        const totalMatches = Math.max(result.totalMatches, baseExercises.length + addedRequiredCount);

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
          appliedFilters: collectAppliedFilters(normalizedInput, filterApplications, suitabilities, excludeExerciseIds, requiredExerciseIds),
          filterApplications,
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
    toModelVisibleSummary: (output) => {
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
        filterApplicationBoundary: "filterApplications 是 searchExerciseResources 的 section 级 tool 执行事实摘要；hardFilterPolicy 只表示数据库 hard filter 口径，不表示 Planner 下一步行为策略。",
        filterApplications: toProjectionFilterApplications(output.query.filterApplications),
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
      filterApplications: toProjectionFilterApplications(output.query.filterApplications),
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
    toTraceSummary: (output) => toLangChainJsonValue({
      status: output.status,
      suitabilities: output.query.suitabilities,
      totalMatches: output.query.totalMatches,
      returnedCount: output.query.returnedCount,
      diagnostics: output.diagnostics.map((diagnostic) => ({
        suitability: diagnostic.suitability,
        code: diagnostic.code,
        ...(diagnostic.exerciseId ? { exerciseId: diagnostic.exerciseId } : {}),
      })),
    }),
  });
}

/** searchExerciseResourcesLangChainTool 是生产 LangChain 默认动作库查询能力，facet catalog 可由 route 注入替换。 */
export const searchExerciseResourcesLangChainTool = createSearchExerciseResourcesLangChainTool();

function toMentionResolutionOutput(
  mention: MentionInput,
  result: ExerciseResourceMentionResolutionResult,
): MentionResolutionOutput {
  const status = resolveMentionStatus(result);
  const matches = selectMentionMatches(status, result).map(toExerciseMentionSummaryOutput);
  const diagnostics = createMentionDiagnostics(mention, status);

  return {
    text: mention.text,
    sectionHint: mention.sectionHint,
    status,
    totalMatches: result.totalMatches,
    returnedCount: matches.length,
    truncated: result.truncated,
    matches,
    diagnostics,
  };
}

function resolveMentionStatus(result: ExerciseResourceMentionResolutionResult): MentionResolutionOutput["status"] {
  if (result.totalMatches === 0 || result.exercises.length === 0) {
    return "not_found";
  }

  if (result.exactMatchCount === 1 || result.totalMatches === 1) {
    return "matched";
  }

  return "ambiguous";
}

function selectMentionMatches(
  status: MentionResolutionOutput["status"],
  result: ExerciseResourceMentionResolutionResult,
) {
  if (status === "matched") {
    return result.exercises.slice(0, 1);
  }

  return result.exercises;
}

function createMentionDiagnostics(
  mention: MentionInput,
  status: MentionResolutionOutput["status"],
): MentionResolutionOutput["diagnostics"] {
  if (status === "matched") {
    return [];
  }

  if (status === "ambiguous") {
    return [{
      code: "mention_ambiguous",
      message: `点名动作“${mention.text}”匹配到多个发布态动作；模型应选择候选、重新查询或向用户澄清。`,
      text: mention.text,
      sectionHint: mention.sectionHint,
    }];
  }

  return [{
    code: "mention_not_found",
    message: `点名动作“${mention.text}”没有解析到发布态数据库动作；该结果不能作为 visibleTrainingProposal 动作来源。`,
    text: mention.text,
    sectionHint: mention.sectionHint,
  }];
}

function toExerciseMentionSummaryOutput(summary: ExerciseResourceSummary): ExerciseMentionSummaryOutput {
  return {
    exerciseId: summary.id,
    nameEn: summary.nameEn,
    nameZh: summary.nameZh,
    categoryZh: summary.categoryZh,
    levelZh: summary.levelZh,
    equipmentZh: summary.equipmentZh,
    homeRequirementZh: summary.homeRequirementZh,
    primaryMusclesZh: summary.primaryMusclesZh,
    allowedSections: summary.allowedSections,
    imageUrl: summary.imageUrls[0] ?? null,
    reviewStatus: summary.reviewStatus,
    isPublished: true,
  };
}

function toJsonMentionDiagnostic(diagnostic: MentionResolutionOutput["diagnostics"][number]) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    text: diagnostic.text,
    ...(diagnostic.sectionHint ? { sectionHint: diagnostic.sectionHint } : {}),
  };
}

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
  return !output.query.filterApplications.some((application) =>
    application.appliedHardFilters.some(isSpecificExerciseResourceFilter),
  );
}

function isSpecificExerciseResourceFilter(field: SearchExerciseResourcesOutput["query"]["filterApplications"][number]["appliedHardFilters"][number]) {
  return field !== "suitabilities" && field !== "published";
}

function buildQuerySpecificityObservation(output: SearchExerciseResourcesOutput): Record<string, string | string[]> {
  const broadQuery = isBroadExerciseResourceQueryOutput(output);
  const specificFilters = [
    ...new Set(output.query.filterApplications.flatMap((application) =>
      application.appliedHardFilters.filter(isSpecificExerciseResourceFilter),
    )),
  ];

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

function toProjectionFilterApplications(filterApplications: ExerciseResourceFilterApplication[]) {
  return filterApplications.map((application) => ({
    section: application.section,
    hardFilterPolicy: application.hardFilterPolicy,
    appliedHardFilters: application.appliedHardFilters,
    unappliedInputFilters: application.unappliedInputFilters.map((filter) => ({
      field: filter.field,
      code: filter.code,
    })),
  }));
}

function collectAppliedFilters(
  input: SearchExerciseResourcesInput,
  filterApplications: ExerciseResourceFilterApplication[],
  suitabilities: Array<z.infer<typeof exerciseAllowedSectionSchema>>,
  excludeExerciseIds: string[] | undefined,
  requiredExerciseIds: string[] | undefined,
): SearchExerciseResourcesOutput["query"]["appliedFilters"] {
  const filters: SearchExerciseResourcesOutput["query"]["appliedFilters"] = [];
  const commonAppliedFields = collectCommonAppliedFilterFields(filterApplications);
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
    if (value !== undefined && commonAppliedFields.has(field as SearchExerciseResourcesOutput["query"]["appliedFilters"][number]["field"])) {
      filters.push({
        field: field as SearchExerciseResourcesOutput["query"]["appliedFilters"][number]["field"],
        value,
      });
    }
  }

  return filters;
}

function collectCommonAppliedFilterFields(filterApplications: ExerciseResourceFilterApplication[]) {
  const [firstApplication, ...restApplications] = filterApplications;
  if (!firstApplication) {
    return new Set<SearchExerciseResourcesOutput["query"]["appliedFilters"][number]["field"]>();
  }

  const commonFields = new Set(firstApplication.appliedHardFilters);
  for (const application of restApplications) {
    const fields = new Set(application.appliedHardFilters);
    for (const field of [...commonFields]) {
      if (!fields.has(field)) {
        commonFields.delete(field);
      }
    }
  }

  return new Set([...commonFields] as SearchExerciseResourcesOutput["query"]["appliedFilters"][number]["field"][]);
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

function formatFacetCatalogForDescription(catalog?: ExerciseResourceFacetCatalog) {
  if (!catalog) {
    return "";
  }

  const normalized = normalizeExerciseResourceFacetCatalogForPlanner(catalog);
  return [
    "当前动作库 facet catalog 摘要：",
    `muscles: ${formatFacetValues(normalized.muscles)}`,
    `equipment: ${formatFacetValues(normalized.equipment)}`,
    `homeRequirements: ${formatFacetValues(normalized.homeRequirements)}`,
    `levels: ${formatFacetValues(normalized.levels)}`,
    `categories: ${formatFacetValues(normalized.categories)}`,
  ].join("\n");
}

function formatFacetValues(values: readonly string[]) {
  return values.slice(0, 24).join(", ");
}
