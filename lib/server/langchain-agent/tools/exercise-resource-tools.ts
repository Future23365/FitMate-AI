import "server-only";

import { z } from "zod";

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
  type ExerciseResourceNameDiagnostic,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import {
  buildExerciseResourceFilterApplication,
  EXERCISE_RESOURCE_FILTER_APPLICATION_FIELDS,
  EXERCISE_RESOURCE_SUPPORT_SECTION_UNAPPLIED_FILTER_CODE,
  type ExerciseResourceFilterApplication,
} from "@/lib/server/exercises/exercise-resource-filter-policy";
import { exerciseSortSchema } from "@/lib/shared/exercises/query-schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

import { defineLangChainToolWrapper } from "../tool-wrapper";
import { toLangChainJsonValue } from "../utils";

const textFilterValueSchema = z.string().trim().min(1).max(120);
const optionalTextFilterSchema = textFilterValueSchema.optional();
const maxExerciseNames = 12;
const maxExcludeExerciseIds = 50;
const maxRequiredExerciseIds = 12;
const maxMuscles = 20;
const maxCandidateCountPerSection = agentRuntimeConfig.tools.searchExerciseResources.maxCandidateCountPerSection;
const exerciseIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const catalogFacetDescription = "精确筛选值应优先从动作库 facet catalog 的对应数组中选择；服务端只执行 schema、去空、去重和数据库查询。";
const trainingPolicyFacetDescription = `${catalogFacetDescription}该字段在 training policy 中作为 hard filter；warmup / stretch 的 support_section policy 只在非 Planner 调试通道披露其未作为 hard filter 使用。`;

const equipmentFilterSchema = optionalTextFilterSchema
  .describe(`器械可用性或器械类别的精确筛选值；无外部器械统一使用 no_equipment。${catalogFacetDescription}`);
const homeRequirementFilterSchema = textFilterValueSchema
  .refine((value) => !isRemovedNoEquipmentHomeRequirementValue(value), {
    message: "homeRequirement 只表示环境、场地或支撑条件；无外部器械约束应使用 equipment = \"no_equipment\"。",
  })
  .optional()
  .describe(`环境、场地或支撑条件的精确筛选值，例如地面、支撑物、户外、搭档、居家小器械或健身房器械；不表示器械可用性。只在用户目标、上下文、已验证事实或当前规划确实需要环境、场地或支撑条件时填写；省略表示不额外限定环境条件。${catalogFacetDescription}`);

const exerciseNamesFilterSchema = z.array(
  z.string()
    .trim()
    .min(1)
    .max(80)
    .describe("单个动作名称；只能放模型已从用户请求、上下文或当前 tool result summary 中结构化提取出的动作名。"),
)
  .min(1)
  .max(maxExerciseNames)
  .optional()
  .describe("模型已经结构化提取出的点名动作名称数组；只在动作名称字段执行精确、前缀和包含匹配。不要传入完整用户消息、历史摘要、肌群、分类、标签、训练目标或语义搜索文本。");

const appliedFilterSchema = z.object({
  field: z.enum([
    "exerciseNames",
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
  ]),
  value: z.union([z.string(), z.array(z.string())]),
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
  zeroMatchMuscles: z.array(z.string())
    .describe("当前查询口径、过滤条件和排除条件下独立 count 为 0 的请求肌群；只使用 input.muscles 的 canonical facet 值。该字段是诊断事实，可用于解释、澄清或调整查询，不是必须继续补查每个肌群的义务。"),
  exercises: z.array(exerciseResourceSummarySchema)
    .describe("该查询口径下返回的内部动作库事实；模型可见投影会去除 placement eligibility 字段，最终 section 合法性仍由 visibleTrainingProposal validator 复核。"),
}).strict();

/** searchExerciseResourcesInputSchema 定义动作库事实查询输入，不接受分页、limit、userId 或自然语言分流参数。 */
export const searchExerciseResourcesInputSchema = z.object({
  exerciseNames: exerciseNamesFilterSchema,
  category: optionalTextFilterSchema.describe(`动作分类或中文分类的精确筛选值。${trainingPolicyFacetDescription}`),
  suitabilities: z.array(exerciseAllowedSectionSchema)
    .min(1)
    .max(3)
    .optional()
    .describe("动作候选用途查询口径数组，只允许 warmup、training 或 stretch；省略时按 training 主训练候选查询。模型需要主训练、热身或拉伸候选时自行选择对应值；该字段不是最终训练编排命令，服务端不根据用户原文分流。training 使用严格 hard filter policy；warmup / stretch 使用 support_section policy，只把 section、器械、场地、肌群和受控动作 id 作为 hard filter。"),
  level: optionalTextFilterSchema.describe(`动作难度或中文难度的精确筛选值。${trainingPolicyFacetDescription}`),
  force: optionalTextFilterSchema.describe(`发力类型或中文发力类型的精确筛选值。${trainingPolicyFacetDescription}`),
  mechanic: optionalTextFilterSchema.describe(`动作机制或中文动作机制的精确筛选值。${trainingPolicyFacetDescription}`),
  equipment: equipmentFilterSchema,
  homeRequirement: homeRequirementFilterSchema,
  muscles: z.array(textFilterValueSchema)
    .min(1)
    .max(maxMuscles)
    .optional()
    .describe(`一个或多个主肌群或辅助肌群真实数据库 facet 的 OR 查询数组；单个肌群也写成一项数组。多值查询用于获得代表性候选覆盖并会尽量均衡返回各请求肌群的候选；成功 result 的 Planner-visible summary 只暴露候选动作事实，不回显各肌群零命中桶、精确命中数或截断状态。${catalogFacetDescription}`),
  goalTag: optionalTextFilterSchema.describe(`动作目标标签的精确筛选值。${trainingPolicyFacetDescription}`),
  riskTag: optionalTextFilterSchema.describe(`动作风险标签的精确筛选值。${trainingPolicyFacetDescription}`),
  excludeExerciseIds: z.array(exerciseIdSchema)
    .max(maxExcludeExerciseIds)
    .optional()
    .describe("明确替换、排除或避免重复时使用的负向动作 id 列表，只能来自模型可见且用户已经看到的受控动作事实，或用户明确要求不要再出现的动作；不用于保留、复用、派生或调整已有动作，不支持用内部候选、trace 摘要或未读取完整事实填充。"),
  requiredExerciseIds: z.array(exerciseIdSchema)
    .max(maxRequiredExerciseIds)
    .optional()
    .describe("正向查询锚点；当模型已有受控动作 id 时使用，例如来自已导入可见训练事实、当前 tool result summary 或用户明确给出的受控 id。tool 会优先把这些动作纳入当前查询口径的 candidateGroups[].exercises 列表，并用 diagnostics 说明无法纳入或筛选不完全一致的原因。"),
  candidateCountPerSection: z.number()
    .int()
    .min(1)
    .max(maxCandidateCountPerSection)
    .optional()
    .describe(`每个请求 section 最多返回多少个动作候选，取值 1 到 ${maxCandidateCountPerSection}；字段来源可以是用户明确数量要求，也可以是模型为了当前查询需要的受控候选规模。它不是分页、offset、cursor、全库读取能力或最终展示数量承诺。`),
  sort: exerciseSortSchema.default("name_asc").describe("固定排序字段，不支持分页、limit、offset、page 或 pageSize。"),
}).strict();

/** searchExerciseResourcesOutputSchema 校验 section-scoped 动作事实和查询诊断摘要。 */
export const searchExerciseResourcesOutputSchema = z.object({
  status: z.literal("succeeded"),
  query: z.object({
    exerciseNames: z.array(z.string()).optional(),
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
    candidateCountPerSection: z.number().int().min(1),
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
  }).strict().describe("内部按查询口径分组的动作候选事实来源；模型可见投影使用 candidateGroups[]，不暴露 placement eligibility。"),
  diagnostics: z.array(z.object({
    suitability: exerciseAllowedSectionSchema,
    code: z.enum([
      "no_candidates",
      "exercise_name_not_found",
      "exercise_name_section_conflict",
      "exercise_name_filter_mismatch",
      "exercise_name_ambiguous",
      "exercise_name_too_broad",
      "required_exercise_not_found",
      "required_exercise_section_conflict",
      "required_exercise_excluded",
      "required_exercise_filter_mismatch",
    ]),
    message: z.string(),
    exerciseName: z.string().optional(),
    exerciseId: exerciseIdSchema.optional(),
    totalMatches: z.number().int().min(0).optional(),
    returnedCount: z.number().int().min(0).optional(),
    conflictFields: z.array(z.string()).optional(),
  }).strict()),
}).strict();

type SearchExerciseResourcesInput = z.infer<typeof searchExerciseResourcesInputSchema>;
type SearchExerciseResourcesOutput = z.infer<typeof searchExerciseResourcesOutputSchema>;
type ExerciseResourceOutput = z.infer<typeof exerciseResourceSummarySchema>;
type SuitabilityGroupOutput = z.infer<typeof suitabilityGroupSchema>;

export type CreateSearchExerciseResourcesLangChainToolOptions = {
  facetCatalog?: ExerciseResourceFacetCatalog;
};

/** createSearchExerciseResourcesLangChainTool 构造动作库事实查询 LangChain tool，可注入当前动作库 facet catalog。 */
export function createSearchExerciseResourcesLangChainTool(
  options: CreateSearchExerciseResourcesLangChainToolOptions = {},
) {
  return defineLangChainToolWrapper<typeof searchExerciseResourcesInputSchema, SearchExerciseResourcesOutput>({
    name: "searchExerciseResources",
    description: [
      "Purpose：只读查询 Exercise 动作库中的发布态动作候选事实，返回按查询口径分组的 candidateGroups[] 和 diagnostics。",
      "Use When：需要基于结构化数据库 facet、suitabilities 查询口径、受控 exerciseId 或动作名称获取动作候选时使用。",
      "Do Not Use When：不要用本 tool 生成 visibleTrainingProposal、训练卡片、routine、plan、处方、日程、保存结果、读取单个动作完整详情、分页或自然语言语义搜索。",
      "Input Source：所有精确 facet 值应优先从动作库 facet catalog 选择；无外部器械统一写 equipment: \"no_equipment\"；homeRequirement 只表示环境、场地或支撑条件，只在用户目标、上下文、已验证事实或当前规划确实需要该条件时填写。",
      "Input Source：suitabilities 可声明 warmup、training、stretch；它是候选用途查询口径，不是最终训练编排命令，也不由服务端根据用户原文分流。",
      "Input Source：candidateCountPerSection 只控制每个请求 section 的受控候选数量，默认使用服务端配置；它不是分页、offset、cursor、全库读取能力或最终展示数量承诺。",
      "Output Meaning：candidateGroups[].suitability 只表示该组候选来自哪个 suitabilities 查询口径，不是动作 placement eligibility 或最终训练阶段指令。",
      "Output Meaning：多 muscles 查询用于获得代表性候选覆盖，并会尽量均衡返回各请求肌群的候选；成功 result 的 Planner-visible summary 只提供候选动作事实和中性 diagnostics，不提供精确匹配数量、截断状态、过滤执行细节或下一步固定 workflow。",
      "当模型已经从用户请求、上下文或 tool result summary 中结构化提取动作名称时，使用 exerciseNames 查询动作名称字段；exerciseNames 不接受完整用户消息，也不是语义搜索、向量召回、肌群推断、标签推断或自然语言搜索字段。",
      "requiredExerciseIds 是正向锚点，用于让已解析或已导入的受控动作优先进入候选列表；excludeExerciseIds 是负向排除，用于替换或避免重复。",
      "Grounding Rules：该结果属于动作候选事实，可用于普通事实回答、下一轮结构化 tool input 或后续 finalization 的候选来源；最终 visibleTrainingProposal 的 exerciseId、发布态和 section 合法性仍由服务端数据库事实复核。",
      formatFacetCatalogForDescription(options.facetCatalog),
    ].filter(Boolean).join("\n"),
    inputSchema: searchExerciseResourcesInputSchema,
    outputSchema: searchExerciseResourcesOutputSchema,
    runtimeActivity: {
      defaultSummary: "正在查询动作库",
    },
    timeoutMs: agentRuntimeConfig.tools.searchExerciseResources.timeoutMs,
    handler: async (input) => {
      const excludeExerciseIds = normalizeExcludeExerciseIds(input.excludeExerciseIds);
      const requiredExerciseIds = normalizeRequiredExerciseIds(input.requiredExerciseIds);
      const muscles = normalizeFacetList(input.muscles);
      const exerciseNames = normalizeFacetList(input.exerciseNames);
      const candidateCountPerSection = input.candidateCountPerSection
        ?? agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection;
      const normalizedInput = {
        ...input,
        exerciseNames,
        muscles,
      };
      const suitabilities = normalizeSuitabilities(input.suitabilities);
      const filterApplications = suitabilities.map((suitability) => buildExerciseResourceFilterApplication({
        ...normalizedInput,
        suitability,
        excludeExerciseIds,
        requiredExerciseIds,
      }));
      const [requiredExercises, results] = await Promise.all([
        requiredExerciseIds?.length
          ? getExerciseResourceSummariesByIds(requiredExerciseIds)
          : Promise.resolve([]),
        Promise.all(suitabilities.map((suitability) => searchExerciseResourceSummaries({
          exerciseNames,
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
          maxReturned: candidateCountPerSection,
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
        diagnostics.push(...result.diagnostics.map((diagnostic) =>
          toSearchExerciseNameDiagnosticOutput(suitability, diagnostic),
        ));
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
            zeroMatchMuscles: result.zeroMatchMuscles,
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
          exerciseNames: firstResult.query.exerciseNames,
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
          candidateCountPerSection,
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
      const broadQuery = isBroadExerciseResourceQueryOutput(output);

      return {
        status: output.status,
        factLevel: broadQuery ? "diagnostic" : "candidate",
        query: {
          suitabilities: output.query.suitabilities,
          ...(output.query.exerciseNames ? { exerciseNames: output.query.exerciseNames } : {}),
          ...(output.query.category ? { category: output.query.category } : {}),
          ...(output.query.level ? { level: output.query.level } : {}),
          ...(output.query.force ? { force: output.query.force } : {}),
          ...(output.query.mechanic ? { mechanic: output.query.mechanic } : {}),
          ...(output.query.equipment ? { equipment: output.query.equipment } : {}),
          ...(output.query.homeRequirement ? { homeRequirement: output.query.homeRequirement } : {}),
          ...(output.query.muscles ? { muscles: output.query.muscles } : {}),
          ...(output.query.goalTag ? { goalTag: output.query.goalTag } : {}),
          ...(output.query.riskTag ? { riskTag: output.query.riskTag } : {}),
          ...(output.query.requiredExerciseIds ? { requiredExerciseIds: output.query.requiredExerciseIds } : {}),
          ...(output.query.excludeExerciseIds ? { excludeExerciseIds: output.query.excludeExerciseIds } : {}),
        },
        candidateGroups: mapModelVisibleCandidateGroups(
          output.groups,
          (exercise) => ({
            exerciseId: exercise.exerciseId,
            nameZh: exercise.nameZh,
            nameEn: exercise.nameEn,
            equipmentZh: exercise.equipmentZh,
            homeRequirementZh: exercise.homeRequirementZh,
            primaryMusclesZh: exercise.primaryMusclesZh,
            secondaryMusclesZh: exercise.secondaryMusclesZh,
            imageUrl: exercise.imageUrl,
          }),
        ),
        diagnostics: toModelVisibleDiagnostics(output.diagnostics),
      };
    },
    toUserProjection: (output) => ({
      status: output.status,
      suitabilities: output.query.suitabilities,
      candidateCountPerSection: output.query.candidateCountPerSection,
      totalMatches: output.query.totalMatches,
      returnedCount: output.query.returnedCount,
      truncated: output.query.truncated,
      excludedCount: output.query.excludedCount,
      appliedFilters: output.query.appliedFilters,
      filterApplications: toProjectionFilterApplications(output.query.filterApplications),
      filterSemantics: output.query.filterSemantics,
      candidateGroups: mapCandidateGroups(output.groups, (exercise) => ({
        exerciseId: exercise.exerciseId,
        nameZh: exercise.nameZh,
        nameEn: exercise.nameEn,
        equipmentZh: exercise.equipmentZh,
        homeRequirementZh: exercise.homeRequirementZh,
        primaryMusclesZh: exercise.primaryMusclesZh,
        imageUrl: exercise.imageUrl,
      })),
      diagnostics: output.diagnostics,
    }),
    toTraceSummary: (output) => toLangChainJsonValue({
      status: output.status,
      suitabilities: output.query.suitabilities,
      candidateCountPerSection: output.query.candidateCountPerSection,
      totalMatches: output.query.totalMatches,
      returnedCount: output.query.returnedCount,
      candidateGroups: mapCandidateGroups(output.groups, () => undefined, { includeExercises: false }),
      diagnostics: output.diagnostics.map((diagnostic) => ({
        suitability: diagnostic.suitability,
        code: diagnostic.code,
        ...(diagnostic.exerciseName ? { exerciseName: diagnostic.exerciseName } : {}),
        ...(diagnostic.exerciseId ? { exerciseId: diagnostic.exerciseId } : {}),
        ...(diagnostic.totalMatches === undefined ? {} : { totalMatches: diagnostic.totalMatches }),
        ...(diagnostic.returnedCount === undefined ? {} : { returnedCount: diagnostic.returnedCount }),
        ...(diagnostic.conflictFields ? { conflictFields: diagnostic.conflictFields } : {}),
      })),
    }),
  });
}

/** searchExerciseResourcesLangChainTool 是生产 LangChain 默认动作库查询能力，facet catalog 可由 route 注入替换。 */
export const searchExerciseResourcesLangChainTool = createSearchExerciseResourcesLangChainTool();

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
  return field !== "suitabilities";
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
    exerciseNames: input.exerciseNames,
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

function toSearchExerciseNameDiagnosticOutput(
  suitability: z.infer<typeof exerciseAllowedSectionSchema>,
  diagnostic: ExerciseResourceNameDiagnostic,
): SearchExerciseResourcesOutput["diagnostics"][number] {
  return {
    suitability,
    code: diagnostic.code,
    exerciseName: diagnostic.exerciseName,
    ...(diagnostic.totalMatches === undefined ? {} : { totalMatches: diagnostic.totalMatches }),
    ...(diagnostic.returnedCount === undefined ? {} : { returnedCount: diagnostic.returnedCount }),
    ...(diagnostic.conflictFields?.length ? { conflictFields: diagnostic.conflictFields } : {}),
    message: createExerciseNameDiagnosticMessage(suitability, diagnostic),
  };
}

function createExerciseNameDiagnosticMessage(
  suitability: z.infer<typeof exerciseAllowedSectionSchema>,
  diagnostic: ExerciseResourceNameDiagnostic,
) {
  switch (diagnostic.code) {
    case "exercise_name_not_found":
      return `动作名称“${diagnostic.exerciseName}”没有命中数据库动作名称字段，无法纳入 ${suitability} 动作列表。`;
    case "exercise_name_section_conflict":
      return `动作名称“${diagnostic.exerciseName}”存在名称匹配候选，但不适配 ${suitability} 用途。`;
    case "exercise_name_filter_mismatch":
      return `动作名称“${diagnostic.exerciseName}”存在名称匹配候选，但与当前结构化筛选字段不一致：${diagnostic.conflictFields?.join(", ") || "unknown"}。`;
    case "exercise_name_ambiguous":
      return `动作名称“${diagnostic.exerciseName}”匹配到多个动作候选；该诊断只表达数据库名称匹配歧义事实。`;
    case "exercise_name_too_broad":
      return `动作名称“${diagnostic.exerciseName}”匹配候选超过当前名称桶可见上限；该诊断只表达候选过宽事实。`;
  }
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

  const exerciseNames = normalizeFacetList(input.exerciseNames) ?? [];
  if (exerciseNames.length > 0 && !exerciseNames.some((exerciseName) => matchesExerciseName(exercise, exerciseName))) {
    conflicts.push("exerciseNames");
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

function matchesExerciseName(exercise: ExerciseResourceSummary, query: string) {
  return matchesAnyText(query, exercise.nameEn, exercise.nameZh);
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
    return `${suitability} 用途在排除模型可见或明确排除动作后没有更多匹配候选。`;
  }

  return `${suitability} 用途当前没有匹配候选。`;
}

function mapCandidateGroups<T>(
  groups: SearchExerciseResourcesOutput["groups"],
  mapExercise: (exercise: ExerciseResourceOutput) => T,
  options: { includeTotalMatches?: boolean; includeExercises?: boolean } = {},
) {
  const includeTotalMatches = options.includeTotalMatches ?? true;
  const includeExercises = options.includeExercises ?? true;

  return Object.values(groups).flatMap((group) => {
    if (!group) {
      return [];
    }

    const typedGroup = group as SuitabilityGroupOutput;
    return [{
      suitability: typedGroup.suitability,
      ...(includeTotalMatches ? { totalMatches: typedGroup.totalMatches } : {}),
      returnedCount: typedGroup.returnedCount,
      truncated: typedGroup.truncated,
      zeroMatchMuscles: typedGroup.zeroMatchMuscles,
      ...(includeExercises ? { exercises: typedGroup.exercises.map(mapExercise) } : {}),
    }];
  });
}

// mapModelVisibleCandidateGroups 是 Planner-visible 白名单投影，只保留动作选择所需候选事实。
function mapModelVisibleCandidateGroups<T>(
  groups: SearchExerciseResourcesOutput["groups"],
  mapExercise: (exercise: ExerciseResourceOutput) => T,
) {
  return Object.values(groups).flatMap((group) => {
    if (!group) {
      return [];
    }

    const typedGroup = group as SuitabilityGroupOutput;
    return [{
      suitability: typedGroup.suitability,
      exercises: typedGroup.exercises.map(mapExercise),
    }];
  });
}

// toModelVisibleDiagnostics 将内部诊断映射成中性事实，避免把统计或继续查询暗示注入 Planner。
function toModelVisibleDiagnostics(diagnostics: SearchExerciseResourcesOutput["diagnostics"]) {
  return diagnostics.map((diagnostic) => {
    const code = diagnostic.code === "exercise_name_too_broad"
      ? "exercise_name_ambiguous"
      : diagnostic.code;

    return {
      suitability: diagnostic.suitability,
      code,
      ...(diagnostic.exerciseName ? { exerciseName: diagnostic.exerciseName } : {}),
      ...(diagnostic.exerciseId ? { exerciseId: diagnostic.exerciseId } : {}),
      ...(diagnostic.conflictFields?.length ? { conflictFields: diagnostic.conflictFields } : {}),
      message: createModelVisibleDiagnosticMessage({
        ...diagnostic,
        code,
      }),
    };
  });
}

function createModelVisibleDiagnosticMessage(
  diagnostic: Omit<SearchExerciseResourcesOutput["diagnostics"][number], "code"> & {
    code: Exclude<SearchExerciseResourcesOutput["diagnostics"][number]["code"], "exercise_name_too_broad">;
  },
) {
  switch (diagnostic.code) {
    case "no_candidates":
      return `${diagnostic.suitability} 用途当前查询没有可纳入的候选动作。`;
    case "exercise_name_not_found":
      return `动作名称“${diagnostic.exerciseName}”无法作为当前查询候选事实纳入。`;
    case "exercise_name_section_conflict":
      return `动作名称“${diagnostic.exerciseName}”与 ${diagnostic.suitability} 用途不一致，无法纳入该分组。`;
    case "exercise_name_filter_mismatch":
      return `动作名称“${diagnostic.exerciseName}”与当前结构化筛选字段不一致。`;
    case "exercise_name_ambiguous":
      return `动作名称“${diagnostic.exerciseName}”匹配不唯一，无法作为唯一候选锚点。`;
    case "required_exercise_not_found":
      return `指定动作 ${diagnostic.exerciseId} 不存在，无法纳入 ${diagnostic.suitability} 动作列表。`;
    case "required_exercise_section_conflict":
      return `指定动作 ${diagnostic.exerciseId} 不适配 ${diagnostic.suitability} 用途，无法纳入该分组。`;
    case "required_exercise_excluded":
      return `指定动作 ${diagnostic.exerciseId} 同时出现在 excludeExerciseIds 中，无法纳入候选。`;
    case "required_exercise_filter_mismatch":
      return `指定动作 ${diagnostic.exerciseId} 与当前结构化筛选字段不完全一致。`;
  }
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
