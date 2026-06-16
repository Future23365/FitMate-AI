import { z } from "zod";

export type ShadowJsonValue =
  | string
  | number
  | boolean
  | null
  | ShadowJsonValue[]
  | { [key: string]: ShadowJsonValue };

/** ShadowJsonValueSchema 限制 shadow 文件只保存可序列化诊断事实，避免函数、Error 或类实例进入报告。 */
export const ShadowJsonValueSchema: z.ZodType<ShadowJsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(ShadowJsonValueSchema),
  z.record(z.string(), ShadowJsonValueSchema),
]));

const jsonPathSchema = z.string().min(1).regex(/^\$([.[].*)?$/, "必须引用 shadow input 内部 JSON path。");
const roundIdSchema = z.string().regex(/^round-\d{3}$/, "roundId 必须形如 round-001。");

export const ShadowLlmProbeDecisionKindSchema = z.enum([
  "call_tool",
  "final_answer",
  "contract_gap",
]);

export const ShadowLlmProbeTerminalStatusSchema = z.enum([
  "active",
  "final_answer",
  "contract_gap",
  "budget_exhausted",
  "decision_validation_failed",
  "tool_execution_failed",
]);

export const ShadowLlmProbeConcernCategorySchema = z.enum([
  "prompt_conflict",
  "tool_selection_ambiguous",
  "schema_source_unclear",
  "tool_result_summary_insufficient",
  "stop_condition_unclear",
  "finalization_contract_unclear",
  "debug_only_leakage",
  "case_specific_rule_smell",
  "runtime_budget_mismatch",
  "contamination_risk",
]);

export const ShadowLlmProbeSourceRefSchema = z.object({
  id: z.string().min(1),
  path: jsonPathSchema,
  label: z.string().min(1),
}).strict();

export const ShadowLlmProbeMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
}).strict();

export const ShadowLlmProbeToolContractSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: ShadowJsonValueSchema,
  schemaDescriptions: z.array(z.object({
    path: jsonPathSchema,
    description: z.string().min(1),
  }).strict()).default([]),
}).strict();

export const ShadowLlmProbeInputSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  roundId: roundIdSchema,
  createdAt: z.string().datetime(),
  inputSource: z.object({
    kind: z.literal("single_message"),
    messagePreview: z.string(),
  }).strict(),
  systemPrompt: z.string().min(1),
  messages: z.array(ShadowLlmProbeMessageSchema).min(1),
  tools: z.array(ShadowLlmProbeToolContractSchema),
  finalizationTool: ShadowLlmProbeToolContractSchema,
  toolResultSummaries: z.array(z.object({
    roundId: roundIdSchema,
    toolName: z.string().min(1),
    status: z.enum(["succeeded", "failed"]),
    content: z.string(),
  }).strict()).default([]),
  budget: z.object({
    roundIndex: z.number().int().min(1),
    maxRounds: z.number().int().min(1),
    maxToolCalls: z.number().int().min(0),
    remainingToolCalls: z.number().int().min(0),
    maxModelCalls: z.number().int().min(0),
  }).strict(),
  sourceRefs: z.array(ShadowLlmProbeSourceRefSchema),
}).strict();

export const ShadowLlmProbeEvidenceSchema = z.object({
  source: z.enum(["systemPrompt", "messages", "tools", "toolResults", "budget", "finalizationTool"]),
  path: jsonPathSchema,
  summary: z.string().min(1),
}).strict();

export const ShadowLlmProbeFieldRationaleSchema = z.object({
  path: jsonPathSchema,
  source: z.enum(["systemPrompt", "messages", "tools", "toolResults", "budget", "finalizationTool"]),
  reason: z.string().min(1),
}).strict();

export const ShadowLlmProbeContractConcernSchema = z.object({
  category: ShadowLlmProbeConcernCategorySchema,
  summary: z.string().min(1),
  evidencePath: jsonPathSchema.optional(),
}).strict();

export const ShadowLlmProbeContaminationAuditSchema = z.object({
  usedOnlyShadowInput: z.boolean(),
  suspectedExternalKnowledge: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
}).strict();

export const ShadowLlmProbeFinalAnswerSchema = z.object({
  content: z.string().min(1),
  suggestedQuestions: z.array(z.string().min(1)).max(3).default([]),
  rationale: z.string().min(1),
}).strict();

/** ShadowLlmProbeDecisionSchema 是 Codex 每轮必须写入的稳定 JSON 合同。 */
export const ShadowLlmProbeDecisionSchema = z.object({
  runId: z.string().min(1),
  roundId: roundIdSchema,
  decision: ShadowLlmProbeDecisionKindSchema,
  toolName: z.string().min(1).nullable().default(null),
  toolInput: ShadowJsonValueSchema.nullable().default(null),
  finalAnswer: ShadowLlmProbeFinalAnswerSchema.nullable().default(null),
  evidence: z.array(ShadowLlmProbeEvidenceSchema).min(1),
  fieldRationale: z.array(ShadowLlmProbeFieldRationaleSchema).default([]),
  missingFacts: z.array(z.string()).default([]),
  contractConcerns: z.array(ShadowLlmProbeContractConcernSchema).default([]),
  contaminationAudit: ShadowLlmProbeContaminationAuditSchema,
}).strict().superRefine((decision, ctx) => {
  if (decision.decision === "call_tool") {
    if (!decision.toolName) {
      ctx.addIssue({ code: "custom", path: ["toolName"], message: "call_tool 必须提供 toolName。" });
    }
    if (decision.toolInput === null || typeof decision.toolInput !== "object" || Array.isArray(decision.toolInput)) {
      ctx.addIssue({ code: "custom", path: ["toolInput"], message: "call_tool 必须提供 object toolInput。" });
    }
    if (decision.finalAnswer !== null) {
      ctx.addIssue({ code: "custom", path: ["finalAnswer"], message: "call_tool 不能同时提供 finalAnswer。" });
    }
  }

  if (decision.decision === "final_answer") {
    if (decision.finalAnswer === null) {
      ctx.addIssue({ code: "custom", path: ["finalAnswer"], message: "final_answer 必须提供 finalAnswer。" });
    }
    if (decision.toolName || decision.toolInput !== null) {
      ctx.addIssue({ code: "custom", path: ["toolName"], message: "final_answer 不能提供 toolName 或 toolInput。" });
    }
  }

  if (decision.decision === "contract_gap" && decision.missingFacts.length === 0 && decision.contractConcerns.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["missingFacts"],
      message: "contract_gap 必须提供 missingFacts 或 contractConcerns。",
    });
  }
});

export const ShadowLlmProbeToolResultSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  roundId: roundIdSchema,
  toolName: z.string().min(1),
  status: z.enum(["succeeded", "failed"]),
  modelVisibleSummary: z.string(),
  executionRecord: ShadowJsonValueSchema,
  nextInputPath: z.string().optional(),
}).strict();

export const ShadowLlmProbeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: ShadowLlmProbeTerminalStatusSchema,
  activeRoundId: roundIdSchema,
  inputSource: z.object({
    kind: z.literal("single_message"),
    messagePreview: z.string(),
  }).strict(),
  actor: z.object({
    userId: z.string().min(1),
    conversationId: z.string().optional(),
  }).strict(),
  rounds: z.array(z.object({
    roundId: roundIdSchema,
    inputPath: z.string(),
    decisionPath: z.string(),
    toolResultPath: z.string().optional(),
  }).strict()).min(1),
  toolCallsUsed: z.number().int().min(0),
  terminal: z.object({
    status: ShadowLlmProbeTerminalStatusSchema.exclude(["active"]),
    roundId: roundIdSchema,
    reason: z.string(),
  }).strict().optional(),
}).strict();

export const ShadowLlmProbeReportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  generatedAt: z.string().datetime(),
  finalStatus: ShadowLlmProbeTerminalStatusSchema,
  inputSource: z.object({
    kind: z.literal("single_message"),
    messagePreview: z.string(),
  }).strict(),
  roundCount: z.number().int().min(0),
  rounds: z.array(z.object({
    roundId: roundIdSchema,
    decision: ShadowLlmProbeDecisionKindSchema.optional(),
    toolName: z.string().optional(),
    evidence: z.array(ShadowLlmProbeEvidenceSchema).default([]),
    fieldRationale: z.array(ShadowLlmProbeFieldRationaleSchema).default([]),
    missingFacts: z.array(z.string()).default([]),
    contractConcerns: z.array(ShadowLlmProbeContractConcernSchema).default([]),
    contaminationAudit: ShadowLlmProbeContaminationAuditSchema.optional(),
    toolResultStatus: z.enum(["succeeded", "failed"]).optional(),
  }).strict()),
  categories: z.array(ShadowLlmProbeConcernCategorySchema),
  developerDiagnosis: z.object({
    included: z.boolean(),
    note: z.string(),
  }).strict(),
}).strict();

export type ShadowLlmProbeInput = z.infer<typeof ShadowLlmProbeInputSchema>;
export type ShadowLlmProbeMessage = z.infer<typeof ShadowLlmProbeMessageSchema>;
export type ShadowLlmProbeToolContract = z.infer<typeof ShadowLlmProbeToolContractSchema>;
export type ShadowLlmProbeDecision = z.infer<typeof ShadowLlmProbeDecisionSchema>;
export type ShadowLlmProbeManifest = z.infer<typeof ShadowLlmProbeManifestSchema>;
export type ShadowLlmProbeToolResult = z.infer<typeof ShadowLlmProbeToolResultSchema>;
export type ShadowLlmProbeReport = z.infer<typeof ShadowLlmProbeReportSchema>;
export type ShadowLlmProbeConcernCategory = z.infer<typeof ShadowLlmProbeConcernCategorySchema>;
