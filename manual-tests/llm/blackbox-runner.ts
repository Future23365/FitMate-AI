import { createAiChatResponse, prepareAiChatRequest, type AssistantAction } from "@/lib/server/chat/chat-service";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import type { AiRunFinalDecision, AiTrace, AiTraceStatus, AiTraceStepType } from "@/lib/server/dev/ai-trace-store";
import type { RecentArtifactSummary } from "@/lib/server/conversation-artifacts/artifact-service";
import {
  buildFitnessConversationContext,
  type AiContextChatMessage,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import { workoutPlanIntentSchema, type WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";
import type { ChatStreamEvent } from "@/features/chat/types";

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type BlackboxRunnerErrorCode =
  | "missing_configuration"
  | "request_failed"
  | "stream_parse_failed"
  | "stream_error"
  | "empty_reply";

export type BlackboxRunnerError = {
  code: BlackboxRunnerErrorCode;
  message: string;
  detail?: string;
  responseStatus?: number;
  rawChunk?: string;
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
  error?: BlackboxRunnerError;
};

export type BlackboxConversationState = {
  conversationId: string;
  messages: AiContextChatMessage[];
  conversationSummary: string;
  conversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
};

type ManualTraceStep = {
  name: string;
  type: AiTraceStepType;
  status?: AiTraceStatus;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

// 黑盒执行器维护与聊天页一致的会话状态，避免测试绕回内部 prompt 分支。
export function createBlackboxConversationState(flowId: string): BlackboxConversationState {
  return {
    conversationId: `manual-llm-${flowId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    messages: [],
    conversationSummary: "",
    conversationContext: buildFitnessConversationContext([]),
    recentArtifactSummaries: [],
  };
}

// 单轮执行复用服务端聊天编排并消费 NDJSON stream，输出用户可见文本与卡片动作摘要。
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

  const requestMessages = [
    ...input.state.messages,
    { role: "user" as const, content: input.userInput },
  ];
  const preparedRequest = prepareAiChatRequest({
    conversationId: input.state.conversationId,
    responseMessageId,
    latestUserMessage: input.userInput,
    conversationSummary: input.state.conversationSummary,
    messages: requestMessages,
    conversationContext: input.state.conversationContext,
    thinkingEnabled: false,
  });
  preparedRequest.recentArtifactSummaries = input.state.recentArtifactSummaries;
  const trace = createManualTrace(input.state.conversationId, responseMessageId);
  let response: Response;

  try {
    response = await createAiChatResponse({
      apiKey: input.apiKey,
      request: preparedRequest,
      trace,
      currentUser: { id: "manual-llm-user", displayName: "手动测试用户" },
    });
  } catch (error) {
    return createFailedResult(input.state, responseMessageId, {
      code: "request_failed",
      message: "Chat orchestration threw before stream response.",
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
  const usage = summarizeTraceUsage(trace.steps);
  const result: BlackboxTurnResult = {
    conversationId: input.state.conversationId,
    responseMessageId,
    assistantText: streamResult.assistantText,
    actionTypes: streamResult.actions.map((action) => action.action),
    assistantActions: streamResult.actions,
    traceId: streamResult.traceId ?? trace.id,
    conversationSummary: streamResult.conversationSummary ?? input.state.conversationSummary,
    usage,
    error: streamResult.error,
  };

  if (!result.error && result.assistantText.trim().length === 0) {
    result.error = {
      code: "empty_reply",
      message: "Assistant visible reply is empty.",
    };
  }

  applyTurnToState(input.state, {
    userInput: input.userInput,
    result,
  });

  return result;
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
    error,
  };
}

async function consumeChatStream(response: Response) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const actions: AssistantAction[] = [];
  let buffer = "";
  let assistantText = "";
  let traceId: string | undefined;
  let conversationSummary: string | undefined;

  if (!reader) {
    return {
      assistantText,
      actions,
      error: {
        code: "request_failed" as const,
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
            traceId,
            conversationSummary,
            error: {
              code: "stream_parse_failed" as const,
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
          actions.push({
            action: streamEvent.action,
            intent: streamEvent.intent as WorkoutPlanIntent,
            referenceResolution: streamEvent.referenceResolution,
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
            traceId,
            conversationSummary,
            error: {
              code: "stream_error" as const,
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
      traceId,
      conversationSummary,
      error: {
        code: "stream_error" as const,
        message: error instanceof Error ? error.message : "Failed to read chat stream.",
      },
    };
  }

  return {
    assistantText,
    actions,
    traceId,
    conversationSummary,
  };
}

function applyTurnToState(
  state: BlackboxConversationState,
  input: {
    userInput: string;
    result: BlackboxTurnResult;
  },
) {
  if (input.result.error) {
    return;
  }

  state.messages = [
    ...state.messages,
    { role: "user", content: input.userInput },
    { role: "assistant", content: input.result.assistantText },
  ];
  state.conversationSummary = input.result.conversationSummary;
  state.conversationContext = mergeLatestActionIntoContext(
    buildFitnessConversationContext(state.messages),
    input.result.assistantActions.at(-1),
  );
  state.recentArtifactSummaries = [
    ...input.result.assistantActions.map((action) =>
      createRecentArtifactSummary(state.conversationId, input.result.responseMessageId, action),
    ),
    ...state.recentArtifactSummaries,
  ].slice(0, 8);
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

function createRecentArtifactSummary(
  conversationId: string,
  responseMessageId: string,
  action: AssistantAction,
): RecentArtifactSummary {
  const parsedIntent = workoutPlanIntentSchema.safeParse(action.intent);
  const intent = parsedIntent.success ? parsedIntent.data : undefined;
  const kind =
    action.action === "workout_plan"
      ? "plan"
      : action.action === "workout_routine"
        ? "routine"
        : "exercise_recommendation";

  return {
    artifactId: `${responseMessageId}-${kind}`,
    kind,
    title: intent?.goal ?? action.action,
    summary: `${conversationId} 最近生成了 ${action.action}，目标：${intent?.goal ?? "未识别"}`,
    exerciseIds: [],
    goals: intent?.goal ? [intent.goal] : [],
    muscles: [],
    equipment: intent?.equipment ?? [],
    sessionMinutes: intent?.sessionMinutes,
    weeklyFrequency: intent?.weeklyFrequency,
    trainingDayCount: intent?.weeklyFrequency,
    updatedAt: new Date().toISOString(),
  };
}

function createManualTrace(conversationId: string, responseMessageId: string) {
  const steps: ManualTraceStep[] = [];
  const trace: AiTraceLogger & { steps: ManualTraceStep[] } = {
    id: createManualId("trace"),
    steps,
    addStep(stepInput) {
      steps.push(stepInput);
    },
    finish(_status: AiTraceStatus, _finalDecision?: AiRunFinalDecision) {
      return;
    },
    update(_input: Partial<AiTrace>) {
      return;
    },
  };

  trace.addStep({
    name: "手动黑盒会话",
    type: "user_input",
    metadata: {
      conversationId,
      responseMessageId,
    },
  });

  return trace;
}

function summarizeTraceUsage(steps: ManualTraceStep[]): DeepSeekUsage {
  return steps.reduce(
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

function createManualId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
