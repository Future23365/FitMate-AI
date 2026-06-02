import { z } from "zod";

import { assistantSuggestionTargetOperationSchema } from "@/lib/shared/chat/assistant-suggestions";
import { conversationArtifactKindSchema } from "@/lib/shared/conversation-artifacts/schema";

export const agentContextSourceKindSchema = z.enum([
  "latest_user_message",
  "recent_message",
  "recent_artifact",
  "user_memory",
  "pending_confirmation",
  "context_snapshot",
  "tool_result",
]);

export const agentContextTrustLevelSchema = z.enum([
  "structured_fact",
  "database_summary",
  "user_supplied",
  "derived_summary",
  "diagnostic_only",
]);

export const agentTruncationReasonSchema = z.enum([
  "none",
  "max_messages",
  "max_artifacts",
  "max_chars",
  "budget",
]);

// Agent context provenance records where each visible fact came from and whether it was truncated.
export const contextProvenanceSchema = z.object({
  sourceKind: agentContextSourceKindSchema,
  sourceId: z.string().trim().min(1),
  sourceUpdatedAt: z.string().trim().min(1).optional(),
  trustLevel: agentContextTrustLevelSchema,
  truncationReason: agentTruncationReasonSchema.default("none"),
  visibleCharCount: z.number().int().min(0),
});

export type ContextProvenance = z.infer<typeof contextProvenanceSchema>;

export const chatMessageSummarySchema = z.object({
  id: z.string().trim().min(1).optional(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().trim().min(1),
  createdAt: z.string().trim().min(1).optional(),
});

export type ChatMessageSummary = z.infer<typeof chatMessageSummarySchema>;

export const agentArtifactSummarySchema = z.object({
  artifactId: z.string().trim().min(1),
  revisionId: z.string().trim().min(1).optional(),
  lineageId: z.string().trim().min(1).optional(),
  kind: conversationArtifactKindSchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(600).optional(),
  // Agent 需要轻量结构化动作事实来绑定后续 routine 生成；完整 payload 仍必须走 artifact 工具读取。
  exerciseIds: z.array(z.string().trim().min(1)).max(120).default([]),
  sessionId: z.string().trim().min(1).optional(),
  status: z.enum(["active", "superseded", "archived"]).optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export type AgentArtifactSummary = z.infer<typeof agentArtifactSummarySchema>;

export const userMemorySnapshotSchema = z.object({
  snapshotId: z.string().trim().min(1),
  facts: z.array(z.string().trim().min(1).max(240)).max(24).default([]),
  preferences: z.array(z.string().trim().min(1).max(240)).max(24).default([]),
  avoidances: z.array(z.string().trim().min(1).max(240)).max(24).default([]),
  // equipment 只承载已确认的结构化器械记忆，供 Agent 工具判断是否可以取消默认无器械。
  equipment: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export type UserMemorySnapshot = z.infer<typeof userMemorySnapshotSchema>;

export const agentConfirmationSchema = z.object({
  confirmationId: z.string().trim().min(1),
  status: z.enum(["pending", "accepted", "rejected", "expired"]),
  resourceType: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(500),
  expiresAt: z.string().trim().min(1).optional(),
});

export type AgentConfirmation = z.infer<typeof agentConfirmationSchema>;

export const contextSnapshotSchema = z.object({
  snapshotId: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(2400),
  sourceMessageIds: z.array(z.string().trim().min(1)).max(80).default([]),
  createdAt: z.string().trim().min(1).optional(),
  trustLevel: z.literal("derived_summary").default("derived_summary"),
  factSourceWarning: z
    .literal("snapshot_not_fact_source")
    .default("snapshot_not_fact_source"),
});

export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>;

export const contextLimitsSchema = z.object({
  maxRecentMessages: z.number().int().min(1).max(40).default(12),
  maxRecentArtifacts: z.number().int().min(0).max(20).default(8),
  maxMessageChars: z.number().int().min(80).max(4000).default(1200),
  maxArtifactSummaryChars: z.number().int().min(80).max(2000).default(700),
});

export type ContextLimits = z.infer<typeof contextLimitsSchema>;

// ContextPackage is the single execution context handed to the Agent runtime.
export const contextPackageSchema = z.object({
  latestUserMessage: z.string().trim().min(1),
  recentMessages: z.array(chatMessageSummarySchema),
  recentArtifacts: z.array(agentArtifactSummarySchema),
  memorySnapshot: userMemorySnapshotSchema.optional(),
  pendingConfirmation: agentConfirmationSchema.optional(),
  optionalContextSnapshot: contextSnapshotSchema.optional(),
  provenance: z.array(contextProvenanceSchema),
  limits: contextLimitsSchema,
});

export type ContextPackage = z.infer<typeof contextPackageSchema>;

export const agentToolAccessLevelSchema = z.enum([
  "read",
  "plan",
  "generate",
  "validate",
  "write",
  "clarify",
]);

export type AgentToolAccessLevel = z.infer<typeof agentToolAccessLevelSchema>;

// AgentToolOperationKind 描述工具在 Agent 链路中的能力类型，供 registry、prompt 和 trace 共用。
export const agentToolOperationKindSchema = z.enum([
  "exact_read",
  "list",
  "structured_search",
  "reference_resolution",
  "memory_snapshot",
  "memory_query",
  "candidate_to_draft",
  "edit_plan_compile",
  "patch_compile",
  "validation",
  "policy",
  "persistence",
  "clarification",
]);

export type AgentToolOperationKind = z.infer<typeof agentToolOperationKindSchema>;

export const agentToolDependencyKindSchema = z.enum([
  "tool_result",
  "candidate_set",
  "artifact_payload",
  "workout_edit_plan",
  "draft",
  "patch",
  "validation",
  "policy_decision",
  "confirmation",
]);

export type AgentToolDependencyKind = z.infer<typeof agentToolDependencyKindSchema>;

export const agentToolDependencySchema = z.object({
  kind: agentToolDependencyKindSchema,
  required: z.boolean().default(true),
  description: z.string().trim().min(1).max(240),
});

export type AgentToolDependency = z.infer<typeof agentToolDependencySchema>;

export const agentToolDomainCapabilityContractSchema = z.object({
  openspecChange: z.string().trim().min(1),
  capabilityId: z.string().trim().min(1),
  writableResources: z.array(z.string().trim().min(1)).min(1),
  fieldWhitelist: z.array(z.string().trim().min(1)).min(1),
  permissionScope: z.string().trim().min(1),
  confirmationPolicy: z.enum(["none", "low_risk", "required", "policy_driven"]),
  persistenceService: z.string().trim().min(1),
  responseWriterSafeSummary: z.string().trim().min(1).max(500),
});

export type AgentToolDomainCapabilityContract = z.infer<
  typeof agentToolDomainCapabilityContractSchema
>;

export const agentToolErrorCodeSchema = z.enum([
  "invalid_json",
  "invalid_decision",
  "unknown_tool",
  "schema_validation_failed",
  "missing_required_parameter",
  "invalid_parameter",
  "unsupported_operation",
  "ambiguous_resource",
  "insufficient_candidates",
  "result_requirement_unmet",
  "unverifiable_result",
  "forbidden",
  "not_found",
  "invalid_dependency",
  "candidate_set_mismatch",
  "candidate_query_boundary_mismatch",
  "validation_failed",
  "policy_blocked",
  "confirmation_required",
  "timeout",
  "step_limit_exceeded",
  "checkpoint_not_found",
  "resume_conflict",
  "duplicate_tool_failure",
  "model_output_invalid",
  "unregistered_resource_reference",
  "premature_final_result_before_save",
  "repair_budget_exhausted",
  "tool_execution_failed",
  "persistence_failed",
  "hard_failure",
]);

export type AgentToolErrorCode = z.infer<typeof agentToolErrorCodeSchema>;

// AgentToolRequestContract 统一表达模型提交的 operation、硬约束、偏好、结果要求和投影边界。
export const agentToolRequestContractSchema = z.object({
  operation: z.string().trim().min(1),
  hardConstraints: z.record(z.string(), z.unknown()).default({}),
  softPreferences: z.record(z.string(), z.unknown()).default({}),
  resultRequirements: z.record(z.string(), z.unknown()).default({}),
  projection: z.record(z.string(), z.unknown()).default({}),
});

export type AgentToolRequestContract = z.infer<typeof agentToolRequestContractSchema>;

// AgentToolCapabilityContract 是模型可见工具摘要和运行时注册校验的单一事实源。
export const agentToolCapabilityContractSchema = z.object({
  operationKind: agentToolOperationKindSchema,
  supportedOperations: z.array(z.string().trim().min(1)).min(1),
  inputContract: z.object({
    requiredFields: z.array(z.string().trim().min(1)).default([]),
    optionalFields: z.array(z.string().trim().min(1)).default([]),
    acceptedFilters: z.array(z.string().trim().min(1)).default([]),
    acceptedEnums: z.record(z.string(), z.array(z.string().trim().min(1))).default({}),
    resourceRefs: z.array(z.string().trim().min(1)).default([]),
    hardConstraintFields: z.array(z.string().trim().min(1)).default([]),
    softPreferenceFields: z.array(z.string().trim().min(1)).default([]),
    resultRequirementFields: z.array(z.string().trim().min(1)).default([]),
    projectionFields: z.array(z.string().trim().min(1)).default([]),
  }),
  executionContract: z.object({
    reads: z.array(z.string().trim().min(1)).default([]),
    writes: z.array(z.string().trim().min(1)).default([]),
    mustNotRead: z.array(z.string().trim().min(1)).default([]),
    strictness: z.enum(["exact", "hard_filter", "validated_compile", "policy_check"]),
  }),
  refusesWhen: z.array(z.string().trim().min(1)).min(1),
  produces: z.array(z.string().trim().min(1)).default([]),
  evidence: z.array(z.string().trim().min(1)).min(1),
  failureCodes: z.array(agentToolErrorCodeSchema).min(1),
  unsupportedOperations: z.array(z.string().trim().min(1)).default([]),
});

export type AgentToolCapabilityContract = z.infer<typeof agentToolCapabilityContractSchema>;

export const agentToolErrorSchema = z.object({
  code: agentToolErrorCodeSchema,
  message: z.string().trim().min(1).max(600),
  detail: z.unknown().optional(),
  retryable: z.boolean().default(false),
});

export type AgentToolError = z.infer<typeof agentToolErrorSchema>;

export const agentDecisionFeedbackCodeSchema = z.enum([
  "invalid_json",
  "invalid_decision",
  "schema_validation_failed",
  "invalid_dependency",
  "unregistered_resource_reference",
  "premature_final_result_before_save",
  "tool_failed",
  "tool_result_unsatisfied",
  "duplicate_tool_failure",
  "ambiguous_resource",
  "hard_boundary_failure",
  "repair_budget_exhausted",
]);

export type AgentDecisionFeedbackCode = z.infer<typeof agentDecisionFeedbackCodeSchema>;

export const agentDecisionFeedbackResourceKindSchema = z.enum([
  "tool_result",
  "candidate_set",
  "artifact_payload",
  "workout_edit_plan",
  "draft",
  "patch",
  "validation",
  "policy_decision",
  "confirmation",
  "revision",
  "operation_result",
]);

export type AgentDecisionFeedbackResourceKind = z.infer<
  typeof agentDecisionFeedbackResourceKindSchema
>;

export const agentDecisionFeedbackResourceReferenceSchema = z.object({
  kind: agentDecisionFeedbackResourceKindSchema,
  id: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).max(240).optional(),
});

export type AgentDecisionFeedbackResourceReference = z.infer<
  typeof agentDecisionFeedbackResourceReferenceSchema
>;

export const agentAvailableResourceIdsSchema = z.object({
  toolResultIds: z.array(z.string().trim().min(1)).default([]),
  candidateSetIds: z.array(z.string().trim().min(1)).default([]),
  artifactPayloadIds: z.array(z.string().trim().min(1)).default([]),
  editPlanIds: z.array(z.string().trim().min(1)).default([]),
  draftIds: z.array(z.string().trim().min(1)).default([]),
  patchIds: z.array(z.string().trim().min(1)).default([]),
  validationIds: z.array(z.string().trim().min(1)).default([]),
  policyDecisionIds: z.array(z.string().trim().min(1)).default([]),
  confirmationIds: z.array(z.string().trim().min(1)).default([]),
  revisionIds: z.array(z.string().trim().min(1)).default([]),
  operationResultIds: z.array(z.string().trim().min(1)).default([]),
});

export type AgentAvailableResourceIds = z.infer<typeof agentAvailableResourceIdsSchema>;

export const agentDiagnosticResourceIdsSchema = z.object({
  toolResultIds: z.array(z.string().trim().min(1)).default([]),
  candidateSetIds: z.array(z.string().trim().min(1)).default([]),
  partialCandidateSetIds: z.array(z.string().trim().min(1)).default([]),
  failedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  feedbackToolResultIds: z.array(z.string().trim().min(1)).default([]),
  clarificationToolResultIds: z.array(z.string().trim().min(1)).default([]),
});

export type AgentDiagnosticResourceIds = z.infer<typeof agentDiagnosticResourceIdsSchema>;

export const agentDecisionFeedbackAvailableResourcesSchema = agentAvailableResourceIdsSchema.extend({
  consumable: agentAvailableResourceIdsSchema.optional(),
  diagnostic: agentDiagnosticResourceIdsSchema.optional(),
});

const emptyAgentAvailableResourceIds: AgentAvailableResourceIds = {
  toolResultIds: [],
  candidateSetIds: [],
  artifactPayloadIds: [],
  editPlanIds: [],
  draftIds: [],
  patchIds: [],
  validationIds: [],
  policyDecisionIds: [],
  confirmationIds: [],
  revisionIds: [],
  operationResultIds: [],
};

const emptyAgentDiagnosticResourceIds: AgentDiagnosticResourceIds = {
  toolResultIds: [],
  candidateSetIds: [],
  partialCandidateSetIds: [],
  failedToolResultIds: [],
  feedbackToolResultIds: [],
  clarificationToolResultIds: [],
};

const emptyAgentDecisionFeedbackAvailableResources = {
  ...emptyAgentAvailableResourceIds,
  consumable: emptyAgentAvailableResourceIds,
  diagnostic: emptyAgentDiagnosticResourceIds,
};

export type AgentDecisionFeedbackAvailableResources = z.infer<
  typeof agentDecisionFeedbackAvailableResourcesSchema
>;

export const agentDecisionFeedbackBudgetSchema = z.object({
  repairTurnCount: z.number().int().min(0).default(0),
  maxRepairTurns: z.number().int().min(0).default(0),
  remainingRepairTurns: z.number().int().min(0).default(0),
  sameCodeCount: z.number().int().min(0).default(0),
  maxSameCodePerRun: z.number().int().min(1).default(1),
  remainingSteps: z.number().int().min(0).default(0),
});

export type AgentDecisionFeedbackBudget = z.infer<typeof agentDecisionFeedbackBudgetSchema>;

// AgentDecisionFeedback 描述 runtime 拒绝模型决策的结构化原因，不新增业务事实或 tool 能力。
export const agentDecisionFeedbackSchema = z.object({
  code: agentDecisionFeedbackCodeSchema,
  message: z.string().trim().min(1).max(700),
  failedAction: z.string().trim().min(1).max(120).optional(),
  retryable: z.boolean().default(false),
  hardBoundary: z.boolean().default(false),
  availableResources: agentDecisionFeedbackAvailableResourcesSchema.default(emptyAgentDecisionFeedbackAvailableResources),
  missingResources: z.array(agentDecisionFeedbackResourceReferenceSchema).default([]),
  unregisteredReferences: z.array(agentDecisionFeedbackResourceReferenceSchema).default([]),
  recommendedNextTool: z.string().trim().min(1).max(120).optional(),
  recommendedInput: z.unknown().optional(),
  sanitizedReason: z.string().trim().min(1).max(500).optional(),
  repeat: z.object({
    failureKey: z.string().trim().min(1).optional(),
    originalFailureCode: agentToolErrorCodeSchema.optional(),
    repeatCount: z.number().int().min(1),
    firstToolResultId: z.string().trim().min(1).optional(),
    latestToolResultId: z.string().trim().min(1).optional(),
    recommendedAlternative: z.string().trim().min(1).max(240).optional(),
  }).optional(),
  budget: agentDecisionFeedbackBudgetSchema.optional(),
});

export type AgentDecisionFeedback = z.infer<typeof agentDecisionFeedbackSchema>;

// AgentDecisionFeedbackSummary 是唯一进入模型上下文的反馈摘要，避免暴露 raw decision 或大 payload。
export const agentDecisionFeedbackSummarySchema = agentDecisionFeedbackSchema.pick({
  code: true,
  message: true,
  failedAction: true,
  retryable: true,
  hardBoundary: true,
  availableResources: true,
  missingResources: true,
  unregisteredReferences: true,
  recommendedNextTool: true,
  recommendedInput: true,
  sanitizedReason: true,
  repeat: true,
  budget: true,
});

export type AgentDecisionFeedbackSummary = z.infer<typeof agentDecisionFeedbackSummarySchema>;

// AgentToolProducedResource 记录工具成功产出的可引用资源 id，供后续依赖图消费。
export const agentToolProducedResourceSchema = z.object({
  type: z.string().trim().min(1),
  id: z.string().trim().min(1),
});

// AgentToolResultFulfillment 记录工具是否真实满足 ToolRequest，后续工具只能消费 satisfied=true 的资源。
export const agentToolResultFulfillmentSchema = z.object({
  operationKind: agentToolOperationKindSchema,
  operation: z.string().trim().min(1),
  satisfied: z.boolean(),
  producedResources: z.array(agentToolProducedResourceSchema).default([]),
  appliedHardConstraints: z.record(z.string(), z.unknown()).default({}),
  unmetResultRequirements: z.array(z.string().trim().min(1)).default([]),
  evidence: z.record(z.string(), z.unknown()).default({}),
  diagnostics: z.record(z.string(), z.unknown()).default({}),
});

export type AgentToolResultFulfillment = z.infer<typeof agentToolResultFulfillmentSchema>;

export const agentToolResultResourceRoleSchema = z.enum([
  "consumable",
  "diagnostic",
  "partial",
  "feedback",
]);

export type AgentToolResultResourceRole = z.infer<typeof agentToolResultResourceRoleSchema>;

// AgentToolResultResourceSummary 是 runtime、模型输入、trace 与 Response Writer 共用的资源角色摘要。
export const agentToolResultResourceSummarySchema = z.object({
  role: agentToolResultResourceRoleSchema,
  consumable: z.boolean(),
  diagnostic: z.boolean(),
  partial: z.boolean(),
  feedback: z.boolean(),
  producedResources: z.array(agentToolProducedResourceSchema).default([]),
  unmetResultRequirements: z.array(z.string().trim().min(1)).default([]),
  allowedFinalResultStatuses: z.array(z.enum([
    "answered",
    "blocked",
    "failed",
    "needs_clarification",
    "generated",
    "patched",
    "completed_operation",
  ])).default([]),
});

export type AgentToolResultResourceSummary = z.infer<typeof agentToolResultResourceSummarySchema>;

export const agentRuntimeLimitsSchema = z.object({
  maxSteps: z.number().int().min(1).max(40).default(12),
  maxDecisionCalls: z.number().int().min(1).max(30).default(10),
  timeoutMs: z.number().int().min(500).max(120000).default(30000),
  checkpointEverySteps: z.number().int().min(1).max(10).default(1),
  maxToolResultSummaryChars: z.number().int().min(200).max(10000).default(2400),
  maxRepairTurns: z.number().int().min(0).max(8).default(3),
  maxSameFeedbackCodePerRun: z.number().int().min(1).max(6).default(2),
});

export type AgentRuntimeLimits = z.infer<typeof agentRuntimeLimitsSchema>;

export const defaultAgentRuntimeLimits: AgentRuntimeLimits = agentRuntimeLimitsSchema.parse({});

export const agentHardFailureCodeSchema = z.enum([
  "runtime_contract_violation",
  "unsafe_write_attempt",
  "dependency_graph_corrupt",
  "unrecoverable_tool_error",
  "persistence_boundary_violation",
]);

export type AgentHardFailureCode = z.infer<typeof agentHardFailureCodeSchema>;

export const agentBlockedStateSchema = z.object({
  blockReason: z.string().trim().min(1).max(600),
  toolResultIds: z.array(z.string().trim().min(1)).default([]),
  policyDecisionId: z.string().trim().min(1).optional(),
  recoverySuggestions: z.array(z.string().trim().min(1).max(160)).default([]),
});

export type AgentBlockedState = z.infer<typeof agentBlockedStateSchema>;

export const agentCheckpointSchema = z.object({
  checkpointId: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  stepIndex: z.number().int().min(0),
  createdAt: z.string().trim().min(1),
  resumeToken: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(1200),
});

export type AgentCheckpoint = z.infer<typeof agentCheckpointSchema>;

export const agentToolCallRecordSchema = z.object({
  id: z.string().trim().min(1),
  toolName: z.string().trim().min(1),
  input: z.unknown(),
  status: z.enum(["pending", "success", "failed", "skipped"]),
  startedAt: z.string().trim().min(1).optional(),
  finishedAt: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(400).optional(),
});

export type AgentToolCallRecord = z.infer<typeof agentToolCallRecordSchema>;

// AgentToolResultRecord 是 Agent runtime 登记工具执行结果和资源依赖的统一结构。
export const agentToolResultRecordSchema = z.object({
  toolResultId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
  toolName: z.string().trim().min(1),
  status: z.enum(["success", "failed", "blocked"]),
  output: z.unknown().optional(),
  modelSummary: z.unknown().optional(),
  traceSummary: z.unknown().optional(),
  error: agentToolErrorSchema.optional(),
  candidateSetId: z.string().trim().min(1).optional(),
  artifactPayloadId: z.string().trim().min(1).optional(),
  editPlanId: z.string().trim().min(1).optional(),
  draftId: z.string().trim().min(1).optional(),
  patchId: z.string().trim().min(1).optional(),
  validationId: z.string().trim().min(1).optional(),
  policyDecisionId: z.string().trim().min(1).optional(),
  confirmationId: z.string().trim().min(1).optional(),
  revisionId: z.string().trim().min(1).optional(),
  operationResultId: z.string().trim().min(1).optional(),
  fulfillment: agentToolResultFulfillmentSchema.optional(),
  decisionFeedback: agentDecisionFeedbackSchema.optional(),
  resourceRole: agentToolResultResourceRoleSchema.optional(),
  resourceSummary: agentToolResultResourceSummarySchema.optional(),
});

export type AgentToolResultRecord = z.infer<typeof agentToolResultRecordSchema>;

// resolveAgentToolResultResourceRole 是资源可消费性的唯一判定入口；服务端依赖校验不得重新解释用户语义。
export function resolveAgentToolResultResourceRole(
  result: Pick<AgentToolResultRecord, "status" | "fulfillment" | "decisionFeedback" | "resourceRole">,
): AgentToolResultResourceRole {
  if (result.resourceRole) {
    return result.resourceRole;
  }

  if (result.decisionFeedback) {
    return "feedback";
  }

  if (result.status === "success" && result.fulfillment?.satisfied !== false) {
    return "consumable";
  }

  if (result.fulfillment?.satisfied === false) {
    return "partial";
  }

  return "diagnostic";
}

export function isAgentToolResultConsumable(
  result: Pick<AgentToolResultRecord, "status" | "fulfillment" | "decisionFeedback" | "resourceRole">,
) {
  return resolveAgentToolResultResourceRole(result) === "consumable";
}

export function isAgentToolResultDiagnostic(
  result: Pick<AgentToolResultRecord, "status" | "fulfillment" | "decisionFeedback" | "resourceRole">,
) {
  return !isAgentToolResultConsumable(result);
}

export function createAgentToolResultResourceSummary(
  result: Pick<AgentToolResultRecord, "status" | "fulfillment" | "decisionFeedback" | "resourceRole">,
): AgentToolResultResourceSummary {
  const role = resolveAgentToolResultResourceRole(result);
  const consumable = role === "consumable";

  return {
    role,
    consumable,
    diagnostic: !consumable,
    partial: role === "partial",
    feedback: role === "feedback",
    producedResources: consumable ? result.fulfillment?.producedResources ?? [] : [],
    unmetResultRequirements: result.fulfillment?.unmetResultRequirements ?? [],
    allowedFinalResultStatuses: consumable
      ? ["answered", "generated", "patched", "completed_operation", "blocked", "failed", "needs_clarification"]
      : ["answered", "blocked", "failed", "needs_clarification"],
  };
}

export const agentRepairSummarySchema = z.object({
  repairTurnCount: z.number().int().min(0).default(0),
  repairFeedbackCodes: z.array(agentDecisionFeedbackCodeSchema).default([]),
  finalProjectionSourceToolResultId: z.string().trim().min(1).optional(),
  unregisteredResourceReferences: z.array(agentDecisionFeedbackResourceReferenceSchema).default([]),
  fusedFailureCount: z.number().int().min(0).default(0),
  repairBudgetExhaustedReason: z.string().trim().min(1).max(240).optional(),
  compressedFeedbackCount: z.number().int().min(0).default(0),
  rawFeedbackCount: z.number().int().min(0).default(0),
});

const emptyAgentRepairSummary = {
  repairTurnCount: 0,
  repairFeedbackCodes: [],
  unregisteredResourceReferences: [],
  fusedFailureCount: 0,
  compressedFeedbackCount: 0,
  rawFeedbackCount: 0,
};

export type AgentRepairSummary = z.infer<typeof agentRepairSummarySchema>;

export const agentDependencyNodeSchema = z.object({
  id: z.string().trim().min(1),
  kind: agentToolDependencyKindSchema.or(z.enum(["tool_call", "final_result"])),
  label: z.string().trim().min(1).max(160),
  resourceId: z.string().trim().min(1).optional(),
});

export type AgentDependencyNode = z.infer<typeof agentDependencyNodeSchema>;

export const agentDependencyEdgeSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  relation: z.enum(["produces", "depends_on", "validates", "authorizes", "persists", "projects"]),
});

export type AgentDependencyEdge = z.infer<typeof agentDependencyEdgeSchema>;

// AgentDependencyGraph connects tool results, candidate sets, validation, policy and final projection.
export const agentDependencyGraphSchema = z.object({
  nodes: z.array(agentDependencyNodeSchema).default([]),
  edges: z.array(agentDependencyEdgeSchema).default([]),
});

export type AgentDependencyGraph = z.infer<typeof agentDependencyGraphSchema>;

export const workoutEditIntentSchema = z.object({
  intentId: z.string().trim().min(1),
  targetArtifactId: z.string().trim().min(1).optional(),
  requestedChangeSummary: z.string().trim().min(1).max(600),
  constraints: z.array(z.string().trim().min(1).max(240)).default([]),
  sourceToolResultIds: z.array(z.string().trim().min(1)).default([]),
});

export type WorkoutEditIntent = z.infer<typeof workoutEditIntentSchema>;

export const workoutEditConstraintSchema = z.object({
  kind: z.enum(["exercise", "equipment", "muscle", "difficulty", "duration", "location", "schedule", "preference", "other"]),
  targetId: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).max(240),
});

export type WorkoutEditConstraint = z.infer<typeof workoutEditConstraintSchema>;

// WorkoutEditPlan is the required planning boundary before patch or regenerate tools run.
export const workoutEditPlanSchema = z.object({
  editPlanId: z.string().trim().min(1),
  targetArtifactId: z.string().trim().min(1),
  sourceArtifactPayloadId: z.string().trim().min(1),
  requestedChangeSummary: z.string().trim().min(1).max(600),
  preserve: z.array(workoutEditConstraintSchema).default([]),
  changes: z.array(workoutEditConstraintSchema).min(1),
  scope: z.enum(["single_item", "section", "whole_routine", "whole_plan"]),
  strategy: z.enum(["patch", "regenerate", "clarify"]),
  requiredCandidateSetIds: z.array(z.string().trim().min(1)).default([]),
  confirmationLevel: z.enum(["none", "low", "high"]),
});

export type WorkoutEditPlan = z.infer<typeof workoutEditPlanSchema>;

export const assistantSuggestionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(240),
  targetOperation: assistantSuggestionTargetOperationSchema.optional(),
});

export type AgentAssistantSuggestion = z.infer<typeof assistantSuggestionSchema>;

export const conversationArtifactSummarySchema = z.object({
  artifactId: z.string().trim().min(1),
  revisionId: z.string().trim().min(1).optional(),
  kind: conversationArtifactKindSchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(700).optional(),
});

export type AgentConversationArtifactSummary = z.infer<
  typeof conversationArtifactSummarySchema
>;

export const workoutPatchResultSummarySchema = z.object({
  patchId: z.string().trim().min(1),
  sourceArtifactId: z.string().trim().min(1),
  targetArtifactId: z.string().trim().min(1).optional(),
  changedExerciseIds: z.array(z.string().trim().min(1)).default([]),
  summary: z.string().trim().min(1).max(700),
});

export type AgentWorkoutPatchResultSummary = z.infer<
  typeof workoutPatchResultSummarySchema
>;

export const agentOperationVisibleFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type AgentOperationVisibleField = z.infer<
  typeof agentOperationVisibleFieldSchema
>;

// Operation summaries are deliberately small so Response Writer cannot expose unsafe write payloads.
export const agentOperationSummarySchema = z.object({
  operationType: z.string().trim().min(1).max(120),
  resourceType: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(700),
  visibleFields: z.array(agentOperationVisibleFieldSchema).max(12).default([]),
  sensitiveFieldsOmitted: z.literal(true).default(true),
});

export type AgentOperationSummary = z.infer<typeof agentOperationSummarySchema>;

// AgentExecutionResult is the only terminal execution contract for chat orchestration.
export const agentExecutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("answered"),
    replyContext: z.record(z.string(), z.unknown()).default({}),
    usedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  }),
  z.object({
    status: z.literal("needs_clarification"),
    question: z.string().trim().min(1).max(700),
    assistantSuggestions: z.array(assistantSuggestionSchema).default([]),
    blockingReasons: z.array(z.string().trim().min(1).max(240)).default([]),
    usedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  }),
  z.object({
    status: z.literal("generated"),
    artifact: conversationArtifactSummarySchema,
    revisionId: z.string().trim().min(1),
    validationId: z.string().trim().min(1),
    policyDecisionId: z.string().trim().min(1).optional(),
    usedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  }),
  z.object({
    status: z.literal("patched"),
    patchResult: workoutPatchResultSummarySchema,
    artifact: conversationArtifactSummarySchema,
    revisionId: z.string().trim().min(1),
    validationId: z.string().trim().min(1),
    policyDecisionId: z.string().trim().min(1).optional(),
    usedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  }),
  z.object({
    status: z.literal("completed_operation"),
    operation: agentOperationSummarySchema,
    operationResultId: z.string().trim().min(1),
    usedToolResultIds: z.array(z.string().trim().min(1)).min(1),
    policyDecisionId: z.string().trim().min(1).optional(),
    confirmationId: z.string().trim().min(1).optional(),
  }),
  z.object({
    status: z.literal("blocked"),
    blockReason: z.string().trim().min(1).max(700),
    policyDecisionId: z.string().trim().min(1).optional(),
    recoverySuggestions: z.array(assistantSuggestionSchema).default([]),
    usedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  }),
  z.object({
    status: z.literal("failed"),
    failureCode: agentToolErrorCodeSchema.or(agentHardFailureCodeSchema),
    recoverySuggestions: z.array(assistantSuggestionSchema).default([]),
    usedToolResultIds: z.array(z.string().trim().min(1)).default([]),
  }),
]);

export type AgentExecutionResult = z.infer<typeof agentExecutionResultSchema>;

export const agentExecutionStateSchema = z.object({
  runId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  context: contextPackageSchema,
  toolCalls: z.array(agentToolCallRecordSchema).default([]),
  toolResults: z.array(agentToolResultRecordSchema).default([]),
  dependencyGraph: agentDependencyGraphSchema.default({ nodes: [], edges: [] }),
  pendingConfirmation: agentConfirmationSchema.optional(),
  candidateSets: z.record(z.string(), z.unknown()).default({}),
  editPlan: workoutEditPlanSchema.optional(),
  draft: z.unknown().optional(),
  patch: z.unknown().optional(),
  checkpoints: z.array(agentCheckpointSchema).default([]),
  blockedState: agentBlockedStateSchema.optional(),
  finalResult: agentExecutionResultSchema.optional(),
  repairSummary: agentRepairSummarySchema.default(emptyAgentRepairSummary),
});

export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;

export const agentToolCallDecisionSchema = z.object({
  action: z.literal("call_tool"),
  toolName: z.string().trim().min(1),
  input: z.unknown(),
  reason: z.string().trim().min(1).max(500),
});

export const agentFinalDecisionSchema = z.object({
  action: z.literal("final_result"),
  result: agentExecutionResultSchema,
  reason: z.string().trim().min(1).max(500),
});

// Agent tool decision output is either one registered tool call or one validated final result.
export const agentToolDecisionSchema = z.discriminatedUnion("action", [
  agentToolCallDecisionSchema,
  agentFinalDecisionSchema,
]);

export type AgentToolDecision = z.infer<typeof agentToolDecisionSchema>;
