import "server-only";

import { z } from "zod";

import {
  langChainFinalResponseJsonSchema,
  langChainFinalResponseToolName,
} from "./final-response-schema";
import { buildLangChainAgentSystemPrompt } from "./prompt";
import { buildLangChainTerminalFailureFinalizerSystemPrompt } from "./terminal-failure-finalizer";
import type { LangChainJsonValue } from "./types";
import {
  getLangChainToolProviderInputSchema,
  type LangChainToolWrapper,
} from "./tool-wrapper";
import {
  createProductionLangChainToolCatalog,
  type CreateProductionLangChainToolCatalogOptions,
} from "./tools/production-tool-catalog";

export type AgentModelVisibleTextKind =
  | "system_prompt"
  | "tool_description"
  | "schema_description"
  | "examples_description"
  | "tool_result_summary"
  | "repair_feedback"
  | "finalization_tool_description"
  | "trace_summary";

export type AgentModelVisibleTextSample = {
  id: string;
  kind: AgentModelVisibleTextKind;
  text: string;
  source: string;
};

export type AgentModelVisibleSummarySample = {
  id: string;
  kind: "tool_result_summary" | "repair_feedback" | "trace_summary";
  value: string | LangChainJsonValue;
  source: string;
};

export type AgentModelVisibleContractFinding = {
  sampleId: string;
  kind: AgentModelVisibleTextKind;
  ruleId: string;
  message: string;
  path?: string;
  excerpt?: string;
};

export type AgentModelVisibleSummaryContractResult = {
  ok: boolean;
  findings: readonly AgentModelVisibleContractFinding[];
};

const allowedSummaryKeys = new Set([
  "$",
  "activitySummary",
  "actual",
  "allowedSections",
  "allowedSectionsRelation",
  "allRequestedSectionsHaveCandidates",
  "ambiguousCount",
  "appliedFilters",
  "appliedHardFilters",
  "availableSections",
  "boundary",
  "candidateBoundary",
  "candidateCountPerSection",
  "candidateFactBoundary",
  "candidateGroups",
  "category",
  "catalogRole",
  "code",
  "conflictFields",
  "content",
  "consumptionBoundary",
  "coverage",
  "createdAt",
  "currentRunImport",
  "databaseMapping",
  "derivationFacts",
  "details",
  "diagnostics",
  "discardedSummaryReason",
  "displayLabel",
  "durationMs",
  "defaultedSuitabilities",
  "equipment",
  "equipmentScope",
  "equipmentZh",
  "errorCode",
  "emptyResultMeaning",
  "excludedCount",
  "excludeExerciseIds",
  "exerciseName",
  "exerciseNames",
  "exercises",
  "exerciseId",
  "exerciseItemCount",
  "exerciseItems",
  "executionProfile",
  "executionTaxonomy",
  "expected",
  "factBoundary",
  "factCount",
  "factLevel",
  "factSchemaVersion",
  "facts",
  "failureCategory",
  "failureCode",
  "failureMessage",
  "field",
  "filterApplicationBoundary",
  "filterApplications",
  "filterSemantics",
  "force",
  "generatedMessageCount",
  "groupKey",
  "groups",
  "groupSemantics",
  "hardFilterPolicy",
  "hasCandidates",
  "hasDisplayableExerciseResources",
  "hasSchedule",
  "homeRequirement",
  "homeRequirementZh",
  "imageUrl",
  "imported",
  "index",
  "impactLevel",
  "impactLevelMax",
  "impactLimit",
  "inputMessageCount",
  "inputMessagePreviews",
  "inputSummary",
  "issues",
  "kind",
  "keys",
  "level",
  "matches",
  "matchedCount",
  "maxReturned",
  "mechanic",
  "mentionCount",
  "message",
  "matchedValues",
  "missingExerciseNames",
  "missingSections",
  "missingForPlan",
  "model",
  "modelCallCount",
  "mode",
  "muscleMatchRole",
  "muscles",
  "nameEn",
  "nameZh",
  "normalizedInputHash",
  "notFoundCount",
  "note",
  "noiseLevel",
  "noiseLevelMax",
  "noiseLimit",
  "ok",
  "operation",
  "options",
  "order",
  "outputBoundary",
  "outputType",
  "outputValidation",
  "path",
  "payloadKind",
  "policyBoundary",
  "positiveAnchorBoundary",
  "plainTextKnowledgeBoundary",
  "primaryMusclesZh",
  "productScope",
  "prescription",
  "projectionBoundary",
  "proposalKind",
  "query",
  "queryBoundary",
  "querySpecificity",
  "reason",
  "received",
  "refreshExclusionBoundary",
  "repeatQueryBoundary",
  "requiredEquipmentTags",
  "requiredExerciseIds",
  "resourceBoundary",
  "resourceReadiness",
  "returnedCount",
  "requiresExternalEquipment",
  "requestedValue",
  "results",
  "reusableFields",
  "reusableTrainingExerciseCount",
  "reusableTrainingExercises",
  "riskTag",
  "rawSummaryLength",
  "runtimeActivities",
  "runtimeActivity",
  "runtimeVersion",
  "schemaIssues",
  "schemaVersion",
  "schedule",
  "section",
  "sectionRelation",
  "sectionHint",
  "sectionSummary",
  "sectionsWithCandidates",
  "sectionsWithoutCandidates",
  "secondaryMusclesZh",
  "setRestSeconds",
  "sets",
  "sort",
  "source",
  "specificFilters",
  "scope",
  "status",
  "stepType",
  "stretch",
  "setupComplexity",
  "structuredOutputBoundary",
  "setupComplexityMax",
  "supportRequirementTags",
  "suitability",
  "suitabilities",
  "suggestedQuestions",
  "summaryLength",
  "tags",
  "target",
  "text",
  "toolCallCount",
  "toolCount",
  "toolName",
  "toolNames",
  "toolVersion",
  "totalMatches",
  "traceSummary",
  "training",
  "transitionRestSeconds",
  "truncated",
  "unappliedInputFilters",
  "usageBoundary",
  "validation",
  "validationBoundary",
  "valueSummary",
  "value",
  "visibleOutput",
  "visibleOutputSchemaVersion",
  "warmup",
  "zeroMatchMuscles",
  "zeroMatchMusclesBoundary",
]);

const historicalForbiddenKeys = new Set([
  "canProduceRoutine",
  "deliveryReadiness",
  "factRef",
  "fulfillment",
  "instructionsZh",
  "messageId",
  "nextActionHints",
  "published",
  "read_recent",
  "recommendedNextStep",
  "resourceId",
  "satisfied",
  "supportSectionCompletionBoundary",
  "supportsOutputKinds",
  "toolResultId",
  "visibleDeliveryBoundary",
]);

const historicalForbiddenTextPatterns: readonly RegExp[] = [
  /\bcontinue_tool_call\b/i,
  /\bfinal_answer_with_visible_outputs\b/i,
  /\bnextActionHints\b/i,
  /\brecommendedNextStep\b/i,
  /\bvisibleDeliveryBoundary\b/i,
  /\bsupportSectionCompletionBoundary\b/i,
  /\bsupportsOutputKinds\b/i,
  /\bfulfillment\.satisfied\b/i,
];

const workflowInstructionPatterns: readonly RegExp[] = [
  /(缺少|没有|未覆盖).{0,24}(warmup|stretch|training|热身|拉伸|主训练).{0,40}(必须|务必|应当|应该|需要|请|继续|先).{0,24}(调用|使用|查询|补查|收口)/i,
  /(必须|务必|应当|应该|需要|请|继续|先).{0,24}(调用|使用).{0,40}(searchExerciseResources|inspectVisibleTrainingProposals|submitVisibleTrainingProposal|结构化收口工具|动作查询工具)/i,
  /(下一步|next step).{0,24}(必须|务必|应当|应该|需要|请).{0,24}(调用|使用|查询|补查)/i,
  /(为了|因为).{0,24}(肌群匹配角色|候选池纯净度|未确认偏好).{0,40}(必须|务必|应当|应该|需要|请|继续|先).{0,24}(调用|使用|查询|补查)/i,
];

const caseSpecificRulePatterns: readonly RegExp[] = [
  /当用户说.{0,40}(时|就)/,
  /如果用户.{0,40}(就调用|则调用|改写|路由)/,
  /用户短句|具体短句|关键词路由|短句模板|phrasing|字段组合|toolName\s*=/i,
  /当.{0,30}字段.{0,20}(等于|为|=).{0,30}时/,
  /服务端.{0,24}(用户自然语言|关键词|正则|同义词|短句模板|phrasing).{0,40}(自动|直接).{0,24}(选择|补写|路由|分流|改写)/i,
];

const businessReadinessPatterns: readonly RegExp[] = [
  /业务目标.{0,16}(满足|已满足|完成)/,
  /最终交付.{0,16}(准备|可交付|ready)/i,
  /\b(deliveryReadiness|canProduceRoutine|canDeliverPlan|goalSatisfied|businessGoalSatisfied)\b/i,
];

const negationPattern = /(不要|不需要|不能|不得|禁止|不要求|不会|不是|不代表|不替代|不支撑|不得|不应)/;

const searchExercisePlannerForbiddenKeys = new Set([
  "totalMatches",
  "returnedCount",
  "truncated",
  "excludedCount",
  "candidateCountPerSection",
  "sort",
  "maxReturned",
  "limit",
  "take",
  "offset",
  "page",
  "pageSize",
  "cursor",
  "querySpecificity",
  "filterSemantics",
  "appliedFilters",
  "filterApplicationBoundary",
  "filterApplications",
  "diagnostics",
  "positiveAnchorBoundary",
  "refreshExclusionBoundary",
  "sectionSummary",
  "availableSections",
  "missingSections",
  "allowedSectionsRelation",
  "groupSemantics",
  "allowedSections",
  "zeroMatchMuscles",
  "exercise_name_ambiguous",
  "exercise_name_too_broad",
  "too_broad",
  "sufficient",
  "insufficient",
  "ready",
  "canProceed",
  "canDeliverPlan",
  "goalSatisfied",
  "businessGoalSatisfied",
  "complete",
]);

const searchExercisePlannerForbiddenTextPatterns: readonly RegExp[] = [
  /\b(exercise_name_ambiguous|exercise_name_too_broad|too_broad)\b/i,
  /\b(sufficient|insufficient|canProceed|canDeliverPlan|goalSatisfied|businessGoalSatisfied|complete)\b/i,
  /(候选|结果|动作).{0,12}(已经|已|不够|不足|足够)/,
  /(已经|已|可以|可).{0,12}(生成|交付).{0,12}(训练方案|计划)/,
  /(必须|务必|应当|应该|需要|请|继续|先).{0,24}(扩大|增加|提高).{0,16}candidateCountPerSection/i,
];

/** createProductionAgentModelVisibleTextSamples 收集当前生产会实际暴露给模型的 prompt、tool description 和 schema description 文本。 */
export function createProductionAgentModelVisibleTextSamples(
  options: CreateProductionLangChainToolCatalogOptions = {},
): readonly AgentModelVisibleTextSample[] {
  const tools = createProductionLangChainToolCatalog(options);
  const samples: AgentModelVisibleTextSample[] = [
    {
      id: "langchain.system_prompt",
      kind: "system_prompt",
      source: "buildLangChainAgentSystemPrompt",
      text: buildLangChainAgentSystemPrompt({ currentDate: "2026-06-11" }),
    },
    {
      id: "langchain.terminal_failure_finalizer.system_prompt",
      kind: "repair_feedback",
      source: "buildLangChainTerminalFailureFinalizerSystemPrompt",
      text: buildLangChainTerminalFailureFinalizerSystemPrompt(),
    },
    {
      id: `${langChainFinalResponseToolName}.json_schema`,
      kind: "finalization_tool_description",
      source: "langChainFinalResponseJsonSchema",
      text: collectJsonSchemaDescriptions(langChainFinalResponseJsonSchema).join("\n"),
    },
  ];

  for (const wrapper of tools) {
    samples.push({
      id: `${wrapper.name}.description`,
      kind: "tool_description",
      source: "production tool catalog",
      text: wrapper.description,
    });

    for (const [index, text] of collectZodSchemaDescriptionTexts(getLangChainToolProviderInputSchema(wrapper)).entries()) {
      samples.push({
        id: `${wrapper.name}.input_schema.${index + 1}`,
        kind: "schema_description",
        source: `${wrapper.name}.providerInputSchema`,
        text,
      });
    }
  }

  return samples;
}

/** validateAgentModelVisibleSummaryContract 校验模型可见 summary / feedback / trace 只使用声明过的事实和诊断字段族。 */
export function validateAgentModelVisibleSummaryContract(
  sample: AgentModelVisibleSummarySample,
): AgentModelVisibleSummaryContractResult {
  const normalized = normalizeSummaryValue(sample.value);
  const findings = [
    ...collectSummaryKeyFindings(sample, normalized.value),
    ...collectSearchExerciseResourcesPlannerSummaryFindings(sample, normalized.value),
    ...lintAgentModelVisibleText({
      id: sample.id,
      kind: sample.kind,
      source: sample.source,
      text: normalized.text,
    }),
  ];

  return {
    ok: findings.length === 0,
    findings,
  };
}

/** lintAgentModelVisibleTextSamples 检查模型可见文本是否包含固定 workflow、case-specific 规则或旧协议回归。 */
export function lintAgentModelVisibleTextSamples(
  samples: readonly AgentModelVisibleTextSample[],
): readonly AgentModelVisibleContractFinding[] {
  return samples.flatMap(lintAgentModelVisibleText);
}

/** collectZodSchemaDescriptionTexts 从 Zod JSON Schema 中提取实际 schema description 文本，供模型可见文本门禁复用。 */
export function collectZodSchemaDescriptionTexts(schema: z.ZodType): readonly string[] {
  return collectJsonSchemaDescriptions(z.toJSONSchema(schema));
}

/** collectLangChainToolWrapperModelVisibleSamples 用 fixture 输出构造 tool result summary 和 trace summary 样本。 */
export function collectLangChainToolWrapperModelVisibleSamples(
  wrapper: LangChainToolWrapper,
  fixtures: readonly { id: string; output: unknown }[],
): readonly AgentModelVisibleSummarySample[] {
  return fixtures.flatMap((fixture) => {
    const parsedOutput = wrapper.outputSchema?.parse(fixture.output) ?? fixture.output;
    const samples: AgentModelVisibleSummarySample[] = [{
      id: `${wrapper.name}.${fixture.id}.model_visible_summary`,
      kind: "tool_result_summary",
      source: `${wrapper.name}.toModelVisibleSummary`,
      value: wrapper.toModelVisibleSummary(parsedOutput),
    }];

    if (wrapper.toTraceSummary) {
      samples.push({
        id: `${wrapper.name}.${fixture.id}.trace_summary`,
        kind: "trace_summary",
        source: `${wrapper.name}.toTraceSummary`,
        value: wrapper.toTraceSummary(parsedOutput),
      });
    }

    return samples;
  });
}

function normalizeSummaryValue(value: string | LangChainJsonValue) {
  if (typeof value !== "string") {
    return {
      value,
      text: JSON.stringify(value),
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { value, text: value };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as LangChainJsonValue;

      return {
        value: parsed,
        text: JSON.stringify(parsed),
      };
    } catch {
      return { value, text: value };
    }
  }

  return { value, text: value };
}

function collectSearchExerciseResourcesPlannerSummaryFindings(
  sample: AgentModelVisibleSummarySample,
  value: unknown,
  path = "$",
): AgentModelVisibleContractFinding[] {
  if (sample.kind !== "tool_result_summary" || !sample.id.startsWith("searchExerciseResources.")) {
    return [];
  }

  if (typeof value === "string") {
    const parsed = tryParseJsonText(value);
    const parsedFindings = parsed === undefined
      ? []
      : collectSearchExerciseResourcesPlannerSummaryFindings(sample, parsed, path);

    return [
      ...parsedFindings,
      ...collectSearchExerciseResourcesPlannerTextFindings(sample, value, path),
    ];
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectSearchExerciseResourcesPlannerSummaryFindings(sample, item, `${path}[${index}]`),
    );
  }

  const findings: AgentModelVisibleContractFinding[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "$" ? key : `${path}.${key}`;

    if (searchExercisePlannerForbiddenKeys.has(key)) {
      findings.push({
        sampleId: sample.id,
        kind: sample.kind,
        ruleId: "search_exercise_planner_forbidden_summary_key",
        message: `searchExerciseResources Planner-visible summary 不得暴露 ${key}。`,
        path: childPath,
      });
    }

    findings.push(...collectSearchExerciseResourcesPlannerSummaryFindings(sample, child, childPath));
  }

  return findings;
}

function collectSearchExerciseResourcesPlannerTextFindings(
  sample: AgentModelVisibleSummarySample,
  text: string,
  path: string,
): AgentModelVisibleContractFinding[] {
  return searchExercisePlannerForbiddenTextPatterns.flatMap((pattern) => {
    const match = pattern.exec(text);
    if (!match) {
      return [];
    }

    const excerpt = readExcerpt(text, match.index, match[0].length);
    if (isNegatedExcerpt(excerpt)) {
      return [];
    }

    return [{
      sampleId: sample.id,
      kind: sample.kind,
      ruleId: "search_exercise_planner_forbidden_summary_text",
      message: "searchExerciseResources Planner-visible summary 不得包含继续查询暗示、过宽 code 或业务目标满足度文案。",
      path,
      excerpt,
    }];
  });
}

function tryParseJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as LangChainJsonValue;
  } catch {
    return undefined;
  }
}

function collectSummaryKeyFindings(
  sample: AgentModelVisibleSummarySample,
  value: unknown,
  path = "$",
): AgentModelVisibleContractFinding[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSummaryKeyFindings(sample, item, `${path}[${index}]`));
  }

  const findings: AgentModelVisibleContractFinding[] = [];

  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "$" ? key : `${path}.${key}`;

    if (historicalForbiddenKeys.has(key)) {
      findings.push({
        sampleId: sample.id,
        kind: sample.kind,
        ruleId: "historical_forbidden_summary_key",
        message: `模型可见 summary 重新暴露历史禁止字段 ${key}。`,
        path: childPath,
      });
      continue;
    }

    if (!allowedSummaryKeys.has(key)) {
      findings.push({
        sampleId: sample.id,
        kind: sample.kind,
        ruleId: "undeclared_summary_key",
        message: `模型可见 summary 字段 ${key} 未在白名单字段族中声明。`,
        path: childPath,
      });
      continue;
    }

    findings.push(...collectSummaryKeyFindings(sample, child, childPath));
  }

  return findings;
}

function lintAgentModelVisibleText(
  sample: AgentModelVisibleTextSample,
): readonly AgentModelVisibleContractFinding[] {
  const text = normalizeText(sample.text);
  const findings: AgentModelVisibleContractFinding[] = [];

  findings.push(...collectPatternFindings({
    sample,
    text,
    ruleId: "historical_forbidden_text",
    message: "模型可见文本包含历史明确禁止字段、旧协议字段或高风险 action 文案。",
    patterns: historicalForbiddenTextPatterns,
    respectNegation: true,
  }));
  findings.push(...collectPatternFindings({
    sample,
    text,
    ruleId: "fixed_tool_workflow_instruction",
    message: "模型可见文本包含固定 tool workflow 或服务端指导模型下一步调用工具的文案。",
    patterns: workflowInstructionPatterns,
    respectNegation: true,
  }));
  findings.push(...collectPatternFindings({
    sample,
    text,
    ruleId: "case_specific_production_rule",
    message: "模型可见文本包含用户短句、关键词、字段组合或具体 phrasing 触发的生产规则。",
    patterns: caseSpecificRulePatterns,
    respectNegation: false,
  }));
  findings.push(...collectPatternFindings({
    sample,
    text,
    ruleId: "business_readiness_in_model_visible_text",
    message: "模型可见文本把业务目标满足度或最终交付准备度混入事实 / 诊断边界。",
    patterns: businessReadinessPatterns,
    respectNegation: true,
  }));

  return findings;
}

function collectPatternFindings(input: {
  sample: AgentModelVisibleTextSample;
  text: string;
  ruleId: string;
  message: string;
  patterns: readonly RegExp[];
  respectNegation: boolean;
}): AgentModelVisibleContractFinding[] {
  const findings: AgentModelVisibleContractFinding[] = [];

  for (const pattern of input.patterns) {
    const match = pattern.exec(input.text);
    if (!match) {
      continue;
    }

    const excerpt = readExcerpt(input.text, match.index, match[0].length);
    if (input.respectNegation && isNegatedExcerpt(excerpt)) {
      continue;
    }

    findings.push({
      sampleId: input.sample.id,
      kind: input.sample.kind,
      ruleId: input.ruleId,
      message: input.message,
      excerpt,
    });
  }

  return findings;
}

function isNegatedExcerpt(excerpt: string) {
  return negationPattern.test(excerpt);
}

function readExcerpt(text: string, index: number, length: number) {
  const start = Math.max(0, index - 36);
  const end = Math.min(text.length, index + length + 36);

  return text.slice(start, end);
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function collectJsonSchemaDescriptions(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const record = schema as Record<string, unknown>;
  const descriptions = typeof record.description === "string" ? [record.description] : [];

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      descriptions.push(...value.flatMap(collectJsonSchemaDescriptions));
      continue;
    }

    descriptions.push(...collectJsonSchemaDescriptions(value));
  }

  return descriptions;
}
