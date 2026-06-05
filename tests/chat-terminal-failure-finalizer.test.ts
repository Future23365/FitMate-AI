import { describe, expect, it, vi } from "vitest";

import { createToolError } from "@/lib/server/agent-core/action-validator";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import type { AgentRunInput, AgentRunResult } from "@/lib/server/agent-core/contracts";
import type { PlannerModelTraceEvent } from "@/lib/server/agent-planners/model-adapters/model-adapter";
import {
  assessTerminalFailureFinalizerAvailability,
  buildTerminalFailureFinalizerInput,
  DeepSeekTerminalFailureFinalizer,
  parseTerminalFailureFinalizerOutput,
} from "@/lib/server/chat/terminal-failure-finalizer";
import {
  agentRuntimeConfig,
  buildTerminalFailureFinalizerSystemPrompt,
  terminalFailureFinalizerPromptConfig,
  terminalFailureFinalizerPromptVersion,
} from "@/lib/server/config";

describe("terminal failure finalizer contract", () => {
  it("keeps prompt separated from AgentAction tool loop and uses Chinese business instructions", () => {
    const prompt = buildTerminalFailureFinalizerSystemPrompt();

    expect(terminalFailureFinalizerPromptConfig.promptVersion).toBe(terminalFailureFinalizerPromptVersion);
    expect(prompt).toContain("主 Agent 已经耗尽内部修复机会");
    expect(prompt).toContain("本轮没有满足用户需求");
    expect(prompt).toContain("只能输出一个 JSON object");
    expect(prompt).toContain("字段只允许 `content` 和可选 `suggestedQuestions`");
    expect(prompt).toContain("不得输出 `AgentAction`、`tool_call`、`visibleOutputs`");
    expect(prompt).not.toContain("tools[].name");
    expect(prompt).not.toContain("toolName 只能复制");
  });

  it("validates output schema and rejects AgentAction-like or success-claiming payloads", () => {
    expect(parseTerminalFailureFinalizerOutput({
      content: "这次没有生成通过服务端校验的可靠结果。你可以补充目标后重试。",
      suggestedQuestions: ["补充训练目标后重试", "先说明当前可用事实"],
    })).toEqual({
      ok: true,
      output: {
        content: "这次没有生成通过服务端校验的可靠结果。你可以补充目标后重试。",
        suggestedQuestions: ["补充训练目标后重试", "先说明当前可用事实"],
      },
    });

    expect(parseTerminalFailureFinalizerOutput({ content: "" }).ok).toBe(false);
    expect(parseTerminalFailureFinalizerOutput({
      content: "这次没有生成通过服务端校验的可靠结果。",
      suggestedQuestions: ["一", "二", "三", "四"],
    }).ok).toBe(false);
    expect(parseTerminalFailureFinalizerOutput({
      content: "这次没有生成通过服务端校验的可靠结果。",
      visibleOutputs: [],
    }).ok).toBe(false);
    expect(parseTerminalFailureFinalizerOutput({
      content: "已经生成并保存你的训练计划。",
    }).ok).toBe(false);
    expect(parseTerminalFailureFinalizerOutput({
      content: "这次没有生成通过服务端校验的可靠结果，内部 code 是 repair_limit_exceeded。",
    }).ok).toBe(false);
  });

  it("uses centralized DeepSeek model while explicitly disabling Thinking Mode for failure finalization", async () => {
    const requestBodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestBodies.push(JSON.parse(String(init?.body)));

      return new Response(JSON.stringify({
        model: agentRuntimeConfig.llm.deepSeek.defaultModel,
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: "这次没有生成通过服务端校验的可靠结果。你可以补充训练目标后重试。",
                suggestedQuestions: ["补充训练目标后重试"],
              }),
            },
          },
        ],
      }), { status: 200 });
    });
    const finalizer = new DeepSeekTerminalFailureFinalizer({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await finalizer.finalize({
      failureCategory: "repair_exhausted",
      errorCode: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
      userRequestSummary: "用户希望生成训练计划。",
      unmetRequirements: [],
      blockedOutputs: [],
      verifiedFactsSummary: {},
      allowedResponseMode: "failure_explanation_only",
    });

    if (!result.ok) {
      throw new Error(`Expected finalizer success, got ${result.reason}`);
    }

    expect(requestBodies[0]).toMatchObject({
      model: agentRuntimeConfig.llm.deepSeek.defaultModel,
      thinking: { type: "disabled" },
    });
    expect(requestBodies[0]).not.toHaveProperty("reasoning_effort");
    expect(result.trace.request.thinking).toEqual({ type: "disabled" });
  });

  it("allows internal validation failures but rejects provider unavailable conditions", () => {
    expect(assessTerminalFailureFinalizerAvailability({
      providerConfigured: true,
      callsThisRun: 0,
      remainingTimeMs: agentRuntimeConfig.terminalFailureFinalizer.timeoutMs + 1,
      plannerDiagnostics: [],
      terminalError: createToolError(AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED, "repair exhausted"),
    })).toEqual({ allowed: true });

    expect(assessTerminalFailureFinalizerAvailability({
      providerConfigured: false,
      callsThisRun: 0,
      remainingTimeMs: agentRuntimeConfig.terminalFailureFinalizer.timeoutMs + 1,
      plannerDiagnostics: [],
    })).toMatchObject({
      allowed: false,
      reason: "model_config_missing",
    });

    expect(assessTerminalFailureFinalizerAvailability({
      providerConfigured: true,
      callsThisRun: 1,
      remainingTimeMs: agentRuntimeConfig.terminalFailureFinalizer.timeoutMs + 1,
      plannerDiagnostics: [],
    })).toMatchObject({
      allowed: false,
      reason: "max_calls_exceeded",
    });

    expect(assessTerminalFailureFinalizerAvailability({
      providerConfigured: true,
      callsThisRun: 0,
      remainingTimeMs: agentRuntimeConfig.terminalFailureFinalizer.timeoutMs - 1,
      plannerDiagnostics: [],
    })).toMatchObject({
      allowed: false,
      reason: "remaining_time_insufficient",
    });

    expect(assessTerminalFailureFinalizerAvailability({
      providerConfigured: true,
      callsThisRun: 0,
      remainingTimeMs: agentRuntimeConfig.terminalFailureFinalizer.timeoutMs + 1,
      plannerDiagnostics: [createProviderFailureDiagnostic(429)],
    })).toMatchObject({
      allowed: false,
      reason: "provider_quota_exhausted",
      providerDiagnosticCode: "429",
    });
  });

  it("builds a redacted structured input without planner executable context", () => {
    const input = buildTerminalFailureFinalizerInput({
      run: createRunInput(),
      result: createFailedRunResult(),
      failureCategory: "visible_output_validation",
    });
    const serialized = JSON.stringify(input);

    expect(input).toMatchObject({
      failureCategory: "visible_output_validation",
      errorCode: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
      allowedResponseMode: "failure_explanation_only",
    });
    expect(input.unmetRequirements.length).toBeGreaterThan(0);
    expect(input.blockedOutputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        outputType: "visibleTrainingProposal",
        reasonCode: "section_coverage_missing",
      }),
    ]));
    expect(serialized).not.toContain("inputJsonSchema");
    expect(serialized).not.toContain("PlannerInput");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("secret-token");
  });
});

function createRunInput(): AgentRunInput {
  return {
    runId: "chat_test",
    actor: { userId: "user-1" },
    userInput: "帮我生成一套训练",
    messages: [{ role: "user", content: "帮我生成一套训练" }],
    metadata: {},
    limits: {},
  };
}

function createFailedRunResult(): AgentRunResult {
  const terminalError = createToolError(
    AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
    "Agent runtime reached the invalid action repair limit.",
    {
      lastCode: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
      outputType: "visibleTrainingProposal",
      code: "section_coverage_missing",
      authorization: "secret-token",
    },
  );

  return {
    runId: "chat_test",
    status: "failed",
    terminalError,
    toolResults: [],
    observations: [
      {
        type: "runtime_error",
        source: "runtime",
        ok: false,
        content: {
          code: "section_coverage_missing",
          outputType: "visibleTrainingProposal",
          message: "缺少 warmup 和 stretch。",
        },
      },
    ],
    traceEvents: [
      {
        type: "validation_result",
        step: 2,
        ok: false,
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
      },
      {
        type: "budget_event",
        budget: "repair_attempts",
        status: "exhausted",
        used: 2,
        limit: 1,
        step: 2,
        reason: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
      },
    ],
    steps: 2,
  };
}

function createProviderFailureDiagnostic(status: number): PlannerModelTraceEvent {
  return {
    provider: "deepseek",
    adapterName: "deepseek-model-adapter",
    plannerCallIndex: 1,
    runtimeStep: 1,
    runId: "chat_test",
    request: {
      model: agentRuntimeConfig.llm.deepSeek.defaultModel,
      response_format: { type: "json_object" },
      messageCount: 1,
      messages: [],
      run: {
        runId: "chat_test",
        step: 1,
        latestUserMessage: "帮我生成计划",
        messageCount: 1,
        observationCount: 0,
        toolResultCount: 0,
        successfulLightweightObservationCount: 0,
        repairDiagnosticObservationCount: 0,
        toolResultProjectionCount: 0,
        toolResultProjectionPresence: [],
        toolCount: 3,
        toolNames: ["searchExerciseResources"],
      },
    },
    response: {
      model: agentRuntimeConfig.llm.deepSeek.defaultModel,
      httpStatus: status,
      status: "http_error",
    },
    parseStatus: "http_error",
    failureCode: "deepseek_http_error",
  };
}
