import "server-only";

import { aiRunTraceModel } from "@/lib/server/dev/ai-run-trace";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import type { ChatMessage } from "@/lib/server/chat/chat-service";
import type { ConversationSummaryContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
import type { ResolvedChatIntent } from "@/lib/shared/chat/resolved-intent";
import { defaultReadonlyToolBudget } from "./config";
import { requestReadonlyToolDecision } from "./decision";
import { executeReadonlyTool } from "./executor";
import { listReadonlyToolDefinitions } from "./registry";
import type { ControlledToolBudget, ExecutedToolCall, ReadonlyToolContextBundle } from "./types";

export type ReadonlyToolLoopTrigger =
  | "history_artifact_explanation"
  | "exercise_detail_lookup"
  | "recommendation_reason_explanation"
  | "plan_reason_explanation";

export type ReadonlyToolLoopSkipReason =
  | "feature_flag_disabled"
  | "trigger_not_allowed"
  | "deterministic_skip";

export type ReadonlyToolLoopEligibility =
  | { allowed: true; trigger: ReadonlyToolLoopTrigger }
  | { allowed: false; reason: ReadonlyToolLoopSkipReason };

export function isReadonlyToolFeatureEnabled() {
  return process.env.ENABLE_READONLY_LLM_TOOLS === "true";
}

// 触发矩阵只允许解释和补查类问题进入工具循环，生成型动作仍由 resolved intent 门控决定。
export function decideReadonlyToolLoopEligibility(input: {
  latestUserMessage: string;
  resolvedIntent: ResolvedChatIntent;
  referenceResolution: ReferenceResolution | null;
  assistantActionExists: boolean;
  deterministicHandled?: boolean;
}): ReadonlyToolLoopEligibility {
  if (!isReadonlyToolFeatureEnabled()) {
    return { allowed: false, reason: "feature_flag_disabled" };
  }

  if (input.deterministicHandled || input.assistantActionExists) {
    return { allowed: false, reason: "deterministic_skip" };
  }

  if (input.referenceResolution?.status === "ambiguous" || input.referenceResolution?.status === "not_found") {
    return { allowed: false, reason: "deterministic_skip" };
  }

  const actionKind = input.resolvedIntent.action.kind;
  if (actionKind === "workout_plan" || actionKind === "workout_routine" || actionKind === "exercise_recommendation" || actionKind === "workout_patch") {
    return { allowed: false, reason: "trigger_not_allowed" };
  }

  const text = input.latestUserMessage;

  if (/为什么|原因|理由|推荐逻辑|适合/.test(text) && /推荐|动作/.test(text)) {
    return { allowed: true, trigger: "recommendation_reason_explanation" };
  }

  if (/为什么|原因|理由|安排逻辑|计划/.test(text) && /计划|训练/.test(text)) {
    return { allowed: true, trigger: "plan_reason_explanation" };
  }

  if (/动作|怎么做|标准|发力|肌肉|讲解|细节/.test(text)) {
    return { allowed: true, trigger: "exercise_detail_lookup" };
  }

  if (/之前|刚才|那套|这个计划|这张卡|历史|第[一二三四五六七八九十\d]+个/.test(text)) {
    return { allowed: true, trigger: "history_artifact_explanation" };
  }

  return { allowed: false, reason: "trigger_not_allowed" };
}

export async function runReadonlyToolLoop(input: {
  apiKey: string;
  userId: string;
  sessionId?: string;
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  resolvedIntent: ResolvedChatIntent;
  referenceResolution: ReferenceResolution | null;
  trace: AiTraceLogger;
  eligibility: ReadonlyToolLoopEligibility;
  budget?: Partial<ControlledToolBudget>;
}): Promise<ReadonlyToolContextBundle> {
  const budget = { ...defaultReadonlyToolBudget, ...input.budget };
  const startedAt = Date.now();

  if (!input.eligibility.allowed) {
    const bundle = createEmptyBundle({
      enabled: isReadonlyToolFeatureEnabled(),
      stopReason: input.eligibility.reason,
      totalDurationMs: Date.now() - startedAt,
    });
    traceToolLoopSummary(input.trace, bundle, input.eligibility.reason);
    return bundle;
  }

  const calls: ExecutedToolCall[] = [];
  let decisionCallCount = 0;
  let stopReason: ReadonlyToolContextBundle["stopReason"] = "model_finish";
  let timeout = false;

  for (let stepIndex = 0; stepIndex < budget.maxSteps; stepIndex += 1) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= budget.timeoutMs) {
      timeout = true;
      stopReason = "timeout";
      break;
    }

    decisionCallCount += 1;
    const decision = await requestReadonlyToolDecision({
      apiKey: input.apiKey,
      timeoutMs: Math.max(1_000, budget.timeoutMs - elapsed),
      messages: buildDecisionMessages({
        messages: input.messages,
        conversationSummaryContext: input.conversationSummaryContext,
        resolvedIntent: input.resolvedIntent,
        referenceResolution: input.referenceResolution,
        trigger: input.eligibility.trigger,
        calls,
      }),
    });

    input.trace.addStep({
      name: "只读工具决策",
      type: "tool_decision",
      status: decision.ok ? "success" : "failed",
      input: {
        stepIndex,
        availableTools: listReadonlyToolDefinitions(),
        previousToolContext: calls.map((call) => ({
          id: call.id,
          toolName: call.toolName,
          status: call.status,
          modelSummary: call.modelSummary,
          error: call.error,
        })),
      },
      output: decision.ok ? decision.decision : undefined,
      error: decision.ok ? undefined : decision,
      metadata: {
        trigger: input.eligibility.trigger,
        decisionCallCount,
        tokenUsage: decision.ok ? decision.tokenUsage : undefined,
      },
    });

    if (!decision.ok) {
      stopReason = "decision_failure_fallback";
      break;
    }

    if (decision.decision.action === "finish") {
      stopReason = "model_finish";
      break;
    }

    const call = await executeReadonlyTool({
      toolName: decision.decision.toolName,
      toolInput: decision.decision.input,
      reason: decision.decision.reason,
      stepIndex,
      context: {
        userId: input.userId,
        sessionId: input.sessionId,
        trace: input.trace,
        budget,
        allowedArtifactIds: getAllowedArtifactIds(input.referenceResolution),
      },
    });
    calls.push(call);

    if (call.toolName === "searchArtifacts" || call.toolName === "searchExercises") {
      input.trace.addStep({
        name: `${call.toolName} RAG 诊断`,
        type: "rag_query",
        status: call.status === "success" ? "success" : "failed",
        input: call.input,
        output: getDiagnosticsFromToolSummary(call.traceSummary),
        metadata: {
          readonlyToolCallId: call.id,
          toolName: call.toolName,
        },
      });
    }

    if (call.status === "failed") {
      stopReason = "tool_failure_fallback";
      break;
    }
  }

  if (stopReason === "model_finish" && decisionCallCount >= budget.maxSteps) {
    stopReason = "step_limit";
  }

  const bundle = buildBundle({
    calls,
    budget,
    stopReason,
    decisionCallCount,
    totalDurationMs: Date.now() - startedAt,
    timeout,
  });
  traceToolLoopSummary(input.trace, bundle, stopReason);

  return bundle;
}

export function formatReadonlyToolContextBundleForPrompt(bundle: ReadonlyToolContextBundle | null) {
  if (!bundle?.available) {
    return [
      "readonlyToolContext:",
      JSON.stringify({
        available: false,
        stopReason: bundle?.stopReason ?? "not_run",
      }, null, 2),
      "没有成功读取的数据库内容时，回复不得声称已经读取了历史 artifact 或动作库详情。",
    ].join("\n");
  }

  return [
    "readonlyToolContext:",
    JSON.stringify({
      available: true,
      stopReason: bundle.stopReason,
      truncated: bundle.truncated,
      calls: bundle.calls.map((call) => ({
        id: call.id,
        toolName: call.toolName,
        status: call.status,
        summary: call.modelSummary,
      })),
      modelContext: bundle.modelContext,
    }, null, 2),
    "只能引用 readonlyToolContext 中成功读取的摘要；不能声称读取了未成功读取或已失败的数据库内容。",
  ].join("\n");
}

function buildDecisionMessages(input: {
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  resolvedIntent: ResolvedChatIntent;
  referenceResolution: ReferenceResolution | null;
  trigger: ReadonlyToolLoopTrigger;
  calls: ExecutedToolCall[];
}) {
  return [
    {
      role: "system" as const,
      content: [
        "你是服务端只读工具选择器，只能返回 JSON 对象。",
        "你每次只能选择一个只读工具，或返回 finish。",
        "不要生成自然语言回答，不要请求写操作，不要使用标准 tools/tool_choice。",
        "可用工具:",
        JSON.stringify(listReadonlyToolDefinitions(), null, 2),
        "输出格式:",
        JSON.stringify({
          action: "call_tool",
          toolName: "searchArtifacts|getArtifactPayload|getExerciseById|searchExercises",
          input: {},
          reason: "为什么需要这个只读工具",
        }, null, 2),
        "或:",
        JSON.stringify({
          action: "finish",
          answerReadiness: "enough_context|needs_clarification|fallback",
          reason: "停止原因",
        }, null, 2),
      ].join("\n\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        trigger: input.trigger,
        latestUserMessage: input.conversationSummaryContext.latestUserMessage,
        conversationSummary: input.conversationSummaryContext.summary,
        resolvedIntent: input.resolvedIntent,
        referenceResolution: input.referenceResolution,
        previousToolCalls: input.calls.map((call) => ({
          toolName: call.toolName,
          status: call.status,
          summary: call.modelSummary,
          error: call.error,
        })),
        visibleMessages: input.messages,
      }, null, 2),
    },
  ];
}

function buildBundle(input: {
  calls: ExecutedToolCall[];
  budget: ControlledToolBudget;
  stopReason: ReadonlyToolContextBundle["stopReason"];
  decisionCallCount: number;
  totalDurationMs: number;
  timeout: boolean;
}): ReadonlyToolContextBundle {
  const successfulCalls = input.calls.filter((call) => call.status === "success" && call.modelSummary);
  const orderedCalls = [...successfulCalls].sort((left, right) => left.priority - right.priority);
  const selectedCalls: ExecutedToolCall[] = [];
  let modelContext: unknown[] = [];
  let serializedLength = 2;
  let truncated = false;

  for (const call of orderedCalls) {
    const nextContext = [...modelContext, { id: call.id, toolName: call.toolName, summary: call.modelSummary }];
    const nextLength = JSON.stringify(nextContext).length;

    if (nextLength > input.budget.maxBundleChars) {
      truncated = true;
      continue;
    }

    selectedCalls.push(call);
    modelContext = nextContext;
    serializedLength = nextLength;
  }

  return {
    enabled: true,
    available: modelContext.length > 0,
    stopReason: input.stopReason,
    decisionCallCount: input.decisionCallCount,
    toolExecutionCount: input.calls.length,
    totalDurationMs: input.totalDurationMs,
    stepLimitReached: input.stopReason === "step_limit",
    timeout: input.timeout,
    truncated,
    serializedLength,
    calls: input.calls,
    modelContext,
  };
}

function createEmptyBundle(input: {
  enabled: boolean;
  stopReason: ReadonlyToolContextBundle["stopReason"];
  totalDurationMs: number;
}): ReadonlyToolContextBundle {
  return {
    enabled: input.enabled,
    available: false,
    stopReason: input.stopReason,
    decisionCallCount: 0,
    toolExecutionCount: 0,
    totalDurationMs: input.totalDurationMs,
    stepLimitReached: false,
    timeout: false,
    truncated: false,
    serializedLength: 2,
    calls: [],
    modelContext: [],
  };
}

function traceToolLoopSummary(
  trace: AiTraceLogger,
  bundle: ReadonlyToolContextBundle,
  reason: string,
) {
  trace.addStep({
    name: "只读 Tool Loop 汇总",
    type: "tool_decision",
    status: bundle.stopReason === "tool_failure_fallback" || bundle.stopReason === "decision_failure_fallback" ? "failed" : "success",
    output: {
      available: bundle.available,
      stopReason: bundle.stopReason,
      decisionCallCount: bundle.decisionCallCount,
      toolExecutionCount: bundle.toolExecutionCount,
      totalDurationMs: bundle.totalDurationMs,
      stepLimitReached: bundle.stepLimitReached,
      timeout: bundle.timeout,
      truncated: bundle.truncated,
      serializedLength: bundle.serializedLength,
      modelContext: bundle.modelContext,
    },
    metadata: {
      model: aiRunTraceModel,
      skippedReason: bundle.toolExecutionCount === 0 && !bundle.available ? reason : undefined,
      retainedToolCallIds: bundle.modelContext
        .map((item) => typeof item === "object" && item && "id" in item ? String(item.id) : null)
        .filter(Boolean),
    },
  });
}

function getAllowedArtifactIds(referenceResolution: ReferenceResolution | null) {
  return referenceResolution?.status === "resolved"
    ? [referenceResolution.artifactId]
    : undefined;
}

function getDiagnosticsFromToolSummary(summary: unknown) {
  if (!summary || typeof summary !== "object" || !("diagnostics" in summary)) {
    return undefined;
  }

  return (summary as { diagnostics?: unknown }).diagnostics;
}
