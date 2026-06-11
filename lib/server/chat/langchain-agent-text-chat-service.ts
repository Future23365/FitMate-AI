import "server-only";

import {
  createLangChainAgentResponseProjection,
  createProductionLangChainToolCatalog,
  runLangChainAgentRuntime,
  runLangChainTerminalFailureFinalizer,
  type LangChainAgentMessage,
  type LangChainAgentRunResult,
  type LangChainAgentStreamEvent,
  type LangChainAgentToolExecution,
  type LangChainValidatedVisibleOutput,
  type LangChainTerminalFailureFinalizerResult,
} from "@/lib/server/langchain-agent";
import { resolveLangChainDeepSeekProviderConfig } from "@/lib/server/config";
import { readExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";
import { startAiTrace, summarizeLatestUserMessage } from "@/lib/server/dev/ai-trace-logger";
import type { CurrentUser } from "@/lib/server/users/current-user";
import { persistVisibleTrainingProposalFactsFromEvents } from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import type { VisibleOutputStreamEvent } from "@/lib/server/visible-outputs/contracts";

import type { PreparedChatRequest } from "./chat-service";

const langChainAgentTextChatRoute = "/api/chat";
const ndjsonContentType = "application/x-ndjson; charset=utf-8";

type LangChainAgentTextChatStreamEvent =
  | LangChainAgentStreamEvent
  | {
      type: "agent_progress";
      stage: "preparing_context" | "analyzing_request" | "model_activity" | "writing_reply";
      status: "active";
      messageKey: "preparing_context" | "analyzing_request" | "model_activity" | "writing_reply";
      activitySummary?: string;
      sequence: number;
    }
  | {
      type: "agent_loop";
      loopTurn: number;
      sequence: number;
    };

export type CreateLangChainAgentTextChatResponseInput = {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
};

/** createLangChainAgentTextChatResponse 是 /api/chat 的 LangChain 主链入口，保留认证和请求 hydration，替换旧自研 runtime。 */
export async function createLangChainAgentTextChatResponse(
  input: CreateLangChainAgentTextChatResponseInput,
): Promise<Response> {
  const messages = createLangChainAgentTextChatMessages(input.request);
  const trace = startAiTrace({
    route: langChainAgentTextChatRoute,
    userId: input.currentUser.id,
    sessionId: input.request.conversationId,
    messageId: input.request.responseMessageId,
    title: summarizeLatestUserMessage(input.request.rawMessages),
  });

  const providerConfig = resolveLangChainDeepSeekProviderConfig();
  if (!providerConfig.ok) {
    recordLangChainAgentRequestContextTrace({
      trace,
      currentUser: input.currentUser,
      request: input.request,
      messages,
      toolNames: [],
    });
    const responseProjection = createLangChainAgentResponseProjection({
      result: {
        ok: false,
        code: "config_missing",
        message: providerConfig.message,
        retryable: false,
        messages: [],
        toolExecutions: [],
      },
    });
    recordLangChainAgentTextChatTrace({
      trace,
      result: {
        ok: false,
        code: "config_missing",
        message: providerConfig.message,
        retryable: false,
        messages: [],
        toolExecutions: [],
      },
      responseProjection,
    });

    return createLangChainAgentTextChatNdjsonResponse(responseProjection.events, { status: 503 });
  }

  const toolWrappers = await createProductionLangChainTextChatTools();

  recordLangChainAgentRequestContextTrace({
    trace,
    currentUser: input.currentUser,
    request: input.request,
    messages,
    toolNames: toolWrappers.map((tool) => tool.name),
  });

  return createLangChainAgentTextChatStreamingResponse(async (writer) => {
    const activityWriter = createLangChainAgentActivityStreamWriter(writer);
    await activityWriter.writeActivity("preparing_context");
    await activityWriter.writeActivity("analyzing_request");

    const result = await runLangChainAgentRuntime({
      messages,
      actor: {
        userId: input.currentUser.id,
        conversationId: input.request.conversationId,
      },
      toolWrappers,
      onRuntimeEvent: async (event) => {
        if (event.type === "model_call_started") {
          await activityWriter.writeLoop(event.loopTurn);
          return;
        }

        await activityWriter.writeModelActivity(event.summary);
      },
    });
    const validatedVisibleOutputs = collectLangChainValidatedVisibleOutputs(result);
    const terminalFailureFinalizerResult = result.ok
      ? undefined
      : await runLangChainTerminalFailureFinalizer({
          result,
          userRequestSummary: summarizeLatestUserMessage(input.request.rawMessages),
          providerConfigResult: providerConfig,
        });
    const responseProjection = createLangChainAgentResponseProjection({
      result,
      validatedVisibleOutputs,
      ...(terminalFailureFinalizerResult?.status === "succeeded"
        ? { terminalFailureFinalizerOutput: terminalFailureFinalizerResult.output }
        : {}),
      ...(terminalFailureFinalizerResult
        ? { terminalFailureFinalizerTrace: terminalFailureFinalizerResult.trace }
        : {}),
    });

    await persistLangChainVisibleTrainingFacts({
      request: input.request,
      currentUser: input.currentUser,
      events: responseProjection.events,
    });
    recordLangChainAgentTextChatTrace({
      trace,
      result,
      responseProjection,
      validatedVisibleOutputCount: validatedVisibleOutputs.length,
      terminalFailureFinalizerResult,
    });

    await activityWriter.writeActivity("writing_reply");
    for (const event of responseProjection.events) {
      await writer.write(event);
    }
  });
}

/** createProductionLangChainTextChatTools 装配生产 LangChain 只读 tool catalog，并注入动作库 facet catalog。 */
export async function createProductionLangChainTextChatTools() {
  const searchExerciseResourcesFacetCatalog = await readExerciseResourceFacetCatalog();

  return createProductionLangChainToolCatalog({ searchExerciseResourcesFacetCatalog });
}

/** createLangChainAgentTextChatMessages 将聊天历史和服务端 hydration 摘要转成模型可见消息，不构造旧自定义 action 输入。 */
export function createLangChainAgentTextChatMessages(
  request: PreparedChatRequest,
): LangChainAgentMessage[] {
  return [
    {
      role: "system",
      content: [
        "以下是当前请求的服务端上下文摘要。",
        `conversationId: ${request.conversationId ?? "none"}`,
        `responseMessageId: ${request.responseMessageId ?? "none"}`,
        `conversationSummary: ${request.conversationSummaryContext.summary || "none"}`,
        `thinkingEnabled: ${request.thinkingEnabled}`,
        `hydration: ${JSON.stringify(request.hydration)}`,
        `fitnessContext: ${JSON.stringify(request.internalConversationContext)}`,
      ].join("\n"),
    },
    ...request.rawMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

/** createLangChainAgentTextChatNdjsonResponse 输出与 /api/chat 兼容的非流式 NDJSON 响应，主要用于配置失败。 */
export function createLangChainAgentTextChatNdjsonResponse(
  events: readonly LangChainAgentStreamEvent[],
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", ndjsonContentType);
  headers.set("Cache-Control", "no-store");

  return new Response(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    ...init,
    headers,
  });
}

function createLangChainAgentTextChatStreamingResponse(
  writeBody: (writer: LangChainAgentTextChatNdjsonWriter) => Promise<void>,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", ndjsonContentType);
  headers.set("Cache-Control", "no-store");

  const encoder = new TextEncoder();
  const events: LangChainAgentTextChatStreamEvent[] = [];
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const writer: LangChainAgentTextChatNdjsonWriter = {
        events,
        write: async (event) => {
          if (closed) {
            return false;
          }

          try {
            events.push(event);
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            return true;
          } catch {
            closed = true;
            return false;
          }
        },
      };

      void (async () => {
        try {
          await writeBody(writer);
        } catch {
          await writer.write({
            type: "content",
            content: "聊天服务暂时没能完成这次回复。你可以稍后重试，或把问题缩小后再发一次。",
          });
          await writer.write({ type: "done" });
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // stream 已被客户端取消时不再影响服务端 runtime 结果。
            }
          }
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    ...init,
    headers,
  });
}

type LangChainAgentTextChatNdjsonWriter = {
  write: (event: LangChainAgentTextChatStreamEvent) => Promise<boolean>;
  readonly events: readonly LangChainAgentTextChatStreamEvent[];
};

function createLangChainAgentActivityStreamWriter(writer: LangChainAgentTextChatNdjsonWriter) {
  let sequence = 0;

  return {
    writeActivity: async (stage: Extract<LangChainAgentTextChatStreamEvent, { type: "agent_progress" }>["stage"]) => {
      sequence += 1;
      await writer.write({
        type: "agent_progress",
        stage,
        status: "active",
        messageKey: stage,
        sequence,
      });
    },
    writeModelActivity: async (activitySummary: string) => {
      sequence += 1;
      await writer.write({
        type: "agent_progress",
        stage: "model_activity",
        status: "active",
        messageKey: "model_activity",
        activitySummary,
        sequence,
      });
    },
    writeLoop: async (loopTurn: number) => {
      sequence += 1;
      await writer.write({
        type: "agent_loop",
        loopTurn,
        sequence,
      });
    },
  };
}

async function persistLangChainVisibleTrainingFacts(input: {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
  events: readonly LangChainAgentStreamEvent[];
}) {
  try {
    await persistVisibleTrainingProposalFactsFromEvents({
      userId: input.currentUser.id,
      conversationId: input.request.conversationId,
      messageId: input.request.responseMessageId,
      events: input.events.filter(isVisibleOutputStreamEvent),
    });
  } catch {
    // 可见训练事实桥是响应后的旁路诊断，失败不能改变用户已生成的 NDJSON。
  }
}

function isVisibleOutputStreamEvent(event: LangChainAgentStreamEvent): event is VisibleOutputStreamEvent {
  return event.type === "visible_output";
}

function recordLangChainAgentRequestContextTrace(input: {
  trace: ReturnType<typeof startAiTrace>;
  currentUser: CurrentUser;
  request: PreparedChatRequest;
  messages: readonly LangChainAgentMessage[];
  toolNames: readonly string[];
}) {
  try {
    input.trace.addStep({
      name: "LangChain Agent 请求上下文",
      type: "runtime_event",
      output: {
        route: langChainAgentTextChatRoute,
        runtime: "langchain-agent-runtime-v1",
        userId: input.currentUser.id,
        conversationId: input.request.conversationId ?? null,
        responseMessageId: input.request.responseMessageId ?? null,
        messageCount: input.messages.length,
        toolNames: input.toolNames,
        hydration: input.request.hydration,
        hasClientConversationSummary: input.request.hasClientConversationSummary,
      },
      metadata: {
        pipeline: "langchain-agent-text-chat",
        boundary: "request_context",
      },
    });
  } catch {
    // trace 是非致命诊断，请求上下文写入失败不能阻断模型调用或用户响应。
  }
}

function recordLangChainAgentTextChatTrace(input: {
  trace: ReturnType<typeof startAiTrace>;
  result: LangChainAgentRunResult;
  responseProjection: ReturnType<typeof createLangChainAgentResponseProjection>;
  validatedVisibleOutputCount?: number;
  terminalFailureFinalizerResult?: LangChainTerminalFailureFinalizerResult;
}) {
  try {
    recordLangChainAgentRuntimeDetailTrace({
      trace: input.trace,
      result: input.result,
    });
    recordLangChainTerminalFailureFinalizerTrace({
      trace: input.trace,
      terminalFailureFinalizerResult: input.terminalFailureFinalizerResult,
    });

    input.trace.addStep({
      name: "LangChain Agent Runtime 摘要",
      type: input.result.ok ? "runtime_event" : "error",
      status: input.result.ok ? undefined : "failed",
      output: input.result.ok
        ? {
            finalTextLength: input.result.finalText.length,
            traceSummary: input.result.traceSummary,
            toolExecutions: input.result.toolExecutions,
            structuredOutputValidation: {
              validatedVisibleOutputCount: input.validatedVisibleOutputCount ?? 0,
            },
          }
        : {
            code: input.result.code,
            retryable: input.result.retryable,
            message: input.result.message,
            traceSummary: input.result.traceSummary,
            toolExecutions: input.result.toolExecutions,
          },
      metadata: {
        pipeline: "langchain-agent-text-chat",
        boundary: "langchain_runtime_summary",
      },
    });

    input.trace.addStep({
      name: "NDJSON 响应写入",
      type: "response_write",
      output: input.responseProjection.summary,
      metadata: {
        route: langChainAgentTextChatRoute,
        eventCount: input.responseProjection.events.length,
        projectionType: input.responseProjection.projectionType,
        visibleOutputCount: input.responseProjection.summary.visibleOutputCount,
        pipeline: "langchain-agent-text-chat",
      },
    });

    input.trace.finish(input.result.ok ? "success" : "failed", {
      status: input.result.ok ? "success" : "hard_failure",
      reason: input.responseProjection.projectionType,
      responseType: input.responseProjection.events.some((event) => event.type === "error")
        ? "error"
        : "content",
    });
  } catch {
    // trace 是非致命诊断，写入失败不能重试模型或改变响应。
  }
}

function recordLangChainTerminalFailureFinalizerTrace(input: {
  trace: ReturnType<typeof startAiTrace>;
  terminalFailureFinalizerResult?: LangChainTerminalFailureFinalizerResult;
}) {
  const finalizerResult = input.terminalFailureFinalizerResult;

  if (!finalizerResult) {
    return;
  }

  input.trace.addStep({
    name: "LangChain Terminal Failure Finalizer",
    type: finalizerResult.status === "succeeded" ? "model_response" : "runtime_event",
    status: finalizerResult.status === "failed" ? "failed" : undefined,
    output: finalizerResult.trace,
    metadata: {
      pipeline: "langchain-agent-text-chat",
      boundary: "terminal_failure_finalizer",
      status: finalizerResult.status,
      projectionType: finalizerResult.status === "succeeded"
        ? "terminal_failure_finalizer"
        : "deterministic_fallback",
    },
  });
}

function recordLangChainAgentRuntimeDetailTrace(input: {
  trace: ReturnType<typeof startAiTrace>;
  result: LangChainAgentRunResult;
}) {
  const traceSummary = input.result.traceSummary;

  if (!traceSummary) {
    return;
  }

  for (const modelCall of traceSummary.modelCalls) {
    const modelLinkage = {
      pipeline: "langchain-agent-text-chat",
      boundary: "planner_model",
      modelCallIndex: modelCall.modelCallIndex,
      plannerCallIndex: modelCall.modelCallIndex,
      runtimeStep: modelCall.runtimeStep,
    };

    input.trace.addStep({
      name: `LangChain 模型请求 #${modelCall.modelCallIndex}`,
      type: "model_request",
      input: {
        messages: modelCall.requestSummary.messagePreviews,
        toolNames: modelCall.requestSummary.toolNames,
      },
      output: {
        runtime: traceSummary.runtimeVersion,
        provider: "langchain",
        model: traceSummary.model,
        modelCallIndex: modelCall.modelCallIndex,
        plannerCallIndex: modelCall.modelCallIndex,
        runtimeStep: modelCall.runtimeStep,
        messageCount: modelCall.requestSummary.messageCount,
        toolCount: modelCall.requestSummary.toolCount,
        toolNames: modelCall.requestSummary.toolNames,
      },
      metadata: {
        ...modelLinkage,
        toolNames: modelCall.requestSummary.toolNames,
      },
    });

    const singleToolName = modelCall.providerToolCalls.length === 1
      ? modelCall.providerToolCalls[0]?.name
      : undefined;

    input.trace.addStep({
      name: `LangChain 模型响应 #${modelCall.modelCallIndex}`,
      type: "model_response",
      status: modelCall.status === "success" ? "success" : "failed",
      output: {
        runtime: traceSummary.runtimeVersion,
        provider: "langchain",
        model: traceSummary.model,
        modelCallIndex: modelCall.modelCallIndex,
        plannerCallIndex: modelCall.modelCallIndex,
        runtimeStep: modelCall.runtimeStep,
        parseStatus: modelCall.status === "success" ? "parsed" : "failed",
        actionType: modelCall.providerToolCalls.length > 0 ? "tool_call" : "final_answer",
        toolName: singleToolName,
        providerToolCalls: modelCall.providerToolCalls,
        response: modelCall.responseSummary,
        tokenUsage: modelCall.tokenUsage,
        failureCode: modelCall.failureCode,
        failureMessage: modelCall.failureMessage,
      },
      metadata: {
        ...modelLinkage,
        tokenUsage: modelCall.tokenUsage,
        failureCode: modelCall.failureCode,
      },
    });
  }

  for (const execution of input.result.toolExecutions) {
    input.trace.addStep({
      name: `LangChain Tool Wrapper 执行: ${execution.toolName}`,
      type: "tool_call",
      status: mapLangChainToolExecutionTraceStatus(execution.status),
      input: {
        toolCallId: execution.toolCallId,
        toolName: execution.toolName,
        inputSummary: execution.inputSummary,
      },
      output: {
        type: "tool_execution",
        runtime: traceSummary.runtimeVersion,
        sequence: execution.sequence,
        step: execution.runtimeStep,
        runtimeStep: execution.runtimeStep,
        modelCallIndex: execution.modelCallIndex,
        toolCallId: execution.toolCallId,
        toolName: execution.toolName,
        status: execution.status,
        durationMs: execution.durationMs,
        modelVisibleSummary: execution.modelVisibleSummary,
        userProjection: execution.userProjection,
        traceSummary: execution.traceSummary,
        failureCode: execution.failureCode,
        feedbackCode: execution.feedbackCode,
        failureMessage: execution.failureMessage,
        enteredModelContext: execution.enteredModelContext,
      },
      metadata: {
        pipeline: "langchain-agent-text-chat",
        boundary: "langchain_runtime",
        eventType: "tool_execution",
        sequence: execution.sequence,
        runtimeStep: execution.runtimeStep,
        modelCallIndex: execution.modelCallIndex,
        plannerCallIndex: execution.modelCallIndex,
        toolCallId: execution.toolCallId,
        toolName: execution.toolName,
        failureCode: execution.failureCode,
        feedbackCode: execution.feedbackCode,
      },
    });
  }
}

function mapLangChainToolExecutionTraceStatus(status: LangChainAgentToolExecution["status"]) {
  if (status === "succeeded") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  return "neutral";
}

/** collectLangChainValidatedVisibleOutputs 只接受 tool wrapper 明确标记的 validator-approved 可见输出。 */
function collectLangChainValidatedVisibleOutputs(
  result: LangChainAgentRunResult,
): LangChainValidatedVisibleOutput[] {
  if (!result.ok) {
    return [];
  }

  return result.toolExecutions.flatMap((execution) => {
    if (execution.status !== "succeeded") {
      return [];
    }

    return readValidatedVisibleOutputs(execution.userProjection);
  });
}

function readValidatedVisibleOutputs(value: unknown): LangChainValidatedVisibleOutput[] {
  if (!isRecord(value) || !Array.isArray(value.validatedVisibleOutputs)) {
    return [];
  }

  return value.validatedVisibleOutputs.flatMap((candidate) => (
    isValidatedVisibleOutput(candidate) ? [candidate] : []
  ));
}

function isValidatedVisibleOutput(value: unknown): value is LangChainValidatedVisibleOutput {
  return (
    isRecord(value)
    && typeof value.outputType === "string"
    && typeof value.schemaVersion === "string"
    && "payload" in value
    && (value.content === undefined || isJsonValue(value.content))
    && isJsonValue(value.payload)
  );
}

function isJsonValue(value: unknown): value is LangChainValidatedVisibleOutput["payload"] {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
