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
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
import { workoutPlanIntentSchema, type WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";
import type { AssistantAction } from "@/lib/server/chat/chat-service";

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

export type BlackboxTurnResult = {
  conversationId: string;
  responseMessageId: string;
  assistantText: string;
  actionTypes: AssistantAction["action"][];
  assistantActions: AssistantAction[];
  traceId?: string;
  conversationSummary: string;
  usage: DeepSeekUsage;
  artifactDiagnostics: BlackboxArtifactDiagnostics;
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
  traceId?: string;
  conversationSummary?: string;
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
    actionTypes: streamResult.actions.map((action) => action.action),
    assistantActions: streamResult.actions,
    traceId: streamResult.traceId,
    conversationSummary: streamResult.conversationSummary ?? input.state.conversationSummary,
    usage: summarizeTraceUsage(streamResult.traceId),
    artifactDiagnostics: createEmptyArtifactDiagnostics(streamResult.actions),
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
    error,
  };
}

async function consumeChatStream(response: Response): Promise<ConsumedChatStream> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const actions: AssistantAction[] = [];
  const artifacts: ConsumedChatStream["artifacts"] = [];
  let buffer = "";
  let assistantText = "";
  let traceId: string | undefined;
  let conversationSummary: string | undefined;

  if (!reader) {
    return {
      assistantText,
      actions,
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
            artifacts,
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
          continue;
        }

        if (streamEvent.type === "done") {
          traceId = streamEvent.traceId;
          conversationSummary = streamEvent.conversationSummary;
          continue;
        }

        if (streamEvent.type === "error") {
          return {
            assistantText,
            actions,
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
      artifacts,
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
    artifacts,
    traceId,
    conversationSummary,
  };
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
  producedArtifacts: ConsumedChatStream["artifacts"];
  responseMessageId: string;
}): Promise<BlackboxArtifactDiagnostics> {
  const latestAction = input.actions.at(-1);
  const referenceResolutionStatus = latestAction?.referenceResolution
    ? "resolved"
    : latestAction
      ? "not_applicable"
      : "not_applicable";
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
      artifactKind: producedKind,
      payloadReadStatus: input.producedArtifacts.length > 0 ? "missing" : "not_applicable",
      referenceResolutionStatus,
      referenceResolutionSummary: summarizeReferenceResolution(latestAction),
    };
  }

  const payloadResult = await getArtifactPayloadForCurrentUser(
    { artifactId: summary.artifactId },
    undefined,
    input.state.authSession.user,
  );

  return {
    recentSummaryCount: summaries.length,
    producedArtifact: input.producedArtifacts.length > 0,
    artifactKind: summary.kind,
    artifactId: summary.artifactId,
    sourceMessageId: input.responseMessageId,
    payloadReadable: payloadResult.ok,
    payloadReadStatus: payloadResult.ok ? "readable" : payloadResult.code === "invalid_payload" ? "invalid" : "missing",
    referenceResolutionStatus,
    referenceResolutionSummary: summarizeReferenceResolution(latestAction),
  };
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

function summarizeReferenceResolution(action: AssistantAction | undefined) {
  const resolution = action?.referenceResolution;

  if (!resolution) {
    return undefined;
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
