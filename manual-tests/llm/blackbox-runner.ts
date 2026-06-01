import { POST as postChat } from "@/app/api/chat/route";
import { PUT as putChatConversation } from "@/app/api/chat/conversations/[id]/route";
import type { ChatStreamEvent } from "@/features/chat/types";
import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import {
  localAnonymousAuthCookieName,
  signLocalAnonymousToken,
} from "@/lib/server/auth/local-anonymous-auth";
import {
  getArtifactPayloadForCurrentUser,
  listRecentArtifactSummariesForCurrentUser,
  type RecentArtifactSummary,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import { listAiTraces } from "@/lib/server/dev/ai-trace-store";
import type { CurrentUser } from "@/lib/server/users/current-user";
import {
  buildFitnessConversationContext,
  initializeConversationSummary,
  type AiContextChatMessage,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type { ConversationArtifactKind } from "@/lib/shared/conversation-artifacts/schema";
import type { AgentExecutionResult } from "@/lib/server/agent-orchestrator";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
import { workoutPlanIntentSchema, type WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";
import type { AssistantAction } from "@/lib/server/chat/chat-service";
import type { BlackboxCardType } from "./flow-fixtures";

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ManualAuthSession = {
  cookieHeader: string;
  user: CurrentUser;
};

export type BlackboxRunnerMode = "api_route";

export type BlackboxPreflightStatus = "ready" | "skipped" | "failed";

export type BlackboxPreflightResult = {
  status: BlackboxPreflightStatus;
  modelAvailable: boolean;
  databaseAvailable: boolean;
  artifactTablesAvailable: boolean;
  seedDataAvailable: boolean;
  checkedAt: string;
  reason?: string;
  detail?: string;
};

export type BlackboxRunnerErrorCode =
  | "missing_configuration"
  | "preflight_failed"
  | "request_failed"
  | "stream_parse_failed"
  | "stream_error"
  | "conversation_save_failed"
  | "empty_reply";

export type BlackboxRunnerError = {
  code: BlackboxRunnerErrorCode;
  message: string;
  detail?: string;
  responseStatus?: number;
  rawChunk?: string;
};

export type BlackboxArtifactDiagnostics = {
  recentSummaryCount: number;
  producedArtifact: boolean;
  artifactKind?: ConversationArtifactKind;
  artifactId?: string;
  sourceMessageId?: string;
  payloadReadable: boolean;
  payloadReadStatus: "not_applicable" | "readable" | "missing" | "invalid";
  referenceResolutionStatus?: "resolved" | "unresolved" | "not_applicable";
  referenceResolutionSummary?: string;
};

export type BlackboxAgentDiagnostics = {
  executionResultPresent: boolean;
  status?: AgentExecutionResult["status"];
  toolNames: string[];
  toolResultIds: string[];
  candidateSetIds: string[];
  validationIds: string[];
  policyDecisionIds: string[];
  revisionIds: string[];
  dependencyGraphPresent: boolean;
  legacyPathSkip: {
    intentFirst?: boolean;
    normalize?: boolean;
    summaryOnlyContext?: boolean;
    referenceResolverFirst?: boolean;
  };
  legacyEventsEmitted?: boolean;
};

export type BlackboxTurnResult = {
  conversationId: string;
  responseMessageId: string;
  assistantText: string;
  actionTypes: BlackboxCardType[];
  assistantActions: AssistantAction[];
  traceId?: string;
  conversationSummary: string;
  usage: DeepSeekUsage;
  artifactDiagnostics: BlackboxArtifactDiagnostics;
  agentDiagnostics: BlackboxAgentDiagnostics;
  error?: BlackboxRunnerError;
};

export type BlackboxConversationState = {
  conversationId: string;
  messages: ChatMessage[];
  conversationSummary: string;
  conversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
  authSession?: ManualAuthSession;
};

type ConsumedChatStream = {
  assistantText: string;
  actions: AssistantAction[];
  actionTypes: BlackboxCardType[];
  referenceDiagnostics: NonNullable<ChatStreamEvent["referenceDiagnostic"]>[];
  traceId?: string;
  conversationSummary?: string;
  agentExecutionResult?: AgentExecutionResult;
  dependencyGraph?: unknown;
  legacyPathSkip?: BlackboxAgentDiagnostics["legacyPathSkip"];
  legacyEventsEmitted?: boolean;
  artifacts: Array<{
    kind: ConversationArtifactKind;
    payload: unknown;
    intent?: unknown;
    sourceArtifactId?: string;
  }>;
  error?: BlackboxRunnerError;
};

// 详细黑盒 runner 使用可识别的测试会话 id，方便从报告回查本地数据库记录。
export function createBlackboxConversationState(flowId: string): BlackboxConversationState {
  const now = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);

  return {
    conversationId: `manual-llm-${flowId}-${now}-${suffix}`,
    messages: [],
    conversationSummary: "",
    conversationContext: buildFitnessConversationContext([]),
    recentArtifactSummaries: [],
  };
}

// preflight 把真实模型缺失、数据库不可用和 schema/seed 缺失分开，避免报告误判为模型回归。
export async function runBlackboxPreflight(input: {
  apiKey: string | undefined;
}): Promise<BlackboxPreflightResult> {
  const checkedAt = new Date().toISOString();

  if (!input.apiKey?.trim()) {
    return {
      status: "skipped",
      modelAvailable: false,
      databaseAvailable: false,
      artifactTablesAvailable: false,
      seedDataAvailable: false,
      checkedAt,
      reason: "缺少 DEEPSEEK_API_KEY，真实模型黑盒流程未运行。",
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: "failed",
      modelAvailable: true,
      databaseAvailable: false,
      artifactTablesAvailable: false,
      seedDataAvailable: false,
      checkedAt,
      reason: "缺少 DATABASE_URL，无法执行真实会话保存和 artifact 诊断。",
    };
  }

  try {
    const prisma = getPrismaClient();
    await createManualLlmAuthSession();
    const [artifactCount, artifactIndexCount, exerciseCount] = await Promise.all([
      prisma.conversationArtifact.count(),
      prisma.artifactIndex.count(),
      prisma.exercise.count(),
    ]);

    return {
      status: exerciseCount > 0 ? "ready" : "failed",
      modelAvailable: true,
      databaseAvailable: true,
      artifactTablesAvailable: artifactCount >= 0 && artifactIndexCount >= 0,
      seedDataAvailable: exerciseCount > 0,
      checkedAt,
      reason: exerciseCount > 0 ? undefined : "基础动作 seed 数据不可用，无法执行真实候选和训练卡片链路。",
    };
  } catch (error) {
    return {
      status: "failed",
      modelAvailable: true,
      databaseAvailable: false,
      artifactTablesAvailable: false,
      seedDataAvailable: false,
      checkedAt,
      reason: "数据库、migration 或 artifact 表 preflight 失败。",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

// 单轮执行通过 /api/chat Route Handler 和会话保存 Route Handler，覆盖鉴权、stream、保存和 artifact 写入边界。
export async function runBlackboxChatTurn(input: {
  apiKey: string | undefined;
  state: BlackboxConversationState;
  userInput: string;
}): Promise<BlackboxTurnResult> {
  const responseMessageId = createManualId("assistant");

  if (!input.apiKey?.trim()) {
    return createFailedResult(input.state, responseMessageId, {
      code: "missing_configuration",
      message: "Missing DEEPSEEK_API_KEY.",
    });
  }

  const userMessage = createMessage("user", input.userInput);
  const assistantMessage = createMessage("assistant", "");

  try {
    input.state.authSession ??= await createManualLlmAuthSession();
  } catch (error) {
    return createFailedResult(input.state, responseMessageId, {
      code: "preflight_failed",
      message: "Failed to create manual LLM current user.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const chatRequest = new Request("http://manual.local/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: input.state.authSession.cookieHeader,
    },
    body: JSON.stringify({
      conversationId: input.state.conversationId,
      responseMessageId,
      latestUserMessage: input.userInput,
      conversationSummary: input.state.conversationSummary,
      thinkingEnabled: false,
      emitLegacyEvents: process.env.MANUAL_LLM_DISABLE_LEGACY_EVENTS === "1" ? false : undefined,
    }),
  });

  let response: Response;

  try {
    response = await postChat(chatRequest);
  } catch (error) {
    return createFailedResult(input.state, responseMessageId, {
      code: "request_failed",
      message: "Chat route threw before stream response.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok || !response.body) {
    return createFailedResult(input.state, responseMessageId, {
      code: "request_failed",
      message: "Chat request failed.",
      responseStatus: response.status,
      detail: await response.text().catch(() => ""),
    });
  }

  const streamResult = await consumeChatStream(response);
  const result: BlackboxTurnResult = {
    conversationId: input.state.conversationId,
    responseMessageId,
    assistantText: streamResult.assistantText,
    actionTypes: uniqueActionTypes([
      ...deriveCardTypesFromAgentExecutionResult(streamResult.agentExecutionResult),
      ...deriveCardTypesFromArtifacts(streamResult.artifacts),
      ...streamResult.actions.map((action) => mapLegacyAssistantActionToCardType(action.action)),
      ...streamResult.actionTypes,
    ].filter((actionType): actionType is BlackboxCardType => Boolean(actionType))),
    assistantActions: streamResult.actions,
    traceId: streamResult.traceId,
    conversationSummary: streamResult.conversationSummary ?? input.state.conversationSummary,
    usage: summarizeTraceUsage(streamResult.traceId),
    artifactDiagnostics: createEmptyArtifactDiagnostics(streamResult.actions),
    agentDiagnostics: createAgentDiagnostics(streamResult),
    error: streamResult.error,
  };

  if (!result.error && result.assistantText.trim().length === 0) {
    result.error = {
      code: "empty_reply",
      message: "Assistant visible reply is empty.",
    };
  }

  if (result.error) {
    return result;
  }

  assistantMessage.id = responseMessageId;
  assistantMessage.content = result.assistantText;
  applyStreamArtifactsToState(input.state, responseMessageId, streamResult);
  applyMessagesToState(input.state, userMessage, assistantMessage, result);

  const saveError = await saveConversationState(input.state);
  if (saveError) {
    result.error = saveError;
    return result;
  }

  result.artifactDiagnostics = await collectArtifactDiagnostics({
    state: input.state,
    actions: streamResult.actions,
    referenceDiagnostics: streamResult.referenceDiagnostics,
    producedArtifacts: streamResult.artifacts,
    responseMessageId,
  });

  return result;
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: createManualId(role),
    role,
    content,
    createdAt: toUtcISOString(new Date()),
  };
}

async function createManualLlmAuthSession(): Promise<ManualAuthSession> {
  const prisma = getPrismaClient();
  const providerAccountId = `manual-llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const signedToken = signLocalAnonymousToken(providerAccountId);
  const user = await prisma.user.create({
    data: {
      displayName: "manual-llm-test-user",
      identities: {
        create: {
          provider: "anonymous",
          providerAccountId,
        },
      },
    },
    select: { id: true, displayName: true },
  });

  return {
    cookieHeader: `${localAnonymousAuthCookieName}=${encodeURIComponent(signedToken.token)}`,
    user,
  };
}

function createFailedResult(
  state: BlackboxConversationState,
  responseMessageId: string,
  error: BlackboxRunnerError,
): BlackboxTurnResult {
  return {
    conversationId: state.conversationId,
    responseMessageId,
    assistantText: "",
    actionTypes: [],
    assistantActions: [],
    conversationSummary: state.conversationSummary,
    usage: {},
    artifactDiagnostics: createEmptyArtifactDiagnostics([]),
    agentDiagnostics: createEmptyAgentDiagnostics(),
    error,
  };
}

function createEmptyAgentDiagnostics(): BlackboxAgentDiagnostics {
  return {
    executionResultPresent: false,
    toolNames: [],
    toolResultIds: [],
    candidateSetIds: [],
    validationIds: [],
    policyDecisionIds: [],
    revisionIds: [],
    dependencyGraphPresent: false,
    legacyPathSkip: {},
  };
}

async function consumeChatStream(response: Response): Promise<ConsumedChatStream> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const actions: AssistantAction[] = [];
  const actionTypes: BlackboxCardType[] = [];
  const referenceDiagnostics: ConsumedChatStream["referenceDiagnostics"] = [];
  const artifacts: ConsumedChatStream["artifacts"] = [];
  let buffer = "";
  let assistantText = "";
  let traceId: string | undefined;
  let conversationSummary: string | undefined;
  let agentExecutionResult: AgentExecutionResult | undefined;
  let dependencyGraph: unknown;
  let legacyPathSkip: BlackboxAgentDiagnostics["legacyPathSkip"] | undefined;
  let legacyEventsEmitted: boolean | undefined;

  if (!reader) {
    return {
      assistantText,
      actions,
      actionTypes,
      referenceDiagnostics,
      artifacts,
      error: {
        code: "request_failed",
        message: "Chat response body is missing.",
      },
    };
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
          continue;
        }

        let streamEvent: ChatStreamEvent;

        try {
          streamEvent = JSON.parse(line) as ChatStreamEvent;
        } catch (error) {
          return {
            assistantText,
            actions,
            actionTypes,
            referenceDiagnostics,
            artifacts,
            agentExecutionResult,
            dependencyGraph,
            legacyPathSkip,
            legacyEventsEmitted,
            traceId,
            conversationSummary,
            error: {
              code: "stream_parse_failed",
              message: "Failed to parse chat stream event.",
              detail: error instanceof Error ? error.message : String(error),
              rawChunk: line,
            },
          };
        }

        if (streamEvent.type === "content") {
          assistantText += streamEvent.delta ?? "";
          continue;
        }

        if (streamEvent.type === "agent_execution_result") {
          agentExecutionResult = parseAgentExecutionResult(streamEvent.agentExecutionResult) ?? agentExecutionResult;
          dependencyGraph = streamEvent.dependencyGraph ?? dependencyGraph;
          legacyPathSkip = normalizeLegacyPathSkip(streamEvent.legacyPathSkip) ?? legacyPathSkip;
          continue;
        }

        if (streamEvent.type === "assistant_action" && streamEvent.action && streamEvent.action !== "none") {
          const parsedIntent = workoutPlanIntentSchema.safeParse(streamEvent.intent);
          if (parsedIntent.success) {
            actions.push({
              action: streamEvent.action as AssistantAction["action"],
              intent: parsedIntent.data,
              resolvedIntent: streamEvent.resolvedIntent,
              referenceResolution: streamEvent.referenceResolution,
            });
          }
          continue;
        }

        if (streamEvent.type === "reference_diagnostic" && streamEvent.referenceDiagnostic) {
          referenceDiagnostics.push(streamEvent.referenceDiagnostic);
          continue;
        }

        if (
          (streamEvent.type === "artifact" ||
            streamEvent.type === "artifact_validated" ||
            streamEvent.type === "workout_patch") &&
          streamEvent.artifactKind &&
          streamEvent.payload
        ) {
          artifacts.push({
            kind: normalizeArtifactKind(streamEvent.artifactKind),
            payload: streamEvent.payload,
            intent: streamEvent.intent,
            sourceArtifactId: streamEvent.sourceArtifactId,
          });
          if (streamEvent.type === "workout_patch") {
            actionTypes.push("workout_patch");
          }
          continue;
        }

        if (streamEvent.type === "done") {
          traceId = streamEvent.traceId;
          conversationSummary = streamEvent.conversationSummary;
          agentExecutionResult = parseAgentExecutionResult(streamEvent.agentExecutionResult) ?? agentExecutionResult;
          dependencyGraph = streamEvent.dependencyGraph ?? dependencyGraph;
          legacyPathSkip = normalizeLegacyPathSkip(streamEvent.legacyPathSkip) ?? legacyPathSkip;
          legacyEventsEmitted = streamEvent.legacyEventsEmitted;
          if (streamEvent.referenceDiagnostic) {
            referenceDiagnostics.push(streamEvent.referenceDiagnostic);
          }
          continue;
        }

        if (streamEvent.type === "error") {
          return {
            assistantText,
            actions,
            actionTypes,
            referenceDiagnostics,
            artifacts,
            traceId,
            conversationSummary,
            error: {
              code: "stream_error",
              message: streamEvent.delta || "Chat stream returned an error event.",
            },
          };
        }
      }
    }
  } catch (error) {
    return {
      assistantText,
      actions,
      actionTypes,
      referenceDiagnostics,
      artifacts,
      agentExecutionResult,
      dependencyGraph,
      legacyPathSkip,
      legacyEventsEmitted,
      traceId,
      conversationSummary,
      error: {
        code: "stream_error",
        message: error instanceof Error ? error.message : "Failed to read chat stream.",
      },
    };
  }

  return {
    assistantText,
    actions,
    actionTypes,
    referenceDiagnostics,
    artifacts,
    agentExecutionResult,
    dependencyGraph,
    legacyPathSkip,
    legacyEventsEmitted,
    traceId,
    conversationSummary,
  };
}

function uniqueActionTypes(actionTypes: BlackboxCardType[]) {
  return [...new Set(actionTypes)];
}

function parseAgentExecutionResult(value: unknown): AgentExecutionResult | undefined {
  if (!value || typeof value !== "object" || !("status" in value)) {
    return undefined;
  }

  return value as AgentExecutionResult;
}

function normalizeLegacyPathSkip(value: unknown): BlackboxAgentDiagnostics["legacyPathSkip"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return {
    intentFirst: record.intentFirst === true,
    normalize: record.normalize === true,
    summaryOnlyContext: record.summaryOnlyContext === true,
    referenceResolverFirst: record.referenceResolverFirst === true,
  };
}

function deriveCardTypesFromAgentExecutionResult(result: AgentExecutionResult | undefined): BlackboxCardType[] {
  if (!result) {
    return [];
  }

  if (result.status === "generated") {
    if (result.artifact.kind === "routine") return ["workout_routine"];
    if (result.artifact.kind === "plan") return ["workout_plan"];
    return ["exercise_recommendation"];
  }

  if (result.status === "patched") return ["workout_patch"];
  if (result.status === "needs_clarification") return ["clarification"];
  if (result.status === "answered") return ["answer"];
  if (result.status === "completed_operation") return ["completed_operation"];
  if (result.status === "blocked") return ["blocked"];
  return ["failed"];
}

function deriveCardTypesFromArtifacts(artifacts: ConsumedChatStream["artifacts"]): BlackboxCardType[] {
  return artifacts.map((artifact) => {
    if (artifact.sourceArtifactId) return "workout_patch";
    if (artifact.kind === "routine") return "workout_routine";
    if (artifact.kind === "plan") return "workout_plan";
    return "exercise_recommendation";
  });
}

function mapLegacyAssistantActionToCardType(action: AssistantAction["action"]): BlackboxCardType | undefined {
  if (action === "exercise_recommendation" || action === "workout_routine" || action === "workout_plan") {
    return action;
  }

  if (action === "workout_patch" || action === "exercise_replacement") {
    return "workout_patch";
  }

  if (action === "exercise_explanation") {
    return "answer";
  }

  return undefined;
}

function createAgentDiagnostics(streamResult: ConsumedChatStream): BlackboxAgentDiagnostics {
  const toolResultIds = collectToolResultIds(streamResult.agentExecutionResult);
  const graph = typeof streamResult.dependencyGraph === "object" && streamResult.dependencyGraph !== null
    ? streamResult.dependencyGraph as { nodes?: Array<{ id?: unknown; kind?: unknown; label?: unknown }> }
    : undefined;
  const nodes = graph?.nodes ?? [];

  return {
    executionResultPresent: Boolean(streamResult.agentExecutionResult),
    status: streamResult.agentExecutionResult?.status,
    toolNames: uniqueStrings(nodes
      .filter((node) => node.kind === "tool_call" || node.kind === "tool_result")
      .map((node) => typeof node.label === "string" ? node.label : undefined)
      .filter((value): value is string => Boolean(value))),
    toolResultIds,
    candidateSetIds: collectGraphIds(nodes, "candidate_set"),
    validationIds: collectGraphIds(nodes, "validation"),
    policyDecisionIds: collectGraphIds(nodes, "policy_decision"),
    revisionIds: collectRevisionIds(streamResult.agentExecutionResult),
    dependencyGraphPresent: Boolean(streamResult.dependencyGraph),
    legacyPathSkip: streamResult.legacyPathSkip ?? {},
    legacyEventsEmitted: streamResult.legacyEventsEmitted,
  };
}

function collectToolResultIds(result: AgentExecutionResult | undefined) {
  return result && "usedToolResultIds" in result ? result.usedToolResultIds : [];
}

function collectRevisionIds(result: AgentExecutionResult | undefined) {
  if (!result) return [];
  if (result.status === "generated" || result.status === "patched") return [result.revisionId];
  return [];
}

function collectGraphIds(nodes: Array<{ id?: unknown; kind?: unknown }>, kind: string) {
  return uniqueStrings(nodes
    .filter((node) => node.kind === kind)
    .map((node) => typeof node.id === "string" ? node.id : undefined)
    .filter((value): value is string => Boolean(value)));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeArtifactKind(kind: NonNullable<ChatStreamEvent["artifactKind"]>): ConversationArtifactKind {
  return kind === "routine" ? "routine" : kind === "plan" ? "plan" : "exercise_recommendation";
}

function applyStreamArtifactsToState(
  state: BlackboxConversationState,
  responseMessageId: string,
  streamResult: ConsumedChatStream,
) {
  const conversation = state as BlackboxConversationState & {
    plans?: NonNullable<ChatConversation["plans"]>;
    routines?: NonNullable<ChatConversation["routines"]>;
    exerciseRecommendations?: NonNullable<ChatConversation["exerciseRecommendations"]>;
    recommendationIntents?: NonNullable<ChatConversation["recommendationIntents"]>;
  };

  for (const artifact of streamResult.artifacts) {
    if (artifact.kind === "exercise_recommendation") {
      conversation.exerciseRecommendations ??= {};
      conversation.exerciseRecommendations[responseMessageId] =
        artifact.payload as NonNullable<ChatConversation["exerciseRecommendations"]>[string];
    }

    if (artifact.kind === "routine") {
      conversation.routines ??= {};
      conversation.routines[responseMessageId] = artifact.payload as NonNullable<ChatConversation["routines"]>[string];
    }

    if (artifact.kind === "plan") {
      conversation.plans ??= {};
      conversation.plans[responseMessageId] = artifact.payload as NonNullable<ChatConversation["plans"]>[string];
    }
  }

  const latestIntent = streamResult.artifacts.map((artifact) => artifact.intent).find(Boolean)
    ?? streamResult.actions.at(-1)?.intent;
  const parsedIntent = workoutPlanIntentSchema.safeParse(latestIntent);

  if (parsedIntent.success) {
    conversation.recommendationIntents ??= {};
    conversation.recommendationIntents[responseMessageId] = parsedIntent.data;
  }
}

function applyMessagesToState(
  state: BlackboxConversationState,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage,
  result: BlackboxTurnResult,
) {
  state.messages = [...state.messages, userMessage, assistantMessage];
  state.conversationSummary = result.conversationSummary;
  state.conversationContext = mergeLatestActionIntoContext(
    buildFitnessConversationContext(state.messages),
    result.assistantActions.at(-1),
  );
}

function mergeLatestActionIntoContext(
  context: FitnessConversationContext,
  action: AssistantAction | undefined,
): FitnessConversationContext {
  const parsedIntent = workoutPlanIntentSchema.safeParse(action?.intent);

  if (!parsedIntent.success) {
    return context;
  }

  return {
    ...context,
    currentIntent: parsedIntent.data,
    knownFacts: {
      ...context.knownFacts,
      goal: parsedIntent.data.goal,
      experience: parsedIntent.data.experience,
      sessionMinutes: parsedIntent.data.sessionMinutes,
      weeklyFrequency: parsedIntent.data.weeklyFrequency,
      calendarHorizonDays: parsedIntent.data.calendarHorizonDays,
      equipment: parsedIntent.data.equipment,
      injuryLimitations: parsedIntent.data.injuryLimitations,
      preferences: parsedIntent.data.preferences,
      avoidances: parsedIntent.data.avoidances,
    },
  };
}

async function saveConversationState(state: BlackboxConversationState): Promise<BlackboxRunnerError | undefined> {
  if (!state.authSession) {
    return {
      code: "conversation_save_failed",
      message: "Manual auth session is missing before conversation save.",
    };
  }

  const conversation = state as BlackboxConversationState & {
    plans?: ChatConversation["plans"];
    routines?: ChatConversation["routines"];
    exerciseRecommendations?: ChatConversation["exerciseRecommendations"];
    recommendationIntents?: ChatConversation["recommendationIntents"];
  };
  const payload: ChatConversation = {
    id: state.conversationId,
    title: createConversationTitle(state.messages),
    updatedAt: toUtcISOString(new Date()),
    messages: state.messages,
    plans: conversation.plans,
    routines: conversation.routines,
    exerciseRecommendations: conversation.exerciseRecommendations,
    recommendationIntents: conversation.recommendationIntents,
    conversationSummary: initializeConversationSummary(
      state.messages.map(({ role, content }) => ({ role, content }) satisfies AiContextChatMessage),
      { summary: state.conversationSummary },
    ),
    conversationContext: state.conversationContext,
  };
  const request = new Request(`http://manual.local/api/chat/conversations/${encodeURIComponent(state.conversationId)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: state.authSession.cookieHeader,
    },
    body: JSON.stringify(payload),
  });

  try {
    const response = await putChatConversation(request, {
      params: Promise.resolve({ id: encodeURIComponent(state.conversationId) }),
    });

    if (!response.ok) {
      return {
        code: "conversation_save_failed",
        message: "Conversation save route failed.",
        responseStatus: response.status,
        detail: await response.text().catch(() => ""),
      };
    }
  } catch (error) {
    return {
      code: "conversation_save_failed",
      message: "Conversation save route threw.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectArtifactDiagnostics(input: {
  state: BlackboxConversationState;
  actions: AssistantAction[];
  referenceDiagnostics: ConsumedChatStream["referenceDiagnostics"];
  producedArtifacts: ConsumedChatStream["artifacts"];
  responseMessageId: string;
}): Promise<BlackboxArtifactDiagnostics> {
  const latestAction = input.actions.at(-1);
  const referenceDiagnostic = input.referenceDiagnostics.at(-1);
  const patchSourceArtifact = input.producedArtifacts.find((artifact) => artifact.sourceArtifactId);
  const referenceResolutionStatus = referenceDiagnostic?.referenceResolutionStatus ?? (latestAction?.referenceResolution
    ? "resolved"
    : patchSourceArtifact
      ? "resolved"
      : latestAction
      ? "not_applicable"
      : "not_applicable");
  const empty = createEmptyArtifactDiagnostics(input.actions);

  if (!input.state.authSession) {
    return empty;
  }

  const summaries = await listRecentArtifactSummariesForCurrentUser(
    input.state.conversationId,
    8,
    input.state.authSession.user,
  );
  input.state.recentArtifactSummaries = summaries;

  const producedKind = input.producedArtifacts.at(-1)?.kind;
  const summary =
    summaries.find((item) => item.updatedAt && item.artifactId && producedKind && item.kind === producedKind) ??
    summaries[0];

  if (!summary) {
    return {
      ...empty,
      recentSummaryCount: summaries.length,
      producedArtifact: input.producedArtifacts.length > 0,
      artifactKind: referenceDiagnostic?.artifactKind ?? producedKind,
      artifactId: referenceDiagnostic?.artifactId ?? patchSourceArtifact?.sourceArtifactId,
      payloadReadable: referenceDiagnostic?.payloadReadStatus === "readable",
      payloadReadStatus: referenceDiagnostic?.payloadReadStatus ??
        (input.producedArtifacts.length > 0 ? "missing" : "not_applicable"),
      referenceResolutionStatus,
      referenceResolutionSummary: summarizeReferenceResolution(latestAction, referenceDiagnostic, patchSourceArtifact?.sourceArtifactId),
    };
  }

  const artifactId = referenceDiagnostic?.artifactId ?? summary.artifactId;
  const payloadReadStatus = referenceDiagnostic?.payloadReadStatus ?? await getArtifactPayloadReadStatus(
    artifactId,
    input.state.authSession.user,
  );

  return {
    recentSummaryCount: summaries.length,
    producedArtifact: input.producedArtifacts.length > 0,
    artifactKind: referenceDiagnostic?.artifactKind ?? summary.kind,
    artifactId,
    sourceMessageId: input.responseMessageId,
    payloadReadable: payloadReadStatus === "readable",
    payloadReadStatus,
    referenceResolutionStatus,
    referenceResolutionSummary: summarizeReferenceResolution(latestAction, referenceDiagnostic, patchSourceArtifact?.sourceArtifactId),
  };
}

async function getArtifactPayloadReadStatus(
  artifactId: string,
  currentUser: CurrentUser,
): Promise<BlackboxArtifactDiagnostics["payloadReadStatus"]> {
  const payloadResult = await getArtifactPayloadForCurrentUser(
    { artifactId },
    undefined,
    currentUser,
  );

  return payloadResult.ok ? "readable" : payloadResult.code === "invalid_payload" ? "invalid" : "missing";
}

function createEmptyArtifactDiagnostics(actions: AssistantAction[]): BlackboxArtifactDiagnostics {
  return {
    recentSummaryCount: 0,
    producedArtifact: false,
    payloadReadable: false,
    payloadReadStatus: "not_applicable",
    referenceResolutionStatus: actions.at(-1)?.referenceResolution ? "resolved" : "not_applicable",
    referenceResolutionSummary: summarizeReferenceResolution(actions.at(-1)),
  };
}

function summarizeReferenceResolution(
  action: AssistantAction | undefined,
  diagnostic?: NonNullable<ChatStreamEvent["referenceDiagnostic"]>,
  patchSourceArtifactId?: string,
) {
  if (diagnostic) {
    return [
      diagnostic.artifactId ? `artifactId=${diagnostic.artifactId}` : undefined,
      diagnostic.artifactKind ? `kind=${diagnostic.artifactKind}` : undefined,
      `payload=${diagnostic.payloadReadStatus}`,
      diagnostic.exerciseId ? `exerciseId=${diagnostic.exerciseId}` : undefined,
      diagnostic.reason ? `reason=${diagnostic.reason}` : undefined,
    ].filter(Boolean).join(" ");
  }

  const resolution = action?.referenceResolution;

  if (!resolution) {
    return patchSourceArtifactId ? `sourceArtifactId=${patchSourceArtifactId}` : undefined;
  }

  return [
    `artifactId=${resolution.artifactId}`,
    `kind=${resolution.artifactKind}`,
  ].filter(Boolean).join(" ");
}

function summarizeTraceUsage(traceId: string | undefined): DeepSeekUsage {
  if (!traceId) {
    return {};
  }

  const trace = listAiTraces().find((item) => item.id === traceId);

  if (!trace) {
    return {};
  }

  return trace.steps.reduce(
    (summary, step) => {
      const usage = readTokenUsage(step.metadata?.tokenUsage);

      return {
        prompt_tokens: summary.prompt_tokens + usage.prompt_tokens,
        completion_tokens: summary.completion_tokens + usage.completion_tokens,
        total_tokens: summary.total_tokens + usage.total_tokens,
      };
    },
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  );
}

function readTokenUsage(value: unknown): Required<DeepSeekUsage> {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

  return {
    prompt_tokens: typeof record.prompt_tokens === "number" ? record.prompt_tokens : 0,
    completion_tokens: typeof record.completion_tokens === "number" ? record.completion_tokens : 0,
    total_tokens: typeof record.total_tokens === "number" ? record.total_tokens : 0,
  };
}

function createConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "手动 LLM 测试";

  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

function createManualId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
