import "server-only";

import { z } from "zod";

import { buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import {
  createAgentChatTokenBudgetDecision,
  type AiTokenBudgetDecision,
} from "@/lib/server/ai/token-budget";
import { updateConversationSummary } from "@/lib/server/chat/conversation-summary-service";
import {
  getArtifactPayload,
  type RecentArtifactSummary,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { getCurrentUser, type CurrentUser } from "@/lib/server/users/current-user";
import {
  createAgentContextBuilder,
  createToolFirstAgentToolRegistry,
  projectAgentExecutionResultToResponse,
  parseJsonObjectWithRecovery,
  runAgentOrchestrator,
  validateAgentResponseProjection,
  type AgentArtifactSummary,
  type AgentDecisionProvider,
  type AgentExecutionResult,
  type AgentReplayFixture,
  type AgentResponseProjection,
  type AgentToolCallRecord,
  type AgentToolResultRecord,
  type ChatMessageSummary,
  type ContextPackage,
  type UserMemorySnapshot,
} from "@/lib/server/agent-orchestrator";
import {
  aiContextChatMessageSchema,
  buildFitnessConversationContext,
  buildConversationSummaryContext,
  fitnessConversationContextSchema,
  normalizeAiContextMessages,
  type ConversationSummaryContext,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type {
  AgentActivityStage,
  AgentActivityStatus,
} from "@/lib/shared/chat/agent-activity";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import {
  createFinalDecision,
  summarizeRecentArtifactsForTrace,
} from "@/lib/server/dev/ai-run-trace";
import { serverRequest } from "@/lib/server/http/server-request";
import { buildConversationMemoryState } from "@/lib/server/user-feedback-memory/user-feedback-memory-service";
import type { ConversationMemoryState } from "@/lib/shared/user-feedback-memory/schema";
import type { ChatConversation } from "@/features/chat/types";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";

type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type DeepSeekChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: DeepSeekTokenUsage;
};

type AgentDecisionModelInput = {
  contextPackage: ContextPackage;
  registeredTools: Array<Record<string, unknown>>;
  toolResults: Array<Record<string, unknown>>;
  dependencyGraph: Record<string, unknown>;
  remainingSteps: number;
};

export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(120).optional(),
  responseMessageId: z.string().trim().min(1).max(120).optional(),
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  messages: z.array(aiContextChatMessageSchema).min(1).max(200).optional(),
  conversationContext: fitnessConversationContextSchema.optional(),
  thinkingEnabled: z.boolean().optional(),
});

export type AiChatRequest = z.infer<typeof chatRequestSchema>;

export type PreparedAiChatRequest = {
  conversationId?: string;
  responseMessageId?: string;
  rawMessages: ChatMessage[];
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  internalConversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
  hydration: ChatHistoryHydrationMetadata;
  thinkingEnabled: boolean;
  hasClientConversationSummary: boolean;
};

export type ChatHistoryHydrationMetadata = {
  source: "server_saved" | "client_fallback" | "latest_message";
  savedConversationFound: boolean;
  restoredMessageCount: number;
  hasSavedConversationContext: boolean;
  hasClientConversationContext: boolean;
  recommendationIntentCount: number;
  recentArtifactCount: number;
};

export type ChatHistoryHydrationInput = {
  savedConversation?: ChatConversation | null;
  recentArtifactSummaries?: RecentArtifactSummary[];
};

const deepseekRequestTimeoutMs = 45_000;

export function prepareAiChatRequest(
  request: AiChatRequest,
  hydrationInput: ChatHistoryHydrationInput = {},
): PreparedAiChatRequest {
  const savedConversation = hydrationInput.savedConversation ?? null;
  const savedMessages = savedConversation
    ? appendLatestUserMessageIfMissing(savedConversation.messages, request.latestUserMessage)
    : [];
  const rawMessages = savedMessages.length > 0
    ? normalizeAiContextMessages(savedMessages)
    : normalizeAiContextMessages(request.messages ?? [{ role: "user", content: request.latestUserMessage }]);
  const messages = [{ role: "user" as const, content: request.latestUserMessage }];
  const savedSummary = savedConversation?.conversationSummary?.summary;
  const conversationSummaryContext = buildConversationSummaryContext({
    summary: savedSummary ?? request.conversationSummary,
    latestUserMessage: request.latestUserMessage,
  });
  const savedConversationContext = savedConversation
    ? buildHydratedConversationContext(savedConversation, rawMessages)
    : undefined;
  const internalConversationContext =
    savedConversationContext ?? request.conversationContext ?? buildFitnessConversationContext(rawMessages);
  const hydration = createChatHistoryHydrationMetadata({
    source: savedConversationContext || savedMessages.length > 0
      ? "server_saved"
      : request.conversationContext || request.messages?.length
        ? "client_fallback"
        : "latest_message",
    savedConversation,
    request,
    recentArtifactSummaries: hydrationInput.recentArtifactSummaries ?? [],
    restoredMessageCount: savedMessages.length,
    hasSavedConversationContext: Boolean(savedConversationContext),
  });

  return {
    conversationId: request.conversationId,
    responseMessageId: request.responseMessageId,
    rawMessages,
    conversationSummaryContext,
    internalConversationContext,
    recentArtifactSummaries: hydrationInput.recentArtifactSummaries ?? [],
    hydration,
    messages,
    thinkingEnabled: request.thinkingEnabled !== false,
    hasClientConversationSummary: request.conversationSummary.trim().length > 0,
  };
}

// 服务端 hydration 只恢复真实消息、历史卡片摘要和短期 context；Agent 执行事实仍必须通过工具读取。
function buildHydratedConversationContext(
  conversation: ChatConversation,
  rawMessages: ChatMessage[],
): FitnessConversationContext | undefined {
  const latestRecommendationIntent = getLatestRecommendationIntent(conversation);
  const baseContext = conversation.conversationContext ?? buildFitnessConversationContext(rawMessages);
  const currentIntent = baseContext.currentIntent ?? latestRecommendationIntent;

  return fitnessConversationContextSchema.parse({
    ...baseContext,
    currentIntent,
    knownFacts: currentIntent
      ? {
          ...baseContext.knownFacts,
          goal: baseContext.knownFacts.goal ?? currentIntent.goal,
          experience: baseContext.knownFacts.experience ?? currentIntent.experience,
          sessionMinutes: baseContext.knownFacts.sessionMinutes ?? currentIntent.sessionMinutes,
          weeklyFrequency: baseContext.knownFacts.weeklyFrequency ?? currentIntent.weeklyFrequency,
          calendarHorizonDays: baseContext.knownFacts.calendarHorizonDays ?? currentIntent.calendarHorizonDays,
          equipment: baseContext.knownFacts.equipment.length > 0
            ? baseContext.knownFacts.equipment
            : currentIntent.equipment,
          injuryLimitations: baseContext.knownFacts.injuryLimitations.length > 0
            ? baseContext.knownFacts.injuryLimitations
            : currentIntent.injuryLimitations,
          preferences: baseContext.knownFacts.preferences.length > 0
            ? baseContext.knownFacts.preferences
            : currentIntent.preferences,
          avoidances: baseContext.knownFacts.avoidances.length > 0
            ? baseContext.knownFacts.avoidances
            : currentIntent.avoidances,
        }
      : baseContext.knownFacts,
  });
}

function appendLatestUserMessageIfMissing(
  savedMessages: Array<Pick<ChatMessage, "role" | "content">>,
  latestUserMessage: string,
) {
  const normalizedLatest = latestUserMessage.trim();
  const latestSavedUserMessage = [...savedMessages].reverse().find((message) => message.role === "user")?.content.trim();

  if (latestSavedUserMessage === normalizedLatest) {
    return savedMessages;
  }

  return [...savedMessages, { role: "user" as const, content: normalizedLatest }];
}

function getLatestRecommendationIntent(conversation: ChatConversation) {
  const intentByMessageId = conversation.recommendationIntents;

  if (!intentByMessageId) {
    return undefined;
  }

  for (const message of [...conversation.messages].reverse()) {
    const intent = intentByMessageId[message.id];

    if (intent) {
      return intent;
    }
  }

  return Object.values(intentByMessageId).at(-1);
}

function createChatHistoryHydrationMetadata(input: {
  source: ChatHistoryHydrationMetadata["source"];
  savedConversation: ChatConversation | null;
  request: AiChatRequest;
  recentArtifactSummaries: RecentArtifactSummary[];
  restoredMessageCount: number;
  hasSavedConversationContext: boolean;
}): ChatHistoryHydrationMetadata {
  return {
    source: input.source,
    savedConversationFound: Boolean(input.savedConversation),
    restoredMessageCount: input.restoredMessageCount,
    hasSavedConversationContext: input.hasSavedConversationContext,
    hasClientConversationContext: Boolean(input.request.conversationContext || input.request.messages?.length),
    recommendationIntentCount: Object.keys(input.savedConversation?.recommendationIntents ?? {}).length,
    recentArtifactCount: input.recentArtifactSummaries.length,
  };
}

export function encodeChatStreamEvent(type: string, delta = "", metadata?: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify({ type, delta, ...metadata })}\n`);
}

type AgentStreamEvent = {
  type: string;
  metadata: Record<string, unknown>;
};

export type AgentActivityStreamEventInput = {
  stage: AgentActivityStage;
  status?: AgentActivityStatus;
  messageKey?: AgentActivityStage;
  sequence: number;
};

// createAgentActivityStreamEvent 是生产聊天流的唯一 activity payload 构造点，只输出 UI 安全白名单字段。
export function createAgentActivityStreamEvent(input: AgentActivityStreamEventInput): AgentStreamEvent {
  const metadata: Record<string, unknown> = {
    stage: input.stage,
    status: input.status ?? "active",
    sequence: input.sequence,
  };

  if (input.messageKey) {
    metadata.messageKey = input.messageKey;
  }

  return {
    type: "agent_activity",
    metadata,
  };
}

function createAgentActivityStreamWriter(controller: ReadableStreamDefaultController<Uint8Array>) {
  let sequence = 0;
  function reserveSequence() {
    sequence += 1;
    return sequence;
  }

  return {
    emit(stage: AgentActivityStage, status: AgentActivityStatus = "active") {
      const event = createAgentActivityStreamEvent({
        stage,
        status,
        messageKey: stage,
        sequence: reserveSequence(),
      });
      controller.enqueue(encodeChatStreamEvent(event.type, "", event.metadata));
    },
    reserveSequence,
  };
}

function createChatStreamErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "聊天请求失败，请稍后重试。";
}

export async function createAiChatResponse({
  apiKey,
  request,
  trace,
  currentUser,
}: {
  apiKey: string;
  request: PreparedAiChatRequest;
  trace: AiTraceLogger;
  currentUser: CurrentUser;
}): Promise<Response> {
  const {
    rawMessages,
    conversationSummaryContext,
    internalConversationContext,
    messages,
    recentArtifactSummaries,
    thinkingEnabled,
  } = request;

  trace.addStep({
    name: "用户输入",
    type: "user_input",
    input: {
      messages: rawMessages,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      conversationSummary: conversationSummaryContext.summary,
      recentArtifactSummaries: summarizeRecentArtifactsForTrace(recentArtifactSummaries),
      aiContextMessages: messages,
      thinkingEnabled,
    },
    metadata: {
      hydration: request.hydration,
    },
  });
  trace.addStep({
    name: "服务端会话 Hydration",
    type: "persistence",
    output: {
      hydration: request.hydration,
      knownFacts: {
        goal: internalConversationContext.knownFacts.goal,
        weeklyFrequency: internalConversationContext.knownFacts.weeklyFrequency,
        sessionMinutes: internalConversationContext.knownFacts.sessionMinutes,
        equipmentCount: internalConversationContext.knownFacts.equipment.length,
        currentIntentType: internalConversationContext.currentIntent?.intentType,
      },
      recentArtifactKinds: recentArtifactSummaries.map((artifact) => artifact.kind),
    },
    metadata: {
      hydrationSource: request.hydration.source,
      savedConversationFound: request.hydration.savedConversationFound,
      recentArtifactCount: recentArtifactSummaries.length,
    },
  });

  return createAgentOrchestratedChatResponse({
    apiKey,
    request,
    trace,
    currentUser,
  });
}

function createAgentOrchestratedChatResponse(input: {
  apiKey: string;
  request: PreparedAiChatRequest;
  trace: AiTraceLogger;
  currentUser: CurrentUser;
}) {
  return createAgentResponseStream({
    apiKey: input.apiKey,
    request: input.request,
    trace: input.trace,
    currentUser: input.currentUser,
  });
}

function buildAgentContextPackage(
  request: PreparedAiChatRequest,
  memoryState: ConversationMemoryState,
): ContextPackage {
  const builder = createAgentContextBuilder();

  return builder.build({
    latestUserMessage: request.conversationSummaryContext.latestUserMessage,
    recentMessages: request.rawMessages.map(toAgentChatMessageSummary),
    recentArtifacts: request.recentArtifactSummaries.map(toAgentArtifactSummary),
    memorySnapshot: toAgentUserMemorySnapshot(memoryState),
  });
}

function toAgentChatMessageSummary(message: ChatMessage, index: number): ChatMessageSummary {
  return {
    id: `message_${index}`,
    role: message.role,
    content: message.content,
  };
}

function toAgentArtifactSummary(artifact: RecentArtifactSummary): AgentArtifactSummary {
  return {
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    exerciseIds: artifact.exerciseIds,
    updatedAt: artifact.updatedAt,
  };
}

function toAgentUserMemorySnapshot(memoryState: ConversationMemoryState): UserMemorySnapshot {
  const activeMemoryLabels = memoryState.activeMemories
    .map((memory) => memory.subjectLabel ?? memory.subjectId)
    .filter((value): value is string => Boolean(value));
  const preferences = memoryState.activeMemories
    .filter((memory) => memory.kind === "explicit_preference")
    .map((memory) => memory.subjectLabel ?? memory.subjectId)
    .filter((value): value is string => Boolean(value));
  const avoidances = [
    ...memoryState.currentMessage.temporaryAvoidanceLabels,
    ...memoryState.activeMemories
      .filter((memory) => memory.kind === "constraint")
      .map((memory) => memory.subjectLabel ?? memory.subjectId)
      .filter((value): value is string => Boolean(value)),
  ];

  return {
    snapshotId: `memory_${Date.now().toString(36)}`,
    facts: uniqueStrings(activeMemoryLabels).slice(0, 24),
    preferences: uniqueStrings(preferences).slice(0, 24),
    avoidances: uniqueStrings(avoidances).slice(0, 24),
  };
}

// buildAgentDecisionModelInput 构造模型可见的 Agent 状态视图，避免每轮重复发送完整 registry 和诊断 payload。
export function buildAgentDecisionModelInput(input: {
  contextPackage: ContextPackage;
  registeredTools: Array<Record<string, unknown>>;
  toolCalls?: AgentToolCallRecord[];
  toolResults: AgentToolResultRecord[];
  dependencyGraph: { nodes: unknown[]; edges: unknown[] };
  remainingSteps: number;
}): {
  input: AgentDecisionModelInput;
  budget: {
    originalChars: number;
    slimmedChars: number;
    savedChars: number;
    toolResultCount: number;
  };
} {
  const original = {
    contextPackage: input.contextPackage,
    registeredTools: input.registeredTools,
    toolResults: input.toolResults,
    dependencyGraph: input.dependencyGraph,
    remainingSteps: input.remainingSteps,
  };
  const slimmed: AgentDecisionModelInput = {
    contextPackage: input.contextPackage,
    registeredTools: input.registeredTools.map(summarizeToolDefinitionForModel),
    toolResults: summarizeToolResultsForModel(input.toolResults, input.toolCalls ?? []),
    dependencyGraph: summarizeDependencyGraphForModel(input.dependencyGraph),
    remainingSteps: input.remainingSteps,
  };
  const originalChars = JSON.stringify(original).length;
  const slimmedChars = JSON.stringify(slimmed).length;

  return {
    input: slimmed,
    budget: {
      originalChars,
      slimmedChars,
      savedChars: Math.max(0, originalChars - slimmedChars),
      toolResultCount: input.toolResults.length,
    },
  };
}

function summarizeToolDefinitionForModel(tool: Record<string, unknown>) {
  return compactObject({
    name: tool.name,
    description: tool.description,
    accessLevel: tool.accessLevel,
    inputFields: summarizeJsonSchemaFields(tool.inputJsonSchemaHint),
    dependencies: Array.isArray(tool.dependencies)
      ? tool.dependencies.map((dependency) => compactObject({
        kind: readRecordString(dependency, "kind"),
        required: readRecordBoolean(dependency, "required"),
      }))
      : [],
    writableResources: tool.writableResources,
  });
}

// summarizeJsonSchemaFields 保留模型调用工具所需的轻量 Schema 契约，尤其是 union 工具的分支边界。
function summarizeJsonSchemaFields(schema: unknown) {
  const record = asRecord(schema);

  if (!record) {
    return [];
  }

  const variants = readJsonSchemaVariants(record);
  if (variants.length > 0) {
    return variants.map((variant, index) => compactObject({
      variant: index + 1,
      fields: summarizeJsonSchemaObjectFields(variant),
    }));
  }

  return summarizeJsonSchemaObjectFields(record);
}

// readJsonSchemaVariants 识别 discriminated union 转换后的 oneOf/anyOf 分支，避免判别字段被瘦身掉。
function readJsonSchemaVariants(schema: Record<string, unknown>) {
  const rawVariants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : [];

  return rawVariants
    .map(asRecord)
    .filter((variant): variant is Record<string, unknown> => Boolean(variant));
}

function summarizeJsonSchemaObjectFields(record: Record<string, unknown>) {
  const properties = record.properties;
  const required = new Set(Array.isArray(record.required) ? record.required.filter((item): item is string => typeof item === "string") : []);

  if (!properties || typeof properties !== "object") {
    return [];
  }

  return Object.entries(properties as Record<string, unknown>).map(([name, field]) => {
    const fieldRecord = field && typeof field === "object" ? field as Record<string, unknown> : {};

    return compactObject({
      name,
      required: required.has(name),
      type: fieldRecord.type,
      enum: Array.isArray(fieldRecord.enum) ? fieldRecord.enum : undefined,
      const: fieldRecord.const,
      items: summarizeJsonSchemaArrayItems(fieldRecord.items),
      default: fieldRecord.default,
      min: fieldRecord.minimum,
      max: fieldRecord.maximum,
      maxItems: fieldRecord.maxItems,
    });
  });
}

function summarizeJsonSchemaArrayItems(items: unknown) {
  const itemRecord = asRecord(items);

  if (!itemRecord) {
    return undefined;
  }

  return compactObject({
    type: itemRecord.type,
    enum: Array.isArray(itemRecord.enum) ? itemRecord.enum : undefined,
    min: itemRecord.minimum,
    max: itemRecord.maximum,
  });
}

function summarizeToolResultsForModel(
  results: AgentToolResultRecord[],
  calls: AgentToolCallRecord[],
) {
  const callById = new Map(calls.map((call) => [call.id, call]));
  const compacted: Array<Record<string, unknown>> = [];
  const compactedFailureByKey = new Map<string, {
    summary: Record<string, unknown>;
    repeatCount: number;
  }>();

  for (const result of results) {
    const failureKey = createToolFailureCompactionKey(result, callById);

    if (!failureKey) {
      compacted.push(summarizeToolResultForModel(result));
      continue;
    }

    const existing = compactedFailureByKey.get(failureKey);

    if (!existing) {
      const summary = summarizeToolResultForModel(result);
      compactedFailureByKey.set(failureKey, { summary, repeatCount: 1 });
      compacted.push(summary);
      continue;
    }

    existing.repeatCount += 1;
    existing.summary.latestToolResultId = result.toolResultId;
    existing.summary.repeatCount = existing.repeatCount;
    const existingError = asRecord(existing.summary.error);
    existing.summary.error = compactObject({
      ...(existingError ?? {}),
      repeatCount: existing.repeatCount,
      latestToolResultId: result.toolResultId,
    });
  }

  return compacted;
}

function createToolFailureCompactionKey(
  result: AgentToolResultRecord,
  callById: Map<string, AgentToolCallRecord>,
) {
  if (!result.error || result.status === "success") {
    return null;
  }

  const call = callById.get(result.toolCallId);
  const errorDetail = asRecord(result.error.detail);
  const originalFailureCode = result.error.code === "duplicate_tool_failure"
    ? readRecordString(errorDetail, "originalFailureCode") ?? result.error.code
    : result.error.code;
  const duplicateKey = result.error.code === "duplicate_tool_failure"
    ? readRecordString(errorDetail, "duplicateFailureKey")
    : undefined;

  return duplicateKey
    ? `${duplicateKey}:${originalFailureCode}`
    : `${result.toolName}:${stableStringify(call?.input)}:${originalFailureCode}`;
}

function summarizeToolResultForModel(result: AgentToolResultRecord) {
  const duplicateDetail = result.error?.code === "duplicate_tool_failure"
    ? asRecord(result.error.detail)
    : null;

  return compactObject({
    toolResultId: result.toolResultId,
    firstToolResultId: readRecordString(duplicateDetail, "firstToolResultId") ?? result.toolResultId,
    latestToolResultId: readRecordString(duplicateDetail, "latestToolResultId"),
    repeatCount: typeof duplicateDetail?.repeatCount === "number" ? duplicateDetail.repeatCount : undefined,
    toolName: result.toolName,
    status: result.status,
    candidateSetId: result.candidateSetId,
    artifactPayloadId: result.artifactPayloadId,
    editPlanId: result.editPlanId,
    draftId: result.draftId,
    patchId: result.patchId,
    validationId: result.validationId,
    policyDecisionId: result.policyDecisionId,
    confirmationId: result.confirmationId,
    revisionId: result.revisionId,
    operationResultId: result.operationResultId,
    modelSummary: summarizeModelSummaryForDecision(result),
    error: result.error
      ? compactObject({
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
        originalFailureCode: readRecordString(duplicateDetail, "originalFailureCode"),
        firstToolResultId: readRecordString(duplicateDetail, "firstToolResultId"),
        latestToolResultId: readRecordString(duplicateDetail, "latestToolResultId"),
        repeatCount: typeof duplicateDetail?.repeatCount === "number" ? duplicateDetail.repeatCount : undefined,
        detail: summarizeErrorDetail(result.error.detail),
      })
      : undefined,
  });
}

// summarizeToolResultResourceIds 给 Response Writer trace 提供资源索引，避免页面从大 payload 里猜资源关系。
function summarizeToolResultResourceIds(result: AgentToolResultRecord) {
  return compactObject({
    toolResultId: result.toolResultId,
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    candidateSetId: result.candidateSetId,
    artifactPayloadId: result.artifactPayloadId,
    editPlanId: result.editPlanId,
    draftId: result.draftId,
    patchId: result.patchId,
    validationId: result.validationId,
    policyDecisionId: result.policyDecisionId,
    confirmationId: result.confirmationId,
    revisionId: result.revisionId,
    operationResultId: result.operationResultId,
  });
}

function summarizeModelSummaryForDecision(result: AgentToolResultRecord) {
  if (result.toolName !== "searchExercises") {
    return result.modelSummary;
  }
  const summary = asRecord(result.modelSummary);
  const diagnostics = asRecord(summary?.diagnostics);

  return compactObject({
    candidateSetId: summary?.candidateSetId,
    candidateUse: summary?.candidateUse,
    candidates: Array.isArray(summary?.candidates)
      ? summary.candidates.slice(0, 8).map(summarizeExerciseCandidateForDecision)
      : [],
    diagnostics: diagnostics
      ? compactObject({
        query: diagnostics.query,
        filters: diagnostics.filters,
        recalledCount: diagnostics.recalledCount,
        filteredCount: diagnostics.filteredCount,
        expandedTargetMuscles: diagnostics.expandedTargetMuscles,
        finalExerciseIds: diagnostics.finalExerciseIds,
        failureReasons: diagnostics.failureReasons,
        unmatchedTargetMuscles: diagnostics.unmatchedTargetMuscles,
        unmatchedEquipment: diagnostics.unmatchedEquipment,
        suggestedTargetMuscles: diagnostics.suggestedTargetMuscles,
        suggestedEquipment: diagnostics.suggestedEquipment,
        retryable: diagnostics.retryable,
      })
      : undefined,
  });
}

function summarizeExerciseCandidateForDecision(candidate: unknown) {
  const record = asRecord(candidate);

  return compactObject({
    exerciseId: record?.exerciseId,
    nameZh: record?.nameZh,
    categoryZh: record?.categoryZh,
    levelZh: record?.levelZh,
    equipmentZh: record?.equipmentZh,
    primaryMusclesZh: record?.primaryMusclesZh,
    secondaryMusclesZh: record?.secondaryMusclesZh,
    riskTags: record?.riskTags,
    goalTags: record?.goalTags,
  });
}

function summarizeErrorDetail(detail: unknown) {
  const record = asRecord(detail);

  if (!record) {
    return detail;
  }

  return compactObject({
    candidateSetId: record.candidateSetId,
    failureReasons: record.failureReasons,
    retryable: record.retryable,
    diagnostics: record.diagnostics,
  });
}

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") {
    return "undefined";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function summarizeDependencyGraphForModel(graph: { nodes: unknown[]; edges: unknown[] }) {
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    recentNodes: graph.nodes.slice(-12),
    recentEdges: graph.edges.slice(-16),
  };
}

function createDeepSeekAgentDecisionProvider(input: {
  apiKey: string;
  trace: AiTraceLogger;
}): AgentDecisionProvider {
  return async ({ state, registry, remainingSteps, loopTurnId, loopTurnIndex, modelCallId, visibleToolResultIds }) => {
    const modelInput = buildAgentDecisionModelInput({
      contextPackage: state.context,
      registeredTools: registry,
      toolCalls: state.toolCalls,
      toolResults: state.toolResults,
      dependencyGraph: state.dependencyGraph,
      remainingSteps,
    });
    const modelInputContent = JSON.stringify(modelInput.input);
    const modelMessages: DeepSeekChatMessage[] = [
      {
        role: "system",
        content: [
          buildPromptFromModules([
            "base_safety",
            "agent_context_build",
            "agent_tool_decision",
            "agent_tool_execution",
            "agent_final_result",
          ]),
          "必须只返回一个 JSON 对象，不要输出 Markdown。工具调用格式：{\"action\":\"call_tool\",\"toolName\":\"searchExercises\",\"input\":{},\"reason\":\"...\"}。answered 终止格式：{\"action\":\"final_result\",\"result\":{\"status\":\"answered\",\"replyContext\":{\"reply\":\"...\"},\"usedToolResultIds\":[]},\"reason\":\"...\"}。generated 终止格式：{\"action\":\"final_result\",\"result\":{\"status\":\"generated\",\"artifact\":{\"artifactId\":\"...\",\"revisionId\":\"...\",\"kind\":\"routine\",\"title\":\"...\",\"summary\":\"...\"},\"revisionId\":\"...\",\"validationId\":\"...\",\"policyDecisionId\":\"...\",\"usedToolResultIds\":[\"...\"]},\"reason\":\"...\"}。blocked 终止格式：{\"action\":\"final_result\",\"result\":{\"status\":\"blocked\",\"blockReason\":\"...\",\"usedToolResultIds\":[]},\"reason\":\"...\"}。",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: modelInputContent,
      },
    ];

    input.trace.addStep({
      name: "Agent tool decision 请求参数",
      type: "model_request",
      input: {
        model: "deepseek-v4-flash",
        messages: modelMessages,
        response_format: { type: "json_object" },
      },
      metadata: {
        aiStage: "agent_tool_decision",
        aiStageStatus: "executed",
        loopTurnId,
        loopTurnIndex,
        modelCallId,
        visibleToolResultIds,
        promptModules: [
          "base_safety",
          "agent_context_build",
          "agent_tool_decision",
          "agent_tool_execution",
          "agent_final_result",
        ],
        remainingSteps,
        modelInputBudget: modelInput.budget,
        contextPackage: {
          latestUserMessageChars: state.context.latestUserMessage.length,
          recentMessageCount: state.context.recentMessages.length,
          recentArtifactCount: state.context.recentArtifacts.length,
          memoryFactCount: state.context.memorySnapshot?.facts.length ?? 0,
        },
        registeredTools: registry.map((tool) => ({
          name: tool.name,
          accessLevel: tool.accessLevel,
          dependencyCount: tool.dependencies.length,
        })),
        dependencyGraph: summarizeDependencyGraphForModel(state.dependencyGraph),
      },
    });

    const result = await requestDeepSeekJson(input.apiKey, modelMessages, input.trace, {
      aiStage: "agent_tool_decision",
      loopTurnId,
      loopTurnIndex,
      modelCallId,
      visibleToolResultIds,
      promptModules: [
        "base_safety",
        "agent_context_build",
        "agent_tool_decision",
        "agent_tool_execution",
        "agent_final_result",
      ],
    });

    if (result.ok) {
      return result.value;
    }

    input.trace.addStep({
      name: "Agent tool decision 请求失败",
      type: "agent_tool_decision",
      status: "failed",
      error: result,
      metadata: {
        aiStage: "agent_tool_decision",
        loopTurnId,
        loopTurnIndex,
        modelCallId,
        visibleToolResultIds,
        failureCode: result.code,
      },
    });

    return {
      action: "final_result",
      result: {
        status: "failed",
        failureCode: "model_output_invalid",
        recoverySuggestions: [],
        usedToolResultIds: [],
      },
      reason: result.message,
    };
  };
}

function createAgentResponseStream(input: {
  apiKey: string;
  request: PreparedAiChatRequest;
  trace: AiTraceLogger;
  currentUser: CurrentUser;
}) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const activity = createAgentActivityStreamWriter(controller);

      try {
        activity.emit("preparing_context");
        const user = await getCurrentUser(input.currentUser);
        const memoryState = await buildConversationMemoryState({
          userId: user.id,
          latestUserMessage: input.request.conversationSummaryContext.latestUserMessage,
        });
        const context = buildAgentContextPackage(input.request, memoryState);
        const tokenBudgetDecision = createAgentChatTokenBudgetDecision({
          context,
          summaryUpdateSkipped: true,
          summarySkipReason: "Agent 主链不依赖 conversationSummary，本轮 summary 更新降级为可选后台材料。",
        });
        const registry = createToolFirstAgentToolRegistry();

        traceTokenBudgetDecision(input.trace, tokenBudgetDecision);

        const agentRun = await runAgentOrchestrator({
          userId: user.id,
          sessionId: input.request.conversationId ?? "default-chat-session",
          context,
          registry,
          decideNext: createDeepSeekAgentDecisionProvider({
            apiKey: input.apiKey,
            trace: input.trace,
          }),
          onActivity: ({ stage, status }) => activity.emit(stage, status),
          trace: input.trace,
        });
        let agentResult = agentRun.result;
        let projection = projectAgentExecutionResultToResponse({
          result: agentResult,
          toolResults: agentRun.state.toolResults,
        });
        let projectionValidation = validateAgentResponseProjection({
          result: agentResult,
          toolResults: agentRun.state.toolResults,
        });

        if (!projectionValidation.ok) {
          activity.emit("validating_result");
          agentResult = {
            status: "failed",
            failureCode: "runtime_contract_violation",
            recoverySuggestions: [],
            usedToolResultIds: [],
          };
          projection = projectAgentExecutionResultToResponse({
            result: agentResult,
            toolResults: agentRun.state.toolResults,
          });
          projectionValidation = validateAgentResponseProjection({
            result: agentResult,
            toolResults: agentRun.state.toolResults,
          });
        }

        input.trace.addStep({
          name: "Agent Response Writer 投影结果",
          type: "response_write",
          status: projectionValidation.ok ? "success" : "failed",
          input: {
            agentExecutionResult: agentResult,
            toolResultIds: agentRun.state.toolResults.map((toolResult) => toolResult.toolResultId),
            resourceIds: agentRun.state.toolResults.map((toolResult) => summarizeToolResultResourceIds(toolResult)),
          },
          output: {
            projection,
            projectionValidation,
          },
          metadata: {
            aiStage: "agent_response_writer",
            aiStageStatus: "executed",
            promptModules: ["agent_response_writer"],
            visibleToolResultIds: agentRun.state.toolResults.map((toolResult) => toolResult.toolResultId),
            usedToolResultIds: "usedToolResultIds" in agentResult ? agentResult.usedToolResultIds : [],
            responseWriterInput: {
              agentStatus: agentResult.status,
              projectionStatus: projectionValidation.ok ? "valid" : "invalid",
              replyChars: projection.reply.length,
            },
          },
        });

        for (const event of buildAgentStreamEvents({
          agentResult,
          projection,
          replayFixture: agentRun.replayFixture,
          activitySequence: activity.reserveSequence(),
        })) {
          controller.enqueue(encodeChatStreamEvent(event.type, "", event.metadata));
        }

        if (projection.assistantSuggestions.length > 0) {
          controller.enqueue(
            encodeChatStreamEvent("assistant_suggestions", "", {
              assistantSuggestions: projection.assistantSuggestions,
            }),
          );
          controller.enqueue(
            encodeChatStreamEvent("suggested_replies", "", {
              suggestedReplies: projection.assistantSuggestions.map((suggestion) => suggestion.message),
            }),
          );
        }

        controller.enqueue(encodeChatStreamEvent("content", projection.reply));

        for (const artifactEvent of await buildAgentArtifactStreamEvents({
          userId: user.id,
          result: agentResult,
          toolResults: agentRun.state.toolResults,
          projection,
          context,
        })) {
          controller.enqueue(encodeChatStreamEvent(artifactEvent.type, "", artifactEvent.metadata));
        }

        activity.emit("finalizing");
        const summaryUpdate = await updateConversationSummary({
          apiKey: input.apiKey,
          previousSummary: input.request.conversationSummaryContext.summary,
          latestUserMessage: input.request.conversationSummaryContext.latestUserMessage,
          assistantReply: projection.reply,
          internalActionSummary: JSON.stringify({
            agentExecutionResult: agentResult,
            responseProjection: projection,
          }),
          trace: input.trace,
          tokenBudgetDecision,
        });

        input.trace.addStep({
          name: "Agent 聊天回复写入完成",
          type: "response_write",
          input: {
            agentExecutionResult: agentResult,
            responseProjection: projection,
            usedToolResultIds: "usedToolResultIds" in agentResult ? agentResult.usedToolResultIds : [],
          },
          output: {
            content: projection.reply,
            contentLength: projection.reply.length,
            conversationSummarySource: summaryUpdate.source,
            agentStatus: agentResult.status,
          },
          metadata: {
            aiStage: "agent_response_writer",
            aiStageStatus: "executed",
            visibleToolResultIds: agentRun.state.toolResults.map((toolResult) => toolResult.toolResultId),
            usedToolResultIds: "usedToolResultIds" in agentResult ? agentResult.usedToolResultIds : [],
            resourceIds: agentRun.state.toolResults.map((toolResult) => summarizeToolResultResourceIds(toolResult)),
          },
        });
        input.trace.finish("success", createFinalDecision({
          status: agentResult.status === "failed" ? "recoverable_failure" : "success",
          responseType: "agent_execution_result_stream",
          reason: "Tool-first AgentOrchestrator 已完成聊天主链执行。",
          code: agentResult.status === "failed" ? agentResult.failureCode : undefined,
        }));
        controller.enqueue(
          encodeChatStreamEvent("done", "", {
            traceId: input.trace.id,
            conversationSummary: summaryUpdate.summary,
            agentRunId: agentRun.replayFixture.runId,
            agentStatus: agentResult.status,
            agentExecutionResult: agentResult,
            responseProjection: projection,
            dependencyGraph: agentRun.replayFixture.dependencyGraph,
            legacyPathSkip: agentRun.replayFixture.legacyPathSkip,
          }),
        );
      } catch (error) {
        input.trace.finish("failed", createFinalDecision({
          status: "recoverable_failure",
          responseType: "agent_execution_result_stream",
          reason: "Tool-first AgentOrchestrator 聊天主链执行失败。",
          code: "agent_stream_failed",
        }));
        controller.enqueue(
          encodeChatStreamEvent("error", createChatStreamErrorMessage(error), {
            errorCode: "agent_stream_failed",
            recoverable: true,
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

// buildAgentStreamEvents 是生产聊天流的执行结果入口，activity 只暴露粗粒度 UI 阶段。
export function buildAgentStreamEvents(input: {
  agentResult: AgentExecutionResult;
  projection: AgentResponseProjection;
  replayFixture: AgentReplayFixture;
  activitySequence?: number;
}): AgentStreamEvent[] {
  return [
    createAgentActivityStreamEvent({
      stage: "writing_reply",
      status: "active",
      messageKey: "writing_reply",
      sequence: input.activitySequence ?? 1,
    }),
    {
      type: "agent_execution_result",
      metadata: {
        agentExecutionResult: input.agentResult,
        responseProjection: input.projection,
        dependencyGraph: input.replayFixture.dependencyGraph,
        legacyPathSkip: input.replayFixture.legacyPathSkip,
      },
    },
  ];
}

export async function buildAgentArtifactStreamEvents(input: {
  userId: string;
  result: AgentExecutionResult;
  toolResults?: AgentToolResultRecord[];
  projection?: AgentResponseProjection;
  context?: ContextPackage;
}): Promise<Array<{ type: string; metadata: Record<string, unknown> }>> {
  const recommendationEvent = buildExerciseRecommendationArtifactEvent(input);

  if (recommendationEvent) {
    return recommendationEvent;
  }

  if (input.result.status !== "generated" && input.result.status !== "patched") {
    return [];
  }

  const payloadResult = await getArtifactPayload({
    userId: input.userId,
    artifactId: input.result.artifact.artifactId,
  });

  if (!payloadResult.ok) {
    return [
      {
        type: "artifact_failed",
        metadata: {
          artifactKind: input.result.artifact.kind,
          artifactId: input.result.artifact.artifactId,
          errorCode: payloadResult.code,
          guidanceMessage: "训练结果已由 Agent 完成，但本轮流事件没有读取到可展示 payload。",
          recoverable: true,
          suggestedReplies: [],
        },
      },
    ];
  }

  if (input.result.status === "patched") {
    return [
      {
        type: "workout_patch",
        metadata: {
          artifactKind: payloadResult.kind,
          artifactId: payloadResult.artifactId,
          sourceArtifactId: input.result.patchResult.sourceArtifactId,
          payload: payloadResult.payload,
        },
      },
    ];
  }

  return [
    {
      type: "artifact_validated",
      metadata: {
        artifactKind: payloadResult.kind,
        artifactId: payloadResult.artifactId,
        payload: payloadResult.payload,
      },
    },
    {
      type: "artifact",
      metadata: {
        artifactKind: payloadResult.kind,
        artifactId: payloadResult.artifactId,
        payload: payloadResult.payload,
      },
    },
  ];
}

// buildExerciseRecommendationArtifactEvent 将已引用的动作检索结果投影为推荐卡片事件，避免恢复旧 intent 触发链。
function buildExerciseRecommendationArtifactEvent(input: {
  result: AgentExecutionResult;
  toolResults?: AgentToolResultRecord[];
  projection?: AgentResponseProjection;
  context?: ContextPackage;
}): Array<{ type: string; metadata: Record<string, unknown> }> | null {
  if (input.result.status !== "answered" || !("usedToolResultIds" in input.result)) {
    return null;
  }
  const usedToolResultIds = new Set(input.result.usedToolResultIds);
  const referencedSource = input.toolResults?.find((toolResult) => (
    usedToolResultIds.has(toolResult.toolResultId) &&
    toolResult.toolName === "searchExercises" &&
    toolResult.status === "success" &&
    readToolResultCandidateUse(toolResult) === "recommendation" &&
    Boolean(toolResult.candidateSetId)
  ));
  const fallbackSource = input.toolResults
    ?.filter((toolResult) => (
      toolResult.toolName === "searchExercises" &&
      toolResult.status === "success" &&
      readToolResultCandidateUse(toolResult) === "recommendation" &&
      Boolean(toolResult.candidateSetId)
    ))
    .at(-1);
  // 推荐卡片只从本轮 Agent 已选择的 recommendation 候选工具结果投影；不从用户原文或旧 intent 推断。
  const source = referencedSource ?? fallbackSource;

  if (!source) {
    return null;
  }

  const card = buildRecommendationCardFromToolResult({
    toolResult: source,
    context: input.context,
    reply: input.projection?.reply,
  });

  if (!card) {
    return null;
  }

  const artifactId = `recommendation_${source.candidateSetId ?? source.toolResultId}`;
  const metadata = {
    artifactKind: "exercise_recommendation",
    artifactId,
    payload: card,
  };

  return [
    { type: "artifact_validated", metadata },
    { type: "artifact", metadata },
  ];
}

function buildRecommendationCardFromToolResult(input: {
  toolResult: AgentToolResultRecord;
  context?: ContextPackage;
  reply?: string;
}): ExerciseRecommendationCard | null {
  const summary = asRecord(input.toolResult.modelSummary);
  const candidates = Array.isArray(summary?.candidates) ? summary.candidates : [];
  const displayFactsByExerciseId = buildExerciseDisplayFactMap(input.toolResult);
  const items = candidates
    .map((candidate) => toRecommendationItem(candidate, displayFactsByExerciseId))
    .filter((item): item is ExerciseRecommendationCard["items"][number] => Boolean(item));

  if (items.length === 0) {
    return null;
  }

  const goal = truncatePlainText(input.context?.latestUserMessage ?? "动作推荐", 120);
  const card: ExerciseRecommendationCard = {
    title: "为你推荐的动作",
    goal,
    summary: `已根据你的条件筛选出 ${items.length} 个动作。`,
    items: items.slice(0, 10),
    safetyNotes: [
      "训练前先热身，动作过程中如有疼痛请停止。",
    ],
  };

  return card;
}

function readToolResultCandidateUse(toolResult: AgentToolResultRecord) {
  const summary = asRecord(toolResult.modelSummary);
  const candidateUse = summary?.candidateUse;

  return typeof candidateUse === "string" ? candidateUse : undefined;
}

function toRecommendationItem(
  candidate: unknown,
  displayFactsByExerciseId: Map<string, ExerciseDisplayFact>,
): ExerciseRecommendationCard["items"][number] | null {
  const record = asRecord(candidate);

  if (!record || typeof record.exerciseId !== "string" || typeof record.nameZh !== "string") {
    return null;
  }
  const displayFact = displayFactsByExerciseId.get(record.exerciseId);

  return {
    exerciseId: record.exerciseId,
    nameZh: record.nameZh,
    nameEn: typeof record.nameEn === "string" ? record.nameEn : undefined,
    categoryZh: typeof record.categoryZh === "string" ? record.categoryZh : "训练动作",
    levelZh: typeof record.levelZh === "string" ? record.levelZh : "未标注",
    equipmentZh: typeof record.equipmentZh === "string" ? record.equipmentZh : "未标注",
    primaryMusclesZh: readStringArray(record.primaryMusclesZh),
    secondaryMusclesZh: readStringArray(record.secondaryMusclesZh),
    imageUrl: readImageUrl(record) ?? displayFact?.imageUrl,
    reasons: readStringArray(record.goalTags).slice(0, 3),
  };
}

type ExerciseDisplayFact = {
  imageUrl?: string;
};

// Agent 模型摘要不携带展示图片；推荐卡展示字段必须从工具完整输出回填。
function buildExerciseDisplayFactMap(toolResult: AgentToolResultRecord) {
  const output = asRecord(toolResult.output);
  const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
  const byExerciseId = new Map<string, ExerciseDisplayFact>();

  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) {
      continue;
    }
    const exerciseId = typeof record?.id === "string"
      ? record.id
      : typeof record?.exerciseId === "string"
        ? record.exerciseId
        : undefined;

    if (!exerciseId) {
      continue;
    }

    byExerciseId.set(exerciseId, {
      imageUrl: readImageUrl(record),
    });
  }

  return byExerciseId;
}

function readImageUrl(record: Record<string, unknown>) {
  if (typeof record.imageUrl === "string" && record.imageUrl.trim()) {
    return record.imageUrl;
  }
  const firstImageUrl = readStringArray(record.imageUrls)[0];

  return firstImageUrl;
}

function traceTokenBudgetDecision(trace: AiTraceLogger, decision: AiTokenBudgetDecision) {
  const summaryStage = decision.stages.find((stage) => stage.stage === "agent_summary_update");
  trace.addStep({
    name: "Token 预算决策",
    type: "token_budget",
    output: {
      decision,
    },
    metadata: {
      summarySkipped: summaryStage?.status === "skipped",
      reason: summaryStage?.skipReason,
    },
  });
}

async function requestDeepSeekJson(
  apiKey: string,
  messages: DeepSeekChatMessage[],
  trace?: AiTraceLogger,
  traceMetadata: Record<string, unknown> = {},
): Promise<
  | { ok: true; value: unknown }
  | {
      ok: false;
      code: "ai_request_failed" | "empty_content" | "invalid_json";
      message: string;
      detail?: unknown;
    }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deepseekRequestTimeoutMs);

  try {
    const response = await serverRequest("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: "raw",
      throwOnError: false,
      signal: controller.signal,
      body: {
        model: "deepseek-v4-flash",
        messages,
        stream: false,
        response_format: {
          type: "json_object",
        },
        thinking: {
          type: "disabled",
        },
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek agent request failed.",
        detail: await response.text(),
      };
    }

    const rawResponseText = await response.text();
    const body = JSON.parse(rawResponseText) as DeepSeekChatResponse;
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";

    if (!content) {
      trace?.addStep({
        name: "Agent tool decision 大模型回复",
        type: "model_response",
        status: "failed",
        output: {
          content,
          rawResponse: rawResponseText,
        },
        metadata: {
          status: response.status,
          tokenUsage: body.usage,
          emptyContent: true,
          parsingFailure: {
            code: "empty_content",
            message: "DeepSeek agent request returned empty content.",
          },
          ...traceMetadata,
        },
      });
      return {
        ok: false,
        code: "empty_content",
        message: "DeepSeek agent request returned empty content.",
      };
    }

    const parsed = parseJsonObject(content);

    if (!parsed.ok) {
      trace?.addStep({
        name: "Agent tool decision 大模型回复",
        type: "model_response",
        status: "failed",
        output: {
          content,
          rawResponse: rawResponseText,
        },
        error: parsed,
        metadata: {
          status: response.status,
          tokenUsage: body.usage,
          parsingFailure: {
            code: parsed.code,
            message: parsed.message,
          },
          ...traceMetadata,
        },
      });
      return parsed;
    }

    const parsedDecision = asRecord(parsed.value);
    const parsedResult = asRecord(parsedDecision?.result);
    const usedToolResultIds = Array.isArray(parsedResult?.usedToolResultIds)
      ? parsedResult.usedToolResultIds.filter((id): id is string => typeof id === "string")
      : undefined;

    trace?.addStep({
      name: "Agent tool decision 大模型回复",
      type: "model_response",
      output: {
        content,
        rawResponse: rawResponseText,
        parsedDecision: parsed.value,
      },
      metadata: {
        status: response.status,
        tokenUsage: body.usage,
        emptyContent: false,
        ...(parsed.recovery
          ? { parseStatus: "recovered", jsonRecovery: parsed.recovery }
          : { parseStatus: "success" }),
        parsedAction: parsedDecision?.action,
        toolName: parsedDecision?.toolName,
        usedToolResultIds,
        ...traceMetadata,
      },
    });

    return {
      ok: true,
      value: parsed.value,
    };
  } catch (error) {
    return {
      ok: false,
      code: "ai_request_failed",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek agent request timed out."
          : "DeepSeek agent request failed.",
      detail: error instanceof Error ? error.message : error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJsonObject(content: string):
  ReturnType<typeof parseJsonObjectWithRecovery> {
  return parseJsonObjectWithRecovery(content, "AI returned invalid JSON.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function readRecordString(value: unknown, key: string) {
  const record = asRecord(value);
  const item = record?.[key];

  return typeof item === "string" ? item : undefined;
}

function readRecordBoolean(value: unknown, key: string) {
  const record = asRecord(value);
  const item = record?.[key];

  return typeof item === "boolean" ? item : undefined;
}

function truncatePlainText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}
