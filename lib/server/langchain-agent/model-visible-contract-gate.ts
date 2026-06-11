import "server-only";

import { z } from "zod";

import {
  langChainFinalResponseJsonSchema,
  langChainFinalResponseToolName,
} from "./final-response-schema";
import { buildLangChainAgentSystemPrompt } from "./prompt";
import { buildLangChainTerminalFailureFinalizerSystemPrompt } from "./terminal-failure-finalizer";
import type { LangChainJsonValue } from "./types";
import type { LangChainToolWrapper } from "./tool-wrapper";
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
  "ambiguousCount",
  "appliedFilters",
  "appliedHardFilters",
  "availableSections",
  "boundary",
  "candidateBoundary",
  "category",
  "code",
  "conflictFields",
  "content",
  "createdAt",
  "currentRunImport",
  "databaseMapping",
  "details",
  "diagnostics",
  "durationMs",
  "equipment",
  "equipmentZh",
  "errorCode",
  "excludedCount",
  "excludeExerciseIds",
  "exercises",
  "exerciseId",
  "exerciseItemCount",
  "exerciseItems",
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
  "hasSchedule",
  "homeRequirement",
  "homeRequirementZh",
  "imageUrl",
  "imported",
  "index",
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
  "missingSections",
  "model",
  "modelCallCount",
  "muscles",
  "nameEn",
  "nameZh",
  "normalizedInputHash",
  "notFoundCount",
  "note",
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
  "primaryMusclesZh",
  "projectionBoundary",
  "proposalKind",
  "q",
  "query",
  "querySpecificity",
  "reason",
  "received",
  "refreshExclusionBoundary",
  "requiredExerciseIds",
  "resourceBoundary",
  "returnedCount",
  "requestedValue",
  "results",
  "reusableTrainingExerciseCount",
  "reusableTrainingExercises",
  "riskTag",
  "runtimeVersion",
  "schemaIssues",
  "schemaVersion",
  "schedule",
  "section",
  "sectionRelation",
  "sectionHint",
  "sectionSummary",
  "sort",
  "specificFilters",
  "status",
  "stepType",
  "stretch",
  "suitability",
  "suitabilities",
  "suggestedQuestions",
  "summaryLength",
  "text",
  "toolCallCount",
  "toolCount",
  "toolName",
  "toolNames",
  "toolVersion",
  "totalMatches",
  "traceSummary",
  "training",
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
  /(必须|务必|应当|应该|需要|请|继续|先).{0,24}(调用|使用).{0,40}(searchExerciseResources|resolveExerciseResourceMentions|inspectVisibleTrainingProposals|submitVisibleTrainingProposal|结构化收口工具|动作查询工具)/i,
  /(下一步|next step).{0,24}(必须|务必|应当|应该|需要|请).{0,24}(调用|使用|查询|补查)/i,
];

const caseSpecificRulePatterns: readonly RegExp[] = [
  /当用户说.{0,40}(时|就)/,
  /如果用户.{0,40}(就调用|则调用|改写|路由)/,
  /用户短句|具体短句|关键词路由|短句模板|phrasing|字段组合|toolName\s*=/i,
  /当.{0,30}字段.{0,20}(等于|为|=).{0,30}时/,
];

const businessReadinessPatterns: readonly RegExp[] = [
  /业务目标.{0,16}(满足|已满足|完成)/,
  /最终交付.{0,16}(准备|可交付|ready)/i,
  /\b(deliveryReadiness|canProduceRoutine|canDeliverPlan|goalSatisfied|businessGoalSatisfied)\b/i,
];

const negationPattern = /(不要|不需要|不能|不得|禁止|不要求|不会|不是|不代表|不替代|不支撑|不得|不应)/;

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

    for (const [index, text] of collectZodSchemaDescriptionTexts(wrapper.inputSchema).entries()) {
      samples.push({
        id: `${wrapper.name}.input_schema.${index + 1}`,
        kind: "schema_description",
        source: `${wrapper.name}.inputSchema`,
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
