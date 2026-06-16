import "server-only";

import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  exerciseResourceMuscleMatchRoleValues,
  getExerciseResourceSummariesByIds,
  normalizeExerciseResourceFacetCatalogForPlanner,
  searchExerciseResourceSummaries,
  type ExerciseResourceFacetCatalog,
  type ExerciseResourceFilterSemantic,
  type ExerciseResourceMuscleMatchRole,
  type ExerciseResourceNameDiagnostic,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import {
  exerciseImpactLevelSchema,
  exerciseNoiseLevelSchema,
  exerciseRequiredEquipmentTagSchema,
  exerciseSetupComplexitySchema,
  exerciseSupportRequirementTagSchema,
} from "@/lib/shared/exercises/execution-taxonomy";
import {
  exerciseEquipmentScopeModeValues,
  exerciseExecutionProfileDescriptionsZh,
  exerciseExecutionProfileValues,
} from "@/lib/shared/exercises/execution-constraints";
import {
  matchesEquipmentScope,
  matchesExecutionProfile,
  matchesImpactLimit,
  matchesNoiseLimit,
  normalizeExerciseEquipmentScope,
} from "@/lib/server/exercises/exercise-resource-execution-constraints";
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
const maxTaxonomyTags = 8;
const maxMuscles = 20;
const maxCandidateCountPerSection = agentRuntimeConfig.tools.searchExerciseResources.maxCandidateCountPerSection;
const exerciseIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const catalogFacetDescription = "精确筛选值应优先从动作库 facet catalog 的对应数组中选择。";
const structuredFacetDescription = `${catalogFacetDescription}该字段用于缩小动作候选范围。`;

const executionProfileFilterSchema = z.enum(exerciseExecutionProfileValues)
  .optional()
  .describe([
    "动作执行场景筛选；字段来源是用户明确的场地、器械、搭档或空间限制，或模型基于当前目标做出的可解释结构化约束。",
    '宽泛动作推荐、动作筛选或结构化训练结果候选缺少明确器械、场地或可用设施偏好时，默认使用 no_equipment 作为低门槛无器械口径。',
    `合法值：${exerciseExecutionProfileValues.join(", ")}。`,
    `no_equipment 表示${exerciseExecutionProfileDescriptionsZh.no_equipment}`,
    `home_support 表示${exerciseExecutionProfileDescriptionsZh.home_support}仅在用户明确可用椅子、墙面、台阶等常见居家支撑时使用。`,
    `small_equipment 表示${exerciseExecutionProfileDescriptionsZh.small_equipment}`,
    `gym_equipment 表示${exerciseExecutionProfileDescriptionsZh.gym_equipment}`,
    `partner_required 表示${exerciseExecutionProfileDescriptionsZh.partner_required}`,
    `outdoor_required 表示${exerciseExecutionProfileDescriptionsZh.outdoor_required}`,
  ].join(" "));

const equipmentScopeValueSchema = z.object({
  mode: z.enum(exerciseEquipmentScopeModeValues)
    .describe("compatible_with_available 表示用户明确拥有或可用的器械集合，候选动作不得要求集合外器械；must_use_any 表示用户明确想找会使用 tags 中至少一种器械的动作。"),
  tags: z.array(exerciseRequiredEquipmentTagSchema)
    .max(maxTaxonomyTags)
    .describe(`器械 canonical values 数组，只能来自 equipmentScope.tags facet；compatible_with_available 允许空数组并表示只允许不需要外部训练器械的动作，must_use_any 必须至少有一个 tag。${catalogFacetDescription}`),
}).strict()
  .superRefine((scope, ctx) => {
    if (scope.mode === "must_use_any" && scope.tags.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: 'equipmentScope.mode = "must_use_any" 时 tags 必须至少包含一个器械 tag。',
      });
    }
  })
  .describe("用户可用或指定使用的器械集合约束；用于区分“我只有这些器械”和“给我找使用这些器械的动作”。");

const equipmentScopeFilterSchema = equipmentScopeValueSchema
  .optional()
  .describe("用户可用或指定使用的器械集合约束；用于区分“我只有这些器械”和“给我找使用这些器械的动作”。");

const impactLimitFilterSchema = exerciseImpactLevelSchema
  .optional()
  .describe("冲击程度上限筛选；合法值为 low、medium、high。适合用户明确低冲击、膝关节压力或跳跃限制时使用。");
const noiseLimitFilterSchema = exerciseNoiseLevelSchema
  .optional()
  .describe("噪音程度上限筛选；合法值为 quiet、normal、loud。适合用户明确公寓、夜间或低噪音限制时使用。");

const muscleMatchRoleSchema = z.enum(exerciseResourceMuscleMatchRoleValues);
const muscleMatchRoleInputSchema = muscleMatchRoleSchema
  .default("primary")
  .describe([
    '肌群匹配角色；未显式指定时默认 "primary"。',
    '"primary" 表示请求肌群是动作主练目标，只匹配 primaryMuscles / primaryMusclesZh，适合目标肌群动作推荐、训练动作筛选和结构化训练结果候选。',
    '"any" 表示请求肌群可以是主练或辅助参与，匹配 primaryMuscles / primaryMusclesZh / secondaryMuscles / secondaryMusclesZh，适合查询肌群是否参与、动作会带到哪些肌群、辅助刺激、稳定参与或宽泛相关动作。',
    '"any" 返回的是参与候选，不代表每个候选都适合作为目标肌群主练推荐。',
  ].join(" "));

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
    "executionProfile",
    "equipmentScope",
    "impactLimit",
    "noiseLimit",
    "muscles",
    "goalTag",
    "riskTag",
    "excludeExerciseIds",
    "requiredExerciseIds",
  ]),
  value: z.union([z.string(), z.boolean(), z.array(z.string()), equipmentScopeValueSchema]),
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
  field: z.enum(["executionProfile", "equipmentScope", "impactLimit", "noiseLimit"]),
  requestedValue: z.string(),
  databaseMapping: z.object({
    matchedValues: z.array(z.string()),
  }).strict(),
  note: z.string(),
}).strict() satisfies z.ZodType<ExerciseResourceFilterSemantic>;

const executionTaxonomyOutputSchema = z.object({
  requiresExternalEquipment: z.boolean().nullable(),
  requiredEquipmentTags: z.array(exerciseRequiredEquipmentTagSchema),
  supportRequirementTags: z.array(exerciseSupportRequirementTagSchema),
  setupComplexity: exerciseSetupComplexitySchema,
  impactLevel: exerciseImpactLevelSchema.nullable(),
  noiseLevel: exerciseNoiseLevelSchema.nullable(),
}).strict().describe("动作执行条件 taxonomy 的有限事实摘要；null 或 unknown 表示事实未补齐，不能当作低门槛事实。");

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
  executionTaxonomy: executionTaxonomyOutputSchema,
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
  category: optionalTextFilterSchema.describe(`动作分类或中文分类的精确筛选值。${structuredFacetDescription}`),
  suitabilities: z.array(exerciseAllowedSectionSchema)
    .min(1)
    .max(3)
    .optional()
    .describe("动作候选用途查询口径数组，只允许 warmup、training 或 stretch；省略时按 training 主训练候选查询。模型需要主训练、热身或拉伸候选时自行选择对应值；该字段不是最终训练编排命令。"),
  level: optionalTextFilterSchema.describe(`动作难度或中文难度的精确筛选值。${structuredFacetDescription}`),
  force: optionalTextFilterSchema.describe(`发力类型或中文发力类型的精确筛选值。${structuredFacetDescription}`),
  mechanic: optionalTextFilterSchema.describe(`动作机制或中文动作机制的精确筛选值。${structuredFacetDescription}`),
  executionProfile: executionProfileFilterSchema,
  equipmentScope: equipmentScopeFilterSchema,
  impactLimit: impactLimitFilterSchema,
  noiseLimit: noiseLimitFilterSchema,
  muscles: z.array(textFilterValueSchema)
    .min(1)
    .max(maxMuscles)
    .optional()
    .describe(`一个或多个请求肌群 facet 值；单个肌群也写成一项数组。该字段与 muscleMatchRole 共同决定匹配主练肌群还是主/辅任意参与肌群。字段来源只能是用户明确指定的目标肌群、已验证上下文中的目标肌群，或模型为当前可执行训练课收敛出的少量必要目标；不要把未指定肌群、宽泛训练目标或常规训练知识展开成全身肌群清单。多值查询用于获得覆盖多个请求肌群的候选。${catalogFacetDescription}`),
  muscleMatchRole: muscleMatchRoleInputSchema,
  goalTag: optionalTextFilterSchema.describe(`动作目标标签的精确筛选值。${structuredFacetDescription}`),
  riskTag: optionalTextFilterSchema.describe(`动作风险标签的精确筛选值。${structuredFacetDescription}`),
  excludeExerciseIds: z.array(exerciseIdSchema)
    .max(maxExcludeExerciseIds)
    .optional()
    .describe("明确替换、排除或避免重复时使用的负向动作 id 列表，只能来自模型可见且用户已经看到的受控动作事实，或用户明确要求不要再出现的动作；不用于保留、复用、派生或调整已有动作，不支持用内部候选、trace 摘要或未读取完整事实填充。"),
  requiredExerciseIds: z.array(exerciseIdSchema)
    .max(maxRequiredExerciseIds)
    .optional()
    .describe("正向查询锚点；当模型已有受控动作 id 时使用，例如来自已导入可见训练事实、当前 tool result summary 或用户明确给出的受控 id。tool 会优先把这些动作纳入当前查询口径的 candidateGroups[].exercises 列表；无法纳入或筛选不完全一致的原因只进入 trace / userProjection 诊断，不作为 Planner 成功候选事实。"),
  candidateCountPerSection: z.number()
    .int()
    .min(1)
    .max(maxCandidateCountPerSection)
    .optional()
    .describe(`每个请求 section 最多返回多少个动作候选，取值 1 到 ${maxCandidateCountPerSection}；字段来源可以是用户明确数量要求，也可以是模型为了当前查询需要的受控候选规模。它不是分页、offset、cursor 或最终展示数量承诺。`),
  sort: exerciseSortSchema.default("name_asc").describe("固定排序字段，不支持分页、limit、offset、page 或 pageSize。"),
}).strict().superRefine((input, ctx) => {
  if (
    (input.executionProfile === "no_equipment" || input.executionProfile === "home_support")
    && input.equipmentScope?.mode === "must_use_any"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["equipmentScope", "mode"],
      message: input.executionProfile === "no_equipment"
        ? 'executionProfile = "no_equipment" 表达完整无器械口径，不能同时要求动作使用外部器械。'
        : 'executionProfile = "home_support" 表达居家无外部训练器械支撑口径，不能同时要求动作使用外部器械。',
    });
  }
});

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
    executionProfile: z.enum(exerciseExecutionProfileValues).optional(),
    equipmentScope: equipmentScopeValueSchema.optional(),
    impactLimit: exerciseImpactLevelSchema.optional(),
    noiseLimit: exerciseNoiseLevelSchema.optional(),
    muscles: z.array(z.string()).optional(),
    muscleMatchRole: muscleMatchRoleSchema,
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
      "Purpose：只读查询 Exercise 动作库中的发布态动作候选事实，结果按 candidateGroups[] 分组返回。",
      "Use When：需要基于动作库 facet、高层执行条件、suitabilities、受控 exerciseId 或动作名称获取候选动作时使用。",
      "Use When：一次 routine 或 plan 同时需要热身、主训练和拉伸候选时，可以在同一次调用中传入多个 suitabilities，例如 warmup、training、stretch。",
      "Do Not Use When：不要用本 tool 生成 visibleTrainingProposal、训练卡片、routine、plan、处方、日程、保存结果、读取单个动作完整详情、分页或自然语言语义搜索。",
      "Do Not Use When：当前缺口是从已有候选中选择子集、排序、安排 section、生成 prescription、生成 schedule、决定 routine / plan 结构或解释推荐理由；这些属于模型编排或结构化收口，不属于动作库查询。",
      "Do Not Use When：已有候选事实能支撑当前输出，且用户没有新增硬约束、替换要求或更多候选要求时，不要为了完整 inventory、所有肌群或更纯净候选池继续拆分查询。",
      `Input Source：executionProfile 用于选择动作执行场景，合法值为 ${exerciseExecutionProfileValues.join(", ")}；宽泛动作推荐、动作筛选或结构化训练结果候选缺少明确器械、场地或可用设施偏好时，默认使用 no_equipment 作为低门槛无器械口径；no_equipment 表示${exerciseExecutionProfileDescriptionsZh.no_equipment}`,
      `Input Source：home_support 表示${exerciseExecutionProfileDescriptionsZh.home_support}仅在用户明确可用椅子、墙面、台阶等常见居家支撑时使用；small_equipment、gym_equipment、partner_required、outdoor_required 分别表示小型器械、健身房设施/器械、搭档辅助和户外空间。`,
      "Input Source：equipmentScope.mode=compatible_with_available 用于用户明确说自己可用器械集合，表示动作不得要求集合外器械；equipmentScope.mode=must_use_any 用于用户明确想找会使用某些器械的动作。equipmentScope.tags 来自动作库 canonical equipment values。",
      "Input Source：impactLimit 和 noiseLimit 是上限筛选；适合用户明确低冲击、膝关节压力、跳跃、公寓、夜间或低噪音限制时使用。",
      "Input Source：suitabilities 可声明 warmup、training、stretch；它是候选用途查询口径，不是最终训练编排命令；需要多个阶段候选时优先一次性传入多个值。",
      "Input Source：muscles 只能来自用户明确指定的目标肌群、已验证上下文中的目标肌群，或模型已经收敛出的少量必要训练目标；不要把宽泛目标、常规训练知识或未指定肌群扩展成全身肌群清单。",
      'Input Source：muscles 用于目标肌群动作推荐、训练动作筛选或结构化训练结果候选时，默认使用 muscleMatchRole = "primary"，表示请求肌群是动作主练目标。',
      'Input Source：需要查询肌群是否参与、动作会带到哪些肌群、辅助刺激、稳定参与或宽泛相关动作时，使用 muscleMatchRole = "any"；any 不代表候选动作都同等适合作为目标肌群主练推荐。',
      "Input Source：candidateCountPerSection 只控制每个请求 section 的受控候选数量；它不是分页、offset、cursor 或最终展示数量承诺。",
      "Output Meaning：candidateGroups[].suitability 只表示该组候选来自哪个 suitabilities 查询口径，不是动作 placement eligibility 或最终训练阶段指令。",
      "Output Meaning：candidateGroups[].exercises 是可消费动作候选事实，不是最终推荐清单；候选动作可以被选择、跳过或用于后续结构化输出。",
      "Output Meaning：本 tool 只返回动作候选事实，不返回 prescription、schedule、routine 或 plan；缺口是 prescription 或 schedule 时，重复查询动作库不会新增该类事实。",
      "Output Meaning：truncated=true 或 totalMatches 大，只表示本次返回的是候选池切片；它不表示当前候选不足，也不要求继续分页、扩大数量或拆分查询。",
      "Output Meaning：coverage 只说明本次查询结果中哪些 suitabilities 有候选、哪些没有候选；它不是用户目标满足度、训练方案生成结果或下一步 tool 调用指令。",
      "Output Meaning：training 候选用于支撑主训练动作选择；warmup / stretch 候选用于支撑辅助阶段选择。除非用户明确要求特定覆盖，否则辅助阶段不要求每个目标肌群都有 primary 候选。",
      "Resource Boundary：Exercise 动作库是 FitMate 的产品可渲染动作资源库，用于动作卡片、图片、动作详情、结构化训练结果和训练执行项；它不是现实世界训练知识全集。",
      "Resource Boundary：空候选或点名动作未命中只表示当前查询口径下产品动作库没有匹配的可渲染资源；不表示现实训练动作或训练知识不存在。",
      "Resource Boundary：不需要产品动作卡片、图片、结构化训练结果或训练执行项的普通文本知识回答，可以不依赖数据库动作条目；需要这些产品资源时，具体 exerciseId 仍必须来自数据库动作事实或受控业务事实。",
      "Output Meaning：candidateGroups[].exercises[].executionTaxonomy 是动作执行条件的候选事实摘要；null 或 unknown 表示事实未补齐，不能当作低门槛事实。",
      "Output Meaning：多 muscles 查询用于获得覆盖多个请求肌群的候选；结果只提供候选动作事实，不保证每个候选都同等适合作为最终推荐，也不要求最终输出使用全部候选。",
      'Output Meaning：query.muscleMatchRole 会回填本次肌群匹配角色；primary 表示主练肌群候选口径，any 表示主练或辅助参与候选口径。',
      "当模型已经从用户请求、上下文或 tool result summary 中结构化提取动作名称时，使用 exerciseNames 查询动作名称字段；exerciseNames 不接受完整用户消息，也不是语义搜索、向量召回、肌群推断、标签推断或自然语言搜索字段。",
      "requiredExerciseIds 是正向锚点，用于让已解析或已导入的受控动作优先进入候选列表；excludeExerciseIds 是负向排除，用于替换或避免重复。",
      "Output Boundary：内部 diagnostics 只用于 trace / userProjection / debug，不作为 Planner 成功候选事实，也不是继续查询或下一步 tool 调用指令。",
      "Grounding Rules：该结果属于动作候选事实，可用于普通事实回答、下一轮结构化 tool input 或后续 finalization 的候选来源；本 tool 不直接生成 visibleTrainingProposal。",
      "Grounding Rules：同一 run 内等价 input 不会补充新事实；新的查询应来自用户新增约束、替换要求、更多候选要求或当前候选没有可用子集。",
      "Grounding Rules：如果当前缺口是 prescription 或 schedule，应基于已有候选、用户目标和结构化收口合同构造、澄清或失败收口；动作候选事实本身不足、查询约束变化或用户要求更多候选时，才需要新的动作库查询。",
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
      const equipmentScope = normalizeExerciseEquipmentScope(input.equipmentScope);
      const muscleMatchRole: ExerciseResourceMuscleMatchRole = input.muscleMatchRole ?? "primary";
      const candidateCountPerSection = input.candidateCountPerSection
        ?? agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection;
      const normalizedInput = {
        ...input,
        exerciseNames,
        muscles,
        muscleMatchRole,
        equipmentScope,
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
          executionProfile: input.executionProfile,
          equipmentScope,
          impactLimit: input.impactLimit,
          noiseLimit: input.noiseLimit,
          muscles,
          muscleMatchRole,
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
          executionProfile: firstResult.query.executionProfile,
          equipmentScope: firstResult.query.equipmentScope,
          impactLimit: firstResult.query.impactLimit,
          noiseLimit: firstResult.query.noiseLimit,
          muscles: firstResult.query.muscles,
          muscleMatchRole: firstResult.query.muscleMatchRole ?? muscleMatchRole,
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
      const hasCandidates = hasModelVisibleCandidateFacts(output);

      return {
        status: output.status,
        factLevel: hasCandidates ? "candidate" : "diagnostic",
        query: {
          suitabilities: output.query.suitabilities,
          ...(output.query.exerciseNames ? { exerciseNames: output.query.exerciseNames } : {}),
          ...(output.query.category ? { category: output.query.category } : {}),
          ...(output.query.level ? { level: output.query.level } : {}),
          ...(output.query.force ? { force: output.query.force } : {}),
          ...(output.query.mechanic ? { mechanic: output.query.mechanic } : {}),
          ...(output.query.executionProfile ? { executionProfile: output.query.executionProfile } : {}),
          ...(output.query.equipmentScope ? { equipmentScope: output.query.equipmentScope } : {}),
          ...(output.query.impactLimit ? { impactLimit: output.query.impactLimit } : {}),
          ...(output.query.noiseLimit ? { noiseLimit: output.query.noiseLimit } : {}),
          ...(output.query.muscles ? { muscles: output.query.muscles } : {}),
          muscleMatchRole: output.query.muscleMatchRole,
          ...(output.query.goalTag ? { goalTag: output.query.goalTag } : {}),
          ...(output.query.riskTag ? { riskTag: output.query.riskTag } : {}),
          ...(output.query.requiredExerciseIds ? { requiredExerciseIds: output.query.requiredExerciseIds } : {}),
          ...(output.query.excludeExerciseIds ? { excludeExerciseIds: output.query.excludeExerciseIds } : {}),
        },
        queryBoundary: createModelVisibleQueryBoundary(output, broadQuery),
        resourceBoundary: createModelVisibleResourceBoundary(output),
        coverage: createModelVisibleCandidateCoverage(output),
        candidateGroups: mapModelVisibleCandidateGroups(
          output.groups,
          (exercise) => ({
            exerciseId: exercise.exerciseId,
            nameZh: exercise.nameZh,
            nameEn: exercise.nameEn,
            equipmentZh: exercise.equipmentZh,
            homeRequirementZh: exercise.homeRequirementZh,
            executionTaxonomy: exercise.executionTaxonomy,
            primaryMusclesZh: exercise.primaryMusclesZh,
            secondaryMusclesZh: exercise.secondaryMusclesZh,
            imageUrl: exercise.imageUrl,
          }),
        ),
      };
    },
    toUserProjection: (output) => ({
      status: output.status,
      query: toSearchResourceQueryProjection(output.query),
      suitabilities: output.query.suitabilities,
      candidateCountPerSection: output.query.candidateCountPerSection,
      totalMatches: output.query.totalMatches,
      returnedCount: output.query.returnedCount,
      truncated: output.query.truncated,
      excludedCount: output.query.excludedCount,
      appliedFilters: output.query.appliedFilters,
      filterApplications: toProjectionFilterApplications(output.query.filterApplications),
      candidateGroups: mapCandidateGroups(output.groups, (exercise) => ({
        exerciseId: exercise.exerciseId,
        nameZh: exercise.nameZh,
        nameEn: exercise.nameEn,
        equipmentZh: exercise.equipmentZh,
        homeRequirementZh: exercise.homeRequirementZh,
        executionTaxonomy: exercise.executionTaxonomy,
        primaryMusclesZh: exercise.primaryMusclesZh,
        imageUrl: exercise.imageUrl,
      })),
      diagnostics: output.diagnostics,
    }),
    toTraceSummary: (output) => toLangChainJsonValue({
      status: output.status,
      query: toSearchResourceQueryProjection(output.query),
      suitabilities: output.query.suitabilities,
      candidateCountPerSection: output.query.candidateCountPerSection,
      totalMatches: output.query.totalMatches,
      returnedCount: output.query.returnedCount,
      filterSemantics: output.query.filterSemantics,
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
    }, agentRuntimeConfig.langChain.toolWrapper.traceSummaryMaxLength),
  });
}

/** searchExerciseResourcesLangChainTool 是生产 LangChain 默认动作库查询能力，facet catalog 可由 route 注入替换。 */
export const searchExerciseResourcesLangChainTool = createSearchExerciseResourcesLangChainTool();

// createModelVisibleResourceBoundary 告诉 Planner 动作库只是产品资源库，不是现实训练知识全集。
function createModelVisibleResourceBoundary(output: SearchExerciseResourcesOutput) {
  const missingExerciseNames = collectMissingExerciseNames(output.diagnostics);

  return {
    catalogRole: "Exercise 动作库提供产品可渲染动作资源，用于动作卡片、图片、动作详情、结构化训练结果和训练执行项。",
    emptyResultMeaning: "空候选或点名动作未命中只表示当前查询口径下产品动作库没有匹配的可渲染资源；不表示现实训练动作或训练知识不存在。",
    plainTextKnowledgeBoundary: "不展示产品动作卡片、图片、结构化训练结果或训练执行项时，可以基于用户输入、上下文和通用训练知识给普通文本建议，并说明这些内容不是数据库动作条目。",
    structuredOutputBoundary: "需要展示具体数据库动作条目、动作卡片、图片、visibleTrainingProposal、routine、plan 或训练执行项时，具体 exerciseId 必须来自模型可见数据库动作事实或受控业务事实。",
    ...(missingExerciseNames.length ? { missingExerciseNames } : {}),
  };
}

// collectMissingExerciseNames 只把点名未命中投影成资源缺失事实，不泄漏内部 diagnostic code。
function collectMissingExerciseNames(diagnostics: SearchExerciseResourcesOutput["diagnostics"]) {
  return [...new Set(diagnostics
    .filter((diagnostic) => diagnostic.code === "exercise_name_not_found" && diagnostic.exerciseName)
    .map((diagnostic) => diagnostic.exerciseName as string))];
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
    executionTaxonomy: {
      requiresExternalEquipment: summary.requiresExternalEquipment,
      requiredEquipmentTags: summary.requiredEquipmentTags,
      supportRequirementTags: summary.supportRequirementTags,
      setupComplexity: summary.setupComplexity,
      impactLevel: summary.impactLevel,
      noiseLevel: summary.noiseLevel,
    },
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

function toSearchResourceQueryProjection(query: SearchExerciseResourcesOutput["query"]) {
  return {
    suitabilities: query.suitabilities,
    ...(query.exerciseNames ? { exerciseNames: query.exerciseNames } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.level ? { level: query.level } : {}),
    ...(query.force ? { force: query.force } : {}),
    ...(query.mechanic ? { mechanic: query.mechanic } : {}),
    ...(query.executionProfile ? { executionProfile: query.executionProfile } : {}),
    ...(query.equipmentScope ? { equipmentScope: query.equipmentScope } : {}),
    ...(query.impactLimit ? { impactLimit: query.impactLimit } : {}),
    ...(query.noiseLimit ? { noiseLimit: query.noiseLimit } : {}),
    ...(query.muscles ? { muscles: query.muscles } : {}),
    muscleMatchRole: query.muscleMatchRole,
    ...(query.goalTag ? { goalTag: query.goalTag } : {}),
    ...(query.riskTag ? { riskTag: query.riskTag } : {}),
    ...(query.requiredExerciseIds ? { requiredExerciseIds: query.requiredExerciseIds } : {}),
    ...(query.excludeExerciseIds ? { excludeExerciseIds: query.excludeExerciseIds } : {}),
  };
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
    executionProfile: input.executionProfile,
    equipmentScope: input.equipmentScope,
    impactLimit: input.impactLimit,
    noiseLimit: input.noiseLimit,
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
  if (input.executionProfile && !matchesExecutionProfile(exercise, input.executionProfile)) {
    conflicts.push("executionProfile");
  }
  if (input.equipmentScope && !matchesEquipmentScope(exercise, input.equipmentScope)) {
    conflicts.push("equipmentScope");
  }
  if (input.impactLimit && !matchesImpactLimit(exercise.impactLevel, input.impactLimit)) {
    conflicts.push("impactLimit");
  }
  if (input.noiseLimit && !matchesNoiseLimit(exercise.noiseLevel, input.noiseLimit)) {
    conflicts.push("noiseLimit");
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

// createModelVisibleCandidateCoverage 为 Planner 提供查询事实覆盖边界，不承载最终训练方案 readiness。
function createModelVisibleCandidateCoverage(output: SearchExerciseResourcesOutput) {
  const sectionsWithCandidates = output.query.suitabilities.filter((suitability) =>
    (output.groups[suitability]?.exercises.length ?? 0) > 0,
  );
  const sectionsWithoutCandidates = output.query.suitabilities.filter((suitability) =>
    !sectionsWithCandidates.includes(suitability),
  );

  return {
    hasCandidates: sectionsWithCandidates.length > 0,
    sectionsWithCandidates,
    sectionsWithoutCandidates,
    allRequestedSectionsHaveCandidates: sectionsWithoutCandidates.length === 0,
    repeatQueryBoundary: "同一 run 内等价 input 已有查询事实；重复调用不会新增事实。请基于当前可见事实推理、澄清或失败收口。",
  };
}

// hasModelVisibleCandidateFacts 只根据是否存在可投影候选决定事实等级，查询宽窄不再降低候选可消费性。
function hasModelVisibleCandidateFacts(output: SearchExerciseResourcesOutput) {
  return Object.values(output.groups).some((group) => (group?.exercises.length ?? 0) > 0);
}

// createModelVisibleQueryBoundary 把 broad/default 查询口径与 candidate factLevel 分开，避免模型误把可用候选当作诊断。
function createModelVisibleQueryBoundary(output: SearchExerciseResourcesOutput, broadQuery: boolean) {
  const defaultedSuitabilities = output.query.suitabilities.length === 1
    && output.query.suitabilities[0] === "training"
    && output.query.appliedFilters.every((filter) => filter.field !== "suitabilities");

  return {
    scope: broadQuery ? "broad" : "constrained",
    candidateFactBoundary: "candidateGroups[].exercises 若存在，表示可选择的动作候选事实；查询口径较宽或使用默认条件不会改变该候选事实等级。",
    ...(defaultedSuitabilities
      ? { defaultedSuitabilities: "未显式填写 suitabilities 时按 training 候选查询；这是查询默认值，不是最终训练编排指令。" }
      : {}),
  };
}

function formatFacetCatalogForDescription(catalog?: ExerciseResourceFacetCatalog) {
  if (!catalog) {
    return "";
  }

  const normalized = normalizeExerciseResourceFacetCatalogForPlanner(catalog);
  return [
    "当前动作库 facet catalog 摘要：",
    `muscles: ${formatFacetValues(normalized.muscles)}`,
    `executionProfile: ${exerciseExecutionProfileValues.join(", ")}`,
    `equipmentScope.tags: ${formatFacetValues(normalized.executionTaxonomy.requiredEquipmentTags)}`,
    `impactLimit: ${formatFacetValues(normalized.executionTaxonomy.impactLevels)}`,
    `noiseLimit: ${formatFacetValues(normalized.executionTaxonomy.noiseLevels)}`,
    `levels: ${formatFacetValues(normalized.levels)}`,
    `categories: ${formatFacetValues(normalized.categories)}`,
  ].join("\n");
}

function formatFacetValues(values: readonly string[]) {
  return values.slice(0, 24).join(", ");
}
