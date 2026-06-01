import type { AiTrace, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

const baseTime = "2026-06-01T08:00:00.000Z";

// createAgentTraceFixture 生成稳定的 Agent trace 样本，用于验证 Tool-first 诊断视图的派生逻辑。
export function createAgentTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return {
    id: "trace-agent-success",
    runId: "agent-run-1",
    route: "/api/chat",
    title: "Agent 生成训练计划",
    status: "success",
    createdAt: baseTime,
    endedAt: "2026-06-01T08:00:02.000Z",
    durationMs: 2000,
    userId: "user-1",
    sessionId: "session-1",
    messageId: "message-1",
    model: "deepseek-v4-flash",
    promptVersion: "2026-05-30.chat-trace-v1",
    input: {
      latestUserMessage: "帮我生成一个背部训练",
    },
    steps: [
      createTraceStep({
        id: "step-context",
        name: "agent_run_started",
        type: "agent_context",
        input: {
          latestUserMessage: "帮我生成一个背部训练",
          recentArtifacts: [],
          legacyPathSkip: {
            intentFirst: true,
            normalize: true,
          },
        },
        metadata: {
          runId: "agent-run-1",
          legacyPathSkip: {
            intentFirst: true,
            normalize: true,
          },
        },
      }),
      createTraceStep({
        id: "step-decision-0",
        name: "agent_tool_decision",
        type: "agent_tool_decision",
        input: {
          action: "call_tool",
          toolName: "searchExercises",
          input: {
            goal: "背部增肌",
            equipment: "哑铃",
          },
          reason: "需要动作候选。",
        },
        metadata: {
          stepIndex: 0,
          aiStage: "agent_tool_decision",
        },
      }),
      createTraceStep({
        id: "step-result-0",
        name: "agent_tool_result",
        type: "agent_tool_result",
        output: {
          status: "success",
          candidateSetId: "candidate-set-1",
          summary: "返回 8 个背部动作候选。",
        },
        metadata: {
          stepIndex: 0,
          toolResultId: "tool-result-1",
          candidateSetId: "candidate-set-1",
        },
      }),
      createTraceStep({
        id: "step-decision-1",
        name: "agent_tool_decision",
        type: "agent_tool_decision",
        input: {
          action: "call_tool",
          toolName: "validateRoutineDraft",
          input: {
            candidateSetId: "candidate-set-1",
            draftId: "draft-1",
          },
          reason: "写入前校验计划草稿。",
        },
        metadata: {
          stepIndex: 1,
          aiStage: "agent_tool_decision",
        },
      }),
      createTraceStep({
        id: "step-result-1",
        name: "agent_tool_result",
        type: "agent_tool_result",
        output: {
          status: "success",
          candidateSetId: "candidate-set-1",
          validationId: "validation-1",
          summary: "计划草稿通过校验。",
        },
        metadata: {
          stepIndex: 1,
          toolResultId: "tool-result-2",
          candidateSetId: "candidate-set-1",
          validationId: "validation-1",
        },
      }),
      createTraceStep({
        id: "step-final",
        name: "agent_final_result",
        type: "agent_final_result",
        output: {
          status: "generated",
          usedToolResultIds: ["tool-result-1", "tool-result-2"],
          validationId: "validation-1",
          revisionId: "revision-1",
          artifact: {
            title: "背部训练",
          },
        },
      }),
      createTraceStep({
        id: "step-response",
        name: "agent_response_writer",
        type: "response_write",
        output: {
          content: "已生成「背部训练」，并通过训练结构校验。",
          references: [
            { kind: "tool_result", id: "tool-result-2" },
            { kind: "revision", id: "revision-1" },
          ],
        },
        metadata: {
          aiStage: "agent_response_writer",
        },
      }),
    ],
    finalDecision: {
      status: "success",
      responseType: "generated",
    },
    ...overrides,
  };
}

// createLegacyTraceFixture 生成没有 Agent stages 的旧 trace，用于验证 legacy fallback 不被误判为失败。
export function createLegacyTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-legacy",
    runId: "legacy-run-1",
    title: "Legacy 意图链路",
    steps: [
      createTraceStep({
        id: "legacy-user",
        name: "用户输入",
        type: "user_input",
        input: {
          latestUserMessage: "推荐一个练背动作",
        },
      }),
      createTraceStep({
        id: "legacy-intent",
        name: "意图识别",
        type: "intent",
        output: {
          type: "exercise_recommendation",
        },
      }),
      createTraceStep({
        id: "legacy-response",
        name: "最终回复",
        type: "final_response",
        output: {
          content: "可以试试坐姿划船。",
        },
      }),
    ],
    ...overrides,
  });
}

// createAgentPatchTraceFixture 覆盖 Agent patch 成功链路，验证 revision、validation 和 policy id 可以关联。
export function createAgentPatchTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-agent-patch",
    title: "Agent 修改训练计划",
    steps: [
      createTraceStep({ id: "patch-context", name: "agent_run_started", type: "agent_context" }),
      createTraceStep({
        id: "patch-decision",
        name: "agent_tool_decision",
        type: "agent_tool_decision",
        input: {
          action: "call_tool",
          toolName: "applyWorkoutPatch",
          input: {
            candidateSetId: "candidate-set-patch",
            validationId: "validation-patch",
            policyDecisionId: "policy-patch",
          },
        },
        metadata: { stepIndex: 0 },
      }),
      createTraceStep({
        id: "patch-result",
        name: "agent_tool_result",
        type: "agent_tool_result",
        output: {
          status: "success",
          revisionId: "revision-patch",
          validationId: "validation-patch",
          policyDecisionId: "policy-patch",
          summary: "已替换目标动作。",
        },
        metadata: {
          stepIndex: 0,
          toolResultId: "tool-result-patch",
          revisionId: "revision-patch",
          validationId: "validation-patch",
          policyDecisionId: "policy-patch",
        },
      }),
      createTraceStep({
        id: "patch-final",
        name: "agent_final_result",
        type: "agent_final_result",
        output: {
          status: "patched",
          usedToolResultIds: ["tool-result-patch"],
          revisionId: "revision-patch",
          validationId: "validation-patch",
          policyDecisionId: "policy-patch",
          artifact: { title: "背部训练" },
          patchResult: { summary: "跳绳已替换为划船。" },
        },
      }),
    ],
    ...overrides,
  });
}

// createAgentClarificationTraceFixture 覆盖 Agent 澄清结果，不要求产生写入资源。
export function createAgentClarificationTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-agent-clarification",
    title: "Agent 需要澄清",
    steps: [
      createTraceStep({ id: "clarify-context", name: "agent_run_started", type: "agent_context" }),
      createTraceStep({
        id: "clarify-final",
        name: "agent_final_result",
        type: "agent_final_result",
        output: {
          status: "needs_clarification",
          question: "你想练上背还是下背？",
          assistantSuggestions: [
            { label: "上背", message: "我想练上背" },
            { label: "下背", message: "我想练下背" },
          ],
          usedToolResultIds: [],
        },
      }),
      createTraceStep({
        id: "clarify-response",
        name: "agent_response_writer",
        type: "response_write",
        output: { content: "你想练上背还是下背？" },
        metadata: { aiStage: "agent_response_writer" },
      }),
    ],
    ...overrides,
  });
}

// createAgentValidationBlockedTraceFixture 覆盖 validation blocked，验证 domain gate 失败可以聚合。
export function createAgentValidationBlockedTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-agent-validation-blocked",
    title: "Agent 校验阻断",
    steps: [
      createTraceStep({ id: "validation-context", name: "agent_run_started", type: "agent_context" }),
      createTraceStep({
        id: "validation-result",
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        output: {
          status: "failed",
          validationId: "validation-blocked",
          message: "动作 id 不来自候选集合。",
        },
        error: {
          code: "validation_failed",
          message: "Routine draft failed deterministic validation.",
        },
        metadata: {
          stepIndex: 0,
          toolResultId: "tool-result-validation-blocked",
          validationId: "validation-blocked",
        },
      }),
      createTraceStep({
        id: "validation-final",
        name: "agent_final_result",
        type: "agent_final_result",
        output: {
          status: "blocked",
          blockReason: "计划草稿没有通过服务端校验。",
          usedToolResultIds: ["tool-result-validation-blocked"],
          validationId: "validation-blocked",
          recoverySuggestions: ["换一个目标或缩小范围"],
        },
      }),
    ],
    ...overrides,
  });
}

// createAgentToolParseFailureTraceFixture 覆盖模型 tool decision 解析失败。
export function createAgentToolParseFailureTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-agent-tool-parse-failure",
    title: "Agent 工具决策解析失败",
    status: "failed",
    steps: [
      createTraceStep({ id: "parse-context", name: "agent_run_started", type: "agent_context" }),
      createTraceStep({
        id: "parse-failure",
        name: "agent_tool_decision_parse_failed",
        type: "agent_tool_decision",
        status: "failed",
        input: { rawDecision: "{ invalid json" },
        error: {
          code: "model_output_invalid",
          message: "Agent tool decision is not valid JSON.",
        },
        metadata: {
          stepIndex: 0,
          failureCode: "model_output_invalid",
        },
      }),
    ],
    finalDecision: {
      status: "recoverable_failure",
      code: "model_output_invalid",
      reason: "Agent tool decision is not valid JSON.",
    },
    ...overrides,
  });
}

// createAgentPersistenceFailureTraceFixture 覆盖持久化失败，验证 persistence boundary 可以定位。
export function createAgentPersistenceFailureTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-agent-persistence-failure",
    title: "Agent 持久化失败",
    status: "failed",
    steps: [
      createTraceStep({ id: "persist-context", name: "agent_run_started", type: "agent_context" }),
      createTraceStep({
        id: "persist-result",
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        output: {
          status: "failed",
          validationId: "validation-persist",
          policyDecisionId: "policy-persist",
          message: "revision 保存失败。",
        },
        error: {
          code: "persistence_failed",
          message: "Failed to persist workout revision.",
        },
        metadata: {
          stepIndex: 0,
          toolResultId: "tool-result-persist",
          validationId: "validation-persist",
          policyDecisionId: "policy-persist",
        },
      }),
    ],
    finalDecision: {
      status: "hard_failure",
      code: "persistence_failed",
      reason: "Failed to persist workout revision.",
    },
    ...overrides,
  });
}

// createAgentResponseWriterMismatchTraceFixture 覆盖 Response Writer 引用未执行资源的诊断场景。
export function createAgentResponseWriterMismatchTraceFixture(overrides: Partial<AiTrace> = {}): AiTrace {
  return createAgentTraceFixture({
    id: "trace-agent-response-writer-mismatch",
    title: "Agent 回复与执行结果不一致",
    steps: [
      createTraceStep({ id: "mismatch-context", name: "agent_run_started", type: "agent_context" }),
      createTraceStep({
        id: "mismatch-final",
        name: "agent_final_result",
        type: "agent_final_result",
        output: {
          status: "generated",
          usedToolResultIds: ["missing-tool-result"],
          validationId: "missing-validation",
          revisionId: "missing-revision",
          artifact: { title: "未真实保存的计划" },
        },
      }),
      createTraceStep({
        id: "mismatch-response",
        name: "agent_response_writer",
        type: "response_write",
        output: {
          content: "已生成并保存「未真实保存的计划」。",
          references: [
            { kind: "tool_result", id: "missing-tool-result" },
            { kind: "revision", id: "missing-revision" },
          ],
        },
        metadata: { aiStage: "agent_response_writer" },
      }),
    ],
    ...overrides,
  });
}

// createTraceStep 让 fixture 只覆盖与测试相关的字段，其余字段保持稳定默认值。
export function createTraceStep(input: Partial<AiTraceStep> & Pick<AiTraceStep, "id" | "name" | "type">): AiTraceStep {
  return {
    status: "success",
    startedAt: baseTime,
    endedAt: "2026-06-01T08:00:00.100Z",
    durationMs: 100,
    ...input,
  };
}
