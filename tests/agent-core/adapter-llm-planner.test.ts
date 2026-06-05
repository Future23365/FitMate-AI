import { describe, expect, it, vi } from "vitest";

import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { toTerminalToolResultRefs, type ToolResult } from "@/lib/server/agent-core/contracts";
import {
  createToolObservation,
  SUCCESSFUL_TOOL_RESULT_INDEX_OBSERVATION_ROLE,
  TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
} from "@/lib/server/agent-core/observation";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { createM0FixtureToolRegistry } from "@/lib/server/agent-tools";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { DeepSeekModelAdapter } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import { FakeModelAdapter } from "@/lib/server/agent-planners/model-adapters/model-adapter";
import {
  agentRuntimeConfig,
  agentLlmPromptConfig,
  buildAgentActionSystemPrompt,
  type AgentLlmPromptConfig,
} from "@/lib/server/config";

function deepSeekResponse(content: string, status = 200) {
  return new Response(JSON.stringify({
    model: "deepseek-chat",
    choices: [
      {
        message: {
          content,
        },
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 4,
    },
  }), { status });
}

function captureDeepSeekRequestBodies(content: string) {
  const requestBodies: unknown[] = [];
  const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return deepSeekResponse(content);
  });

  return { fetchImpl, requestBodies };
}

describe("agent-planners LlmPlanner and model adapters", () => {
  it("uses a fake ModelAdapter without changing agent-core runtime", async () => {
    const registry = createM0FixtureToolRegistry();
    const toolInput = { fixtureId: "adapter-fixture" };
    const expectedToolResultId = createToolResultId("run-fake-adapter", "readFixture", hashNormalizedInput(toolInput));
    const adapter = new FakeModelAdapter([
      { type: "tool_call", toolName: "readFixture", input: toolInput },
      {
        type: "final_answer",
        content: "fake adapter completed.",
        usedRefs: toTerminalToolResultRefs([expectedToolResultId]),
      },
    ]);
    const planner = new LlmPlanner(adapter);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-fake-adapter",
        actor: {},
        userInput: "read fixture",
      },
    });

    expect(result.status).toBe("completed");
    expect(adapter.calls).toHaveLength(2);
    expect(planner.completions.map((completion) => completion.model)).toEqual(["fake-model-adapter", "fake-model-adapter"]);
    expect(planner.getModelTraceEvents()).toEqual([]);
  });

  it("parses DeepSeek JSON action candidates through the adapter boundary", async () => {
    const fetchImpl = vi.fn(async () => deepSeekResponse(JSON.stringify({
      type: "final_answer",
      content: "deepseek parsed.",
    })));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const completion = await adapter.completeAction({
      run: {
        runId: "run-deepseek-parse",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    });

    expect(completion.actionCandidate).toEqual({
      type: "final_answer",
      content: "deepseek parsed.",
    });
    expect(completion.usage).toEqual({
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16,
    });
    expect(completion.trace).toMatchObject({
      provider: "deepseek",
      adapterName: "deepseek-model-adapter",
      parseStatus: "parsed",
      actionType: "final_answer",
      request: {
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        timeoutMs: agentRuntimeConfig.llm.timeoutMs,
        messageCount: 2,
        run: {
          runId: "run-deepseek-parse",
          step: 1,
          toolCount: 0,
        },
      },
      response: {
        model: "deepseek-chat",
        status: "parsed",
        rawTextLength: expect.any(Number),
      },
      parsedAction: {
        type: "final_answer",
        content: "deepseek parsed.",
      },
      tokenUsage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
      },
    });
    expect(JSON.stringify(completion.trace)).not.toContain("test-key");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps long DeepSeek request message diagnostics as chunked trace text", async () => {
    const { fetchImpl, requestBodies } = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "chunked trace captured.",
    }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const longMessages = Array.from({ length: 36 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `第 ${index + 1} 轮对话，包含用于复盘的训练限制和上下文。${"需要完整保留尾部约束。".repeat(20)}`,
    }));

    const completion = await adapter.completeAction({
      run: {
        runId: "run-deepseek-long-trace",
        actor: {},
        userInput: "总结这段长上下文",
        messages: longMessages,
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    });
    const body = requestBodies[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const sentUserContent = body.messages[1].content;
    const traceContent = completion.trace?.request.messages[1]?.content as Record<string, unknown>;
    const chunks = traceContent.chunks as Array<Record<string, unknown>>;

    expect(sentUserContent.length).toBeGreaterThan(agentRuntimeConfig.trace.modelTraceMaxStringLength);
    expect(traceContent).toMatchObject({
      kind: "trace_long_text",
      contentType: "model_request_message",
      originalLength: sentUserContent.length,
      chunkSize: agentRuntimeConfig.trace.modelTraceLongTextChunkLength,
      redacted: false,
    });
    expect(completion.trace?.request.messages[1]).toMatchObject({
      contentLength: sentUserContent.length,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => (
      typeof chunk.text === "string"
      && chunk.text.length <= agentRuntimeConfig.trace.modelTraceLongTextChunkLength
    ))).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(sentUserContent);
    expect(chunks.map((chunk) => chunk.text).join("").endsWith(sentUserContent.slice(-160))).toBe(true);
    expect(JSON.stringify(traceContent)).not.toContain("...[truncated]");
    expect(JSON.stringify(completion.trace)).not.toContain("test-key");
  });

  it("serializes satisfied success facts only through toolResults and records input dedupe trace", async () => {
    const { fetchImpl, requestBodies } = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "facts consumed.",
      usedRefs: toTerminalToolResultRefs(["tr_projection"]),
    }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const successResult: ToolResult = {
      toolResultId: "tr_projection",
      toolName: "readFixture",
      toolVersion: "0.1.0",
      toolCallId: "tc_projection",
      idempotencyKey: "idem_projection",
      normalizedInputHash: "hash_projection",
      startedAt: "2026-06-05T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z",
      ok: true,
      output: "[redacted]",
      projection: {
        model: {
          factText: "权威成功事实只应在 toolResults 中出现。",
        },
      },
      fulfillment: {
        satisfied: true,
        summary: "读取成功。",
      },
    };
    const observation = createToolObservation(successResult);

    const completion = await adapter.completeAction({
      run: {
        runId: "run-deepseek-deduped-input",
        actor: {},
        userInput: "answer from facts",
      },
      step: 2,
      manifests: [],
      observations: [observation],
      toolResults: [successResult],
    });
    const body = requestBodies[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const modelInput = JSON.parse(body.messages[1].content) as {
      observations: unknown[];
      toolResults: unknown[];
    };

    expect(JSON.stringify(modelInput.observations)).toContain(SUCCESSFUL_TOOL_RESULT_INDEX_OBSERVATION_ROLE);
    expect(JSON.stringify(modelInput.observations)).toContain(TOOL_RESULT_MODEL_PROJECTION_CHANNEL);
    expect(JSON.stringify(modelInput.observations)).not.toContain("权威成功事实只应在 toolResults 中出现");
    expect(JSON.stringify(modelInput.toolResults)).toContain("权威成功事实只应在 toolResults 中出现");
    expect(JSON.stringify(modelInput.toolResults)).not.toContain("raw handler output");
    expect(completion.trace?.request.run).toMatchObject({
      observationCount: 1,
      toolResultCount: 1,
      successfulLightweightObservationCount: 1,
      repairDiagnosticObservationCount: 0,
      toolResultProjectionCount: 1,
      toolResultProjectionPresence: [
        {
          toolResultId: "tr_projection",
          toolName: "readFixture",
          satisfied: true,
          hasModelProjection: true,
        },
      ],
    });
  });

  it("records invalid_json and invalid_action_schema diagnostics without sensitive request fields", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(deepSeekResponse("not json"))
      .mockResolvedValueOnce(deepSeekResponse(JSON.stringify({
        type: "tool_call",
        input: { query: "胸" },
      })));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const invalidJson = await adapter.completeAction({
      run: {
        runId: "run-deepseek-invalid-json",
        actor: {},
        userInput: "Bearer secret-token-value",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    });
    const invalidSchema = await adapter.completeAction({
      run: {
        runId: "run-deepseek-invalid-schema",
        actor: {},
        userInput: "answer",
      },
      step: 2,
      manifests: [],
      observations: [],
      toolResults: [],
    });

    expect(invalidJson.trace).toMatchObject({
      parseStatus: "invalid_json",
      failureCode: "invalid_json",
      response: {
        status: "invalid_json",
        rawText: "not json",
      },
    });
    expect(invalidSchema.trace).toMatchObject({
      parseStatus: "invalid_action_schema",
      failureCode: "invalid_action_schema",
      actionType: "tool_call",
      parsedAction: {
        type: "tool_call",
        input: { query: "胸" },
      },
    });
    expect(JSON.stringify(invalidJson.trace)).not.toContain("Bearer secret-token-value");
    expect(JSON.stringify(invalidJson.trace)).not.toContain("test-key");
  });

  it("builds DeepSeek request body from the default Agent LLM prompt config", async () => {
    const { fetchImpl, requestBodies } = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "default prompt configured.",
    }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await adapter.completeAction({
      run: {
        runId: "run-deepseek-default-prompt",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    });

    const body = requestBodies[0] as {
      temperature: number;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.temperature).toBe(agentLlmPromptConfig.requestDefaults.temperature);
    expect(body.max_tokens).toBe(agentLlmPromptConfig.requestDefaults.maxTokens);
    expect(body.temperature).toBe(agentRuntimeConfig.llm.temperature);
    expect(body.max_tokens).toBe(agentRuntimeConfig.llm.maxTokens);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: buildAgentActionSystemPrompt(agentLlmPromptConfig),
    });
  });

  it("uses injected prompt config for DeepSeek request body without mutating defaults", async () => {
    const customPromptConfig: AgentLlmPromptConfig = {
      promptVersion: "agent-action-custom-test",
      systemPromptInstructions: [
        "返回测试专用 AgentAction JSON object。",
        "这个 adapter 测试只期望 final_answer。",
      ],
      requestDefaults: {
        temperature: 0.4,
        maxTokens: 456,
      },
    };
    const { fetchImpl, requestBodies } = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "custom prompt configured.",
    }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
      promptConfig: customPromptConfig,
    });

    await adapter.completeAction({
      run: {
        runId: "run-deepseek-custom-prompt",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    });

    const body = requestBodies[0] as {
      temperature: number;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.temperature).toBe(customPromptConfig.requestDefaults.temperature);
    expect(body.max_tokens).toBe(customPromptConfig.requestDefaults.maxTokens);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: buildAgentActionSystemPrompt(customPromptConfig),
    });
    expect(buildAgentActionSystemPrompt()).toBe(buildAgentActionSystemPrompt(agentLlmPromptConfig));
  });

  it("feeds invalid DeepSeek output back through validator repair instead of keyword fallback", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(deepSeekResponse("not json"))
      .mockResolvedValueOnce(deepSeekResponse(JSON.stringify({
        type: "final_answer",
        content: "repaired.",
      })));
    const planner = new LlmPlanner(new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    }));

    const result = await runAgentRuntime({
      registry: createM0FixtureToolRegistry(),
      planner,
      run: {
        runId: "run-deepseek-repair",
        actor: {},
        userInput: "return invalid first",
        limits: {
          maxInvalidActions: 1,
          maxSteps: 3,
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "invalid_action",
        content: expect.objectContaining({ code: AGENT_ERROR_CODES.INVALID_ACTION }),
      }),
    ]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(planner.getModelTraceEvents()).toHaveLength(2);
    expect(planner.getModelTraceEvents()[0]).toMatchObject({
      plannerCallIndex: 1,
      runtimeStep: 1,
      parseStatus: "invalid_json",
      failureCode: "invalid_json",
    });
  });
});
