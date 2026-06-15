"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  getAgentTextChatErrorMessage,
  getAgentTextChatEventErrorMessage,
  isAgentTextChatAbortError,
  requestAgentTextChatResponse,
  type AgentTextChatEvent,
} from "@/features/chat/api/chat-client";
import { applyAgentTextChatEventToAssistantMessage } from "@/features/chat/hooks/use-chat-controller";
import { saveChatConversation } from "@/features/chat/lib/chat-history";
import type { ChatMessage } from "@/features/chat/types";
import {
  calculateLlmBlackboxRunStats,
  cancelPendingLlmBlackboxWork,
  completeLlmBlackboxTurn,
  createLlmBlackboxReviewRun,
  createTurnCompletionReason,
  finalizeLlmBlackboxRun,
  hasLlmBlackboxUserVisibleAnswer,
  skipRemainingFlowTurnsAfterFailure,
  startLlmBlackboxTurn,
  updateLlmBlackboxFlowReview,
  updateLlmBlackboxTurnReview,
  updateRunningLlmBlackboxTurnSnapshot,
  type LlmBlackboxReviewRun,
  type LlmBlackboxReviewStatus,
  type LlmBlackboxTokenDiagnostics,
} from "@/features/dev/llm-blackbox/review-state";
import {
  clearLlmBlackboxReviewRuns,
  readLlmBlackboxReviewRuns,
  writeLlmBlackboxReviewRuns,
} from "@/features/dev/llm-blackbox/review-storage";
import {
  buildConversationSummaryContext,
  buildFitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type {
  BasicChatFixture,
  BasicChatFlow,
  BasicChatFlowTurn,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";

type SelectedTurnKey = {
  flowId: string;
  turnIndex: number;
};

type DevTraceListResponse = {
  ok?: boolean;
  traces?: Array<{
    id?: string;
    messageId?: string;
    metadata?: Record<string, unknown>;
  }>;
};

// useLlmBlackboxReviewRunner 是审核页唯一执行协调者，负责 headless 调用生产聊天 client 并推进 run 状态机。
export function useLlmBlackboxReviewRunner(fixture: BasicChatFixture) {
  const [runs, setRuns] = useState<LlmBlackboxReviewRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedFlowId, setSelectedFlowId] = useState<string>(fixture.flows[0]?.id ?? "");
  const [selectedTurnKey, setSelectedTurnKey] = useState<SelectedTurnKey | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<LlmBlackboxReviewRun | null>(null);
  const isExecutingRef = useRef(false);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const restoredRuns = readLlmBlackboxReviewRuns();

      activeRunRef.current = restoredRuns[0] ?? null;
      setRuns(restoredRuns);
      setActiveRunId(restoredRuns[0]?.id ?? null);
      setSelectedFlowId(restoredRuns[0]?.flows[0]?.id ?? fixture.flows[0]?.id ?? "");
    });

    return () => {
      cancelled = true;
    };
  }, [fixture.flows]);

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null,
    [activeRunId, runs],
  );
  const activeRunStats = useMemo(
    () => activeRun ? calculateLlmBlackboxRunStats(activeRun) : null,
    [activeRun],
  );
  const selectedFlow = useMemo(() => {
    if (activeRun) {
      return activeRun.flows.find((flow) => flow.id === selectedFlowId) ?? activeRun.flows[0] ?? null;
    }

    const fixtureFlow = fixture.flows.find((flow) => flow.id === selectedFlowId) ?? fixture.flows[0] ?? null;

    return fixtureFlow
      ? {
          id: fixtureFlow.id,
          goal: fixtureFlow.goal,
          status: "queued" as const,
          reviewStatus: "unreviewed" as const,
          turns: fixtureFlow.turns.map((turn) => ({
            id: `${fixtureFlow.id}:${turn.index}`,
            flowId: fixtureFlow.id,
            flowGoal: fixtureFlow.goal,
            turnIndex: turn.index,
            userInput: turn.userInput,
            expectedOutput: turn.expectation,
            status: "queued" as const,
            reviewStatus: "unreviewed" as const,
            assistantText: "",
            visibleOutputs: [],
            visibleOutputKinds: [],
            suggestedQuestions: [],
            eventTypes: [],
          })),
        }
      : null;
  }, [activeRun, fixture.flows, selectedFlowId]);
  const selectedTurn = useMemo(() => {
    if (!selectedFlow) {
      return null;
    }

    const key = selectedTurnKey?.flowId === selectedFlow.id ? selectedTurnKey : null;

    return key
      ? selectedFlow.turns.find((turn) => turn.turnIndex === key.turnIndex) ?? selectedFlow.turns[0] ?? null
      : selectedFlow.turns[0] ?? null;
  }, [selectedFlow, selectedTurnKey]);
  const isRunning = activeRun?.status === "running" || isExecuting;

  const commitRun = useCallback((nextRun: LlmBlackboxReviewRun) => {
    activeRunRef.current = nextRun;
    setRuns((currentRuns) => {
      const nextRuns = [nextRun, ...currentRuns.filter((run) => run.id !== nextRun.id)];
      return writeLlmBlackboxReviewRuns(nextRuns);
    });
  }, []);

  const updateStoredRun = useCallback((
    runId: string,
    updater: (run: LlmBlackboxReviewRun) => LlmBlackboxReviewRun,
  ) => {
    setRuns((currentRuns) => {
      const nextRuns = currentRuns.map((run) => {
        if (run.id !== runId) {
          return run;
        }

        const nextRun = updater(run);
        if (activeRunRef.current?.id === runId) {
          activeRunRef.current = nextRun;
        }

        return nextRun;
      });

      return writeLlmBlackboxReviewRuns(nextRuns);
    });
  }, []);

  const runSingleFlow = useCallback(async (flowId: string) => {
    const flow = fixture.flows.find((item) => item.id === flowId);

    if (!flow || isExecutingRef.current) {
      return;
    }

    await executeRun({
      fixture,
      flows: [flow],
      mode: "single",
      commitRun,
      setActiveRunId,
      setSelectedFlowId,
      setSelectedTurnKey,
      activeAbortControllerRef,
      isExecutingRef,
      setIsExecuting,
      stopRequestedRef,
    });
  }, [commitRun, fixture]);

  const runAllFlows = useCallback(async () => {
    if (isExecutingRef.current) {
      return;
    }

    await executeRun({
      fixture,
      flows: fixture.flows,
      mode: "all",
      commitRun,
      setActiveRunId,
      setSelectedFlowId,
      setSelectedTurnKey,
      activeAbortControllerRef,
      isExecutingRef,
      setIsExecuting,
      stopRequestedRef,
    });
  }, [commitRun, fixture]);

  const stopRun = useCallback(() => {
    stopRequestedRef.current = true;
    activeAbortControllerRef.current?.abort();

    const currentRun = activeRunRef.current;
    if (currentRun?.status === "running") {
      commitRun(cancelPendingLlmBlackboxWork(currentRun, "开发者停止了当前批次。"));
    }
  }, [commitRun]);

  const clearRuns = useCallback(() => {
    if (isExecutingRef.current) {
      return;
    }

    clearLlmBlackboxReviewRuns();
    activeRunRef.current = null;
    setRuns([]);
    setActiveRunId(null);
    setSelectedTurnKey(null);
    setSelectedFlowId(fixture.flows[0]?.id ?? "");
  }, [fixture.flows]);

  const setTurnReviewStatus = useCallback((
    flowId: string,
    turnIndex: number,
    reviewStatus: LlmBlackboxReviewStatus,
  ) => {
    if (!activeRun) {
      return;
    }

    updateStoredRun(activeRun.id, (run) =>
      updateLlmBlackboxTurnReview(run, flowId, turnIndex, reviewStatus),
    );
  }, [activeRun, updateStoredRun]);

  const setFlowReviewStatus = useCallback((
    flowId: string,
    reviewStatus: LlmBlackboxReviewStatus,
  ) => {
    if (!activeRun) {
      return;
    }

    updateStoredRun(activeRun.id, (run) =>
      updateLlmBlackboxFlowReview(run, flowId, reviewStatus),
    );
  }, [activeRun, updateStoredRun]);

  return {
    activeRun,
    activeRunId,
    activeRunStats,
    clearRuns,
    fixture,
    isRunning,
    runAllFlows,
    runSingleFlow,
    runs,
    selectedFlow,
    selectedFlowId,
    selectedTurn,
    selectedTurnKey,
    setActiveRunId,
    setFlowReviewStatus,
    setSelectedFlowId,
    setSelectedTurnKey,
    setTurnReviewStatus,
    stopRun,
  };
}

async function executeRun(input: {
  fixture: BasicChatFixture;
  flows: BasicChatFlow[];
  mode: "single" | "all";
  commitRun: (run: LlmBlackboxReviewRun) => void;
  setActiveRunId: (runId: string) => void;
  setSelectedFlowId: (flowId: string) => void;
  setSelectedTurnKey: (key: SelectedTurnKey | null) => void;
  activeAbortControllerRef: MutableRefObject<AbortController | null>;
  isExecutingRef: MutableRefObject<boolean>;
  setIsExecuting: (isExecuting: boolean) => void;
  stopRequestedRef: MutableRefObject<boolean>;
}) {
  input.isExecutingRef.current = true;
  input.setIsExecuting(true);
  input.stopRequestedRef.current = false;

  let run = createLlmBlackboxReviewRun({
    fixture: input.fixture,
    flows: input.flows,
    mode: input.mode,
  });

  input.setActiveRunId(run.id);
  input.setSelectedFlowId(input.flows[0]?.id ?? "");
  input.setSelectedTurnKey(null);
  input.commitRun(run);

  try {
    for (const flow of input.flows) {
      if (input.stopRequestedRef.current) {
        break;
      }

      const result = await executeFlow({
        flow,
        run,
        commitRun: input.commitRun,
        setSelectedFlowId: input.setSelectedFlowId,
        setSelectedTurnKey: input.setSelectedTurnKey,
        activeAbortControllerRef: input.activeAbortControllerRef,
        stopRequestedRef: input.stopRequestedRef,
      });

      run = result.run;
    }

    run = input.stopRequestedRef.current
      ? cancelPendingLlmBlackboxWork(run, "开发者停止了当前批次。")
      : finalizeLlmBlackboxRun(run);
    input.commitRun(run);
  } finally {
    input.activeAbortControllerRef.current = null;
    input.isExecutingRef.current = false;
    input.setIsExecuting(false);
    input.stopRequestedRef.current = false;
  }
}

async function executeFlow(input: {
  flow: BasicChatFlow;
  run: LlmBlackboxReviewRun;
  commitRun: (run: LlmBlackboxReviewRun) => void;
  setSelectedFlowId: (flowId: string) => void;
  setSelectedTurnKey: (key: SelectedTurnKey | null) => void;
  activeAbortControllerRef: MutableRefObject<AbortController | null>;
  stopRequestedRef: MutableRefObject<boolean>;
}) {
  let run = input.run;
  let messages: ChatMessage[] = [];
  let conversationSummary = "";
  const conversationId = `dev-llm-blackbox-${input.flow.id}-${createClientId()}`;

  input.setSelectedFlowId(input.flow.id);

  for (const turn of input.flow.turns) {
    if (input.stopRequestedRef.current) {
      break;
    }

    const result = await executeTurn({
      conversationId,
      conversationSummary,
      messages,
      run,
      flow: input.flow,
      turn,
      commitRun: input.commitRun,
      setSelectedTurnKey: input.setSelectedTurnKey,
      activeAbortControllerRef: input.activeAbortControllerRef,
      stopRequestedRef: input.stopRequestedRef,
    });

    run = result.run;

    if (result.messages) {
      messages = result.messages;
      conversationSummary = result.conversationSummary;
    }

    if (result.shouldSkipRemainingFlow) {
      run = skipRemainingFlowTurnsAfterFailure(
        run,
        input.flow.id,
        turn.index,
        result.skipReason,
      );
      input.commitRun(run);
      break;
    }
  }

  return { run };
}

async function executeTurn(input: {
  conversationId: string;
  conversationSummary: string;
  messages: ChatMessage[];
  run: LlmBlackboxReviewRun;
  flow: BasicChatFlow;
  turn: BasicChatFlowTurn;
  commitRun: (run: LlmBlackboxReviewRun) => void;
  setSelectedTurnKey: (key: SelectedTurnKey | null) => void;
  activeAbortControllerRef: MutableRefObject<AbortController | null>;
  stopRequestedRef: MutableRefObject<boolean>;
}): Promise<{
  run: LlmBlackboxReviewRun;
  messages?: ChatMessage[];
  conversationSummary: string;
  shouldSkipRemainingFlow: boolean;
  skipReason: string;
}> {
  const startedAt = new Date();
  const userMessage = createChatMessage("user", input.turn.userInput);
  let assistantMessage = createChatMessage("assistant", "", true);
  const responseMessageId = assistantMessage.id;
  const eventTypes: string[] = [];
  let safeErrorMessage: string | undefined;
  let run = startLlmBlackboxTurn(input.run, {
    flowId: input.flow.id,
    turnIndex: input.turn.index,
    conversationId: input.conversationId,
    responseMessageId,
    startedAt,
  });

  input.setSelectedTurnKey({ flowId: input.flow.id, turnIndex: input.turn.index });
  input.commitRun(run);

  const controller = new AbortController();
  input.activeAbortControllerRef.current = controller;

  try {
    const requestMessages = [...input.messages, userMessage];
    const requestContext = buildFitnessConversationContext(requestMessages);
    const requestSummary = buildConversationSummaryContext({
      summary: input.conversationSummary,
      latestUserMessage: input.turn.userInput,
    });

    await requestAgentTextChatResponse({
      conversationId: input.conversationId,
      responseMessageId,
      latestUserMessage: requestSummary.latestUserMessage,
      conversationSummary: requestSummary.summary,
      conversationContext: requestContext,
      thinkingEnabled: false,
      signal: controller.signal,
      onEvent: (event) => {
        eventTypes.push(event.type);

        if (event.type === "error") {
          safeErrorMessage = getAgentTextChatEventErrorMessage(event);
        }

        assistantMessage = applyAgentTextChatEventToAssistantMessage(assistantMessage, event);
        run = updateRunningLlmBlackboxTurnSnapshot(
          run,
          input.flow.id,
          input.turn.index,
          { assistantMessage, eventTypes: [...eventTypes], safeErrorMessage },
        );
        input.commitRun(run);
      },
    });

    const tokenDiagnostics = await readDevTraceTokenDiagnostics(responseMessageId);
    const completion = createTurnCompletion({
      assistantMessage,
      eventTypes,
      safeErrorMessage,
      startedAt,
      tokenDiagnostics,
    });

    if (completion.status === "passed") {
      const nextMessages = [...input.messages, userMessage, assistantMessage];
      const nextConversationContext = buildFitnessConversationContext(nextMessages);
      const nextConversationSummary = { summary: nextConversationContext.summary };

      try {
        const saved = await saveChatConversation(
          input.conversationId,
          nextMessages,
          nextConversationSummary,
          nextConversationContext,
        );

        run = completeLlmBlackboxTurn(run, input.flow.id, input.turn.index, completion);
        input.commitRun(run);

        return {
          run,
          messages: saved?.messages ?? nextMessages,
          conversationSummary: saved?.conversationSummary?.summary ?? nextConversationSummary.summary,
          shouldSkipRemainingFlow: false,
          skipReason: "",
        };
      } catch (saveError) {
        const failedCompletion = {
          ...completion,
          status: "failed" as const,
          resultReason: undefined,
          failureReason: `会话保存失败：${getUnknownErrorMessage(saveError)}`,
        };

        run = completeLlmBlackboxTurn(run, input.flow.id, input.turn.index, failedCompletion);
        input.commitRun(run);

        return {
          run,
          conversationSummary: input.conversationSummary,
          shouldSkipRemainingFlow: true,
          skipReason: failedCompletion.failureReason,
        };
      }
    }

    run = completeLlmBlackboxTurn(run, input.flow.id, input.turn.index, completion);
    input.commitRun(run);

    return {
      run,
      conversationSummary: input.conversationSummary,
      shouldSkipRemainingFlow: true,
      skipReason: completion.failureReason ?? "当前 turn 未通过用户可见结果检查。",
    };
  } catch (error) {
    const isAbort = input.stopRequestedRef.current || controller.signal.aborted || isAgentTextChatAbortError(error);
    const tokenDiagnostics = await readDevTraceTokenDiagnostics(responseMessageId);
    const completion = {
      assistantMessage,
      eventTypes: [...eventTypes],
      safeErrorMessage,
      status: isAbort ? "cancelled" as const : "failed" as const,
      endedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      failureReason: isAbort ? "开发者停止了当前 turn。" : getAgentTextChatErrorMessage(error),
      tokenDiagnostics,
    };

    run = completeLlmBlackboxTurn(run, input.flow.id, input.turn.index, completion);
    input.commitRun(run);

    return {
      run,
      conversationSummary: input.conversationSummary,
      shouldSkipRemainingFlow: true,
      skipReason: completion.failureReason,
    };
  } finally {
    if (input.activeAbortControllerRef.current === controller) {
      input.activeAbortControllerRef.current = null;
    }
  }
}

function createTurnCompletion(input: {
  assistantMessage: ChatMessage;
  eventTypes: string[];
  safeErrorMessage?: string;
  startedAt: Date;
  tokenDiagnostics: LlmBlackboxTokenDiagnostics;
}) {
  const endedAt = new Date();
  const visibleTurn = {
    assistantText: input.assistantMessage.content,
    visibleOutputs: input.assistantMessage.visibleOutputs ?? [],
    suggestedQuestions: input.assistantMessage.suggestedQuestions ?? [],
    safeErrorMessage: input.safeErrorMessage,
  };
  const hasDone = input.eventTypes.includes("done");
  const hasVisibleAnswer = hasLlmBlackboxUserVisibleAnswer(visibleTurn);

  if (!hasDone) {
    return {
      assistantMessage: input.assistantMessage,
      eventTypes: input.eventTypes,
      safeErrorMessage: input.safeErrorMessage,
      status: "failed" as const,
      endedAt,
      durationMs: endedAt.getTime() - input.startedAt.getTime(),
      failureReason: "聊天响应未收到 done 事件。",
      tokenDiagnostics: input.tokenDiagnostics,
    };
  }

  if (!hasVisibleAnswer) {
    return {
      assistantMessage: input.assistantMessage,
      eventTypes: input.eventTypes,
      safeErrorMessage: input.safeErrorMessage,
      status: "failed" as const,
      endedAt,
      durationMs: endedAt.getTime() - input.startedAt.getTime(),
      failureReason: createTurnCompletionReason(visibleTurn),
      tokenDiagnostics: input.tokenDiagnostics,
    };
  }

  return {
    assistantMessage: input.assistantMessage,
    eventTypes: input.eventTypes,
    safeErrorMessage: input.safeErrorMessage,
    status: "passed" as const,
    endedAt,
    durationMs: endedAt.getTime() - input.startedAt.getTime(),
    resultReason: createTurnCompletionReason(visibleTurn),
    tokenDiagnostics: input.tokenDiagnostics,
  };
}

async function readDevTraceTokenDiagnostics(responseMessageId: string): Promise<LlmBlackboxTokenDiagnostics> {
  try {
    const response = await fetch("/api/dev/ai-traces", { credentials: "same-origin" });

    if (!response.ok) {
      return {
        source: "dev_trace_store",
        status: "unavailable",
        reason: `HTTP ${response.status}`,
      };
    }

    const data = await response.json() as DevTraceListResponse;
    const trace = data.traces?.find((item) => item.messageId === responseMessageId);
    const usage = trace?.metadata?.tokenUsageSummary;

    if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
      return {
        source: "dev_trace_store",
        status: "missing",
        traceId: trace?.id,
        reason: "trace token usage not found",
      };
    }

    const record = usage as Record<string, unknown>;
    const promptTokens = readNumber(record.prompt_tokens);
    const completionTokens = readNumber(record.completion_tokens);
    const totalTokens = readNumber(record.total_tokens) ?? (
      promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined
    );

    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
      return {
        source: "dev_trace_store",
        status: "missing",
        traceId: trace?.id,
        reason: "trace token usage is empty",
      };
    }

    return {
      source: "dev_trace_store",
      status: "available",
      traceId: trace?.id,
      usage: {
        promptTokens: promptTokens ?? 0,
        completionTokens: completionTokens ?? 0,
        totalTokens: totalTokens ?? 0,
      },
    };
  } catch (error) {
    return {
      source: "dev_trace_store",
      status: "unavailable",
      reason: getUnknownErrorMessage(error),
    };
  }
}

function createChatMessage(role: ChatMessage["role"], content: string, isReasoning = false): ChatMessage {
  return {
    id: role === "assistant" ? `assistant-${createClientId()}` : `user-${createClientId()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    isReasoning: role === "assistant" ? isReasoning : undefined,
  };
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getUnknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
