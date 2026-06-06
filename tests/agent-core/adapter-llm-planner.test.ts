import { describe, expect, it, vi } from "vitest";

import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { toTerminalToolResultRefs, type ToolResult } from "@/lib/server/agent-core/contracts";
import type { PlannerInput } from "@/lib/server/agent-core/planner-port";
import {
  createToolObservation,
  OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE,
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
  defaultAgentActionContract,
  getAgentActionContract,
  visibleTrainingProposalOutputContract,
  type AgentLlmPromptConfig,
} from "@/lib/server/config";

function deepSeekResponse(
  content: string,
  status = 200,
  options: { model?: string; reasoningContent?: string } = {},
) {
  return new Response(JSON.stringify({
    model: options.model ?? agentRuntimeConfig.llm.deepSeek.defaultModel,
    choices: [
      {
        message: {
          content,
          reasoning_content: options.reasoningContent,
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

type PlannerInputWithoutContext = Omit<PlannerInput, "context">;

function withPlannerContext(input: PlannerInputWithoutContext): PlannerInput {
  const context = {
    run: input.run,
    step: input.step,
    manifests: input.manifests,
    observations: input.observations,
    toolResults: input.toolResults,
  };

  return {
    ...input,
    context,
  };
}

// createBasicPlannerInput 保持 adapter 单测聚焦 provider request contract，不引入业务 tool 或 runtime 语义。
function createBasicPlannerInput(runId: string, thinkingEnabled?: boolean) {
  return withPlannerContext({
    run: {
      runId,
      actor: {},
      userInput: "answer",
      metadata: typeof thinkingEnabled === "boolean" ? { thinkingEnabled } : undefined,
    },
    step: 1,
    manifests: [],
    observations: [],
    toolResults: [],
  });
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

    const completion = await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-parse",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    }));

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
        model: agentRuntimeConfig.llm.deepSeek.defaultModel,
        response_format: { type: "json_object" },
        thinking: {
          type: "enabled",
          enabled: true,
          reasoning_effort: agentRuntimeConfig.llm.deepSeek.thinking.reasoningEffort,
        },
        timeoutMs: agentRuntimeConfig.llm.timeoutMs,
        layers: {
          protocol: {
            present: true,
            promptVersion: agentLlmPromptConfig.promptVersion,
            actionContractSchemaId: "AgentAction",
            actionContractSchemaVersion: "1",
            outputContractCount: 1,
          },
          context: {
            present: true,
            keys: ["run", "step", "tools", "observations", "toolResults"],
            toolCount: 0,
            observationCount: 0,
            toolResultCount: 0,
          },
          repairContext: {
            present: false,
            errorCount: 0,
            factCount: 0,
          },
        },
        messageCount: 2,
        run: {
          runId: "run-deepseek-parse",
          step: 1,
          toolCount: 0,
        },
      },
      response: {
        model: agentRuntimeConfig.llm.deepSeek.defaultModel,
        status: "parsed",
        rawTextLength: expect.any(Number),
        reasoning: {
          received: false,
          contentLength: 0,
          source: "choices[0].message.reasoning_content",
        },
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

  it("uses centralized DeepSeek defaults and keeps constructor model override explicit", async () => {
    const defaultCapture = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "default model.",
    }));
    const defaultAdapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: defaultCapture.fetchImpl as typeof fetch,
    });
    const overrideCapture = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "override model.",
    }));
    const overrideAdapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      fetchImpl: overrideCapture.fetchImpl as typeof fetch,
    });

    await defaultAdapter.completeAction(createBasicPlannerInput("run-deepseek-default-model"));
    await overrideAdapter.completeAction(createBasicPlannerInput("run-deepseek-override-model"));

    expect(defaultCapture.requestBodies[0]).toMatchObject({
      model: agentRuntimeConfig.llm.deepSeek.defaultModel,
    });
    expect(overrideCapture.requestBodies[0]).toMatchObject({
      model: "deepseek-v4-pro",
    });
  });

  it("maps thinkingEnabled metadata to DeepSeek Thinking Mode request parameters", async () => {
    const enabledCapture = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "thinking enabled.",
    }));
    const enabledAdapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: enabledCapture.fetchImpl as typeof fetch,
    });
    const disabledCapture = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "thinking disabled.",
    }));
    const disabledAdapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: disabledCapture.fetchImpl as typeof fetch,
    });

    const enabledCompletion = await enabledAdapter.completeAction(createBasicPlannerInput("run-deepseek-thinking-on", true));
    const disabledCompletion = await disabledAdapter.completeAction(createBasicPlannerInput("run-deepseek-thinking-off", false));

    expect(enabledCapture.requestBodies[0]).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: agentRuntimeConfig.llm.deepSeek.thinking.reasoningEffort,
    });
    expect(enabledCompletion.trace?.request.thinking).toEqual({
      type: "enabled",
      enabled: true,
      reasoning_effort: agentRuntimeConfig.llm.deepSeek.thinking.reasoningEffort,
    });
    expect(disabledCapture.requestBodies[0]).toMatchObject({
      thinking: { type: "disabled" },
    });
    expect(disabledCapture.requestBodies[0]).not.toHaveProperty("reasoning_effort");
    expect(disabledCompletion.trace?.request.thinking).toEqual({
      type: "disabled",
      enabled: false,
    });
  });

  it("builds DeepSeek request and trace from the context layer instead of compatibility fields", async () => {
    const { fetchImpl, requestBodies } = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "context layer used.",
    }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const input: PlannerInput = {
      run: {
        runId: "run-stale-top-level",
        actor: {},
        userInput: "stale top-level input",
        metadata: { thinkingEnabled: true },
      },
      step: 99,
      manifests: [],
      observations: [],
      toolResults: [],
      context: {
        run: {
          runId: "run-context-layer",
          actor: {},
          userInput: "context layer input",
          metadata: { thinkingEnabled: false },
        },
        step: 3,
        manifests: [],
        observations: [],
        toolResults: [],
      },
    };

    const completion = await adapter.completeAction(input);
    const body = requestBodies[0] as {
      thinking: { type: "enabled" | "disabled" };
      messages: Array<{ content: string }>;
    };
    const userPayload = JSON.parse(body.messages[1].content) as {
      context: {
        run: {
          runId: string;
          userInput: string;
        };
        step: number;
      };
    };

    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(userPayload.context.run).toMatchObject({
      runId: "run-context-layer",
      userInput: "context layer input",
    });
    expect(userPayload.context.step).toBe(3);
    expect(JSON.stringify(userPayload)).not.toContain("run-stale-top-level");
    expect(completion.trace?.request.run).toMatchObject({
      runId: "run-context-layer",
      step: 3,
      latestUserMessage: "context layer input",
    });
    expect(completion.trace?.request.thinking).toEqual({
      type: "disabled",
      enabled: false,
    });
  });

  it("parses AgentAction from content while keeping reasoning_content as trace diagnostics only", async () => {
    const hiddenReasoning = "内部 reasoning 内容不应进入用户可见 action。";
    const fetchImpl = vi.fn(async () => deepSeekResponse(JSON.stringify({
      type: "final_answer",
      content: "正式 content 被解析。",
      suggestedQuestions: ["继续训练？"],
    }), 200, { reasoningContent: hiddenReasoning }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const completion = await adapter.completeAction(createBasicPlannerInput("run-deepseek-reasoning-trace", true));

    expect(completion.actionCandidate).toEqual({
      type: "final_answer",
      content: "正式 content 被解析。",
      suggestedQuestions: ["继续训练？"],
    });
    expect(completion.rawText).toContain("正式 content 被解析。");
    expect(completion.rawText).not.toContain(hiddenReasoning);
    expect(JSON.stringify(completion.trace?.response?.rawText)).not.toContain(hiddenReasoning);
    expect(completion.trace?.response?.reasoning).toMatchObject({
      received: true,
      contentLength: hiddenReasoning.length,
      rawText: hiddenReasoning,
      source: "choices[0].message.reasoning_content",
    });
    expect(JSON.stringify(completion.actionCandidate)).not.toContain(hiddenReasoning);
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

    const completion = await adapter.completeAction(withPlannerContext({
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
    }));
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

    const completion = await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-deduped-input",
        actor: {},
        userInput: "answer from facts",
      },
      step: 2,
      manifests: [],
      observations: [observation],
      toolResults: [successResult],
    }));
    const body = requestBodies[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const modelInput = JSON.parse(body.messages[1].content) as {
      context: {
        observations: unknown[];
        toolResults: unknown[];
      };
    };

    expect(JSON.stringify(modelInput.context.observations)).toContain(OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE);
    expect(JSON.stringify(modelInput.context.observations)).toContain(TOOL_RESULT_MODEL_PROJECTION_CHANNEL);
    expect(JSON.stringify(modelInput.context.observations)).not.toContain("权威成功事实只应在 toolResults 中出现");
    expect(JSON.stringify(modelInput.context.toolResults)).toContain("权威成功事实只应在 toolResults 中出现");
    expect(JSON.stringify(modelInput.context.toolResults)).not.toContain("raw handler output");
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

    const invalidJson = await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-invalid-json",
        actor: {},
        userInput: "Bearer secret-token-value",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    }));
    const invalidSchema = await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-invalid-schema",
        actor: {},
        userInput: "answer",
      },
      step: 2,
      manifests: [],
      observations: [],
      toolResults: [],
    }));

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

    await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-default-prompt",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    }));

    const body = requestBodies[0] as {
      temperature: number;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.temperature).toBe(agentLlmPromptConfig.requestDefaults.temperature);
    expect(body.max_tokens).toBe(agentLlmPromptConfig.requestDefaults.maxTokens);
    expect(body.temperature).toBe(agentRuntimeConfig.llm.temperature);
    expect(body.max_tokens).toBe(agentRuntimeConfig.llm.maxTokens);
    expect(body.messages[0]).toMatchObject({
      role: "system",
    });
    expect(body.messages[0].content).toContain(buildAgentActionSystemPrompt(agentLlmPromptConfig));
    expect(body.messages[0].content).toContain("稳定协议层 protocol");
    expect(body.messages[0].content).toContain("\"actionContract\"");
    expect(body.messages[0].content).toContain("\"outputContracts\"");
  });

  it("separates protocol from current facts in the DeepSeek Planner request", async () => {
    const { fetchImpl, requestBodies } = captureDeepSeekRequestBodies(JSON.stringify({
      type: "final_answer",
      content: "output contracts visible.",
    }));
    const adapter = new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const completion = await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-output-contracts",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    }));

    const body = requestBodies[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const modelInput = JSON.parse(body.messages[1].content) as {
      context: {
        tools: unknown[];
        observations: unknown[];
        toolResults: unknown[];
      };
      actionContract?: unknown;
      outputContracts?: unknown[];
    };

    expect(Object.keys(modelInput)).toEqual([
      "context",
    ]);
    expect(Object.keys(modelInput.context)).toEqual([
      "observations",
      "run",
      "step",
      "toolResults",
      "tools",
    ]);
    expect(modelInput).not.toHaveProperty("actionContract");
    expect(modelInput).not.toHaveProperty("outputContracts");
    expect(modelInput.context.tools).toEqual([]);
    expect(modelInput.context.observations).toEqual([]);
    expect(modelInput.context.toolResults).toEqual([]);
    expect(body.messages[0].content).toContain(JSON.stringify(getAgentActionContract().schemaId));
    expect(body.messages[0].content).toContain("fieldDictionary");
    expect(body.messages[0].content).toContain("missing_training_constraints");
    expect(body.messages[0].content).not.toContain("ask_user.question");
    expect(body.messages[0].content).toContain("outputContracts");
    expect(body.messages[0].content).toContain(visibleTrainingProposalOutputContract.outputType);
    expect(body.messages[0].content).toContain("payload.kind");
    expect(completion.trace?.request.run.actionContract).toEqual({
      schemaId: "AgentAction",
      schemaVersion: "1",
    });
    expect(completion.trace?.request.run.outputContractCount).toBe(1);
    expect(completion.trace?.request.run.outputContracts).toEqual([
      {
        outputType: visibleTrainingProposalOutputContract.outputType,
        schemaVersion: visibleTrainingProposalOutputContract.schemaVersion,
      },
    ]);
    expect(JSON.stringify(completion.trace?.request.run.outputContracts)).not.toContain("payload.kind");
    expect(completion.trace?.request.layers).toMatchObject({
      protocol: {
        present: true,
        promptVersion: agentLlmPromptConfig.promptVersion,
        actionContractSchemaId: "AgentAction",
        actionContractSchemaVersion: "1",
        outputContractCount: 1,
      },
      context: {
        present: true,
        keys: ["run", "step", "tools", "observations", "toolResults"],
      },
      repairContext: {
        present: false,
      },
    });
  });

  it("uses injected prompt config for DeepSeek request body without mutating defaults", async () => {
    const customPromptConfig: AgentLlmPromptConfig = {
      promptVersion: "agent-action-custom-test",
      systemPromptInstructions: [
        "返回测试专用 AgentAction JSON object。",
        "这个 adapter 测试只期望 final_answer。",
      ],
      actionContract: defaultAgentActionContract,
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

    await adapter.completeAction(withPlannerContext({
      run: {
        runId: "run-deepseek-custom-prompt",
        actor: {},
        userInput: "answer",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    }));

    const body = requestBodies[0] as {
      temperature: number;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.temperature).toBe(customPromptConfig.requestDefaults.temperature);
    expect(body.max_tokens).toBe(customPromptConfig.requestDefaults.maxTokens);
    expect(body.messages[0]).toMatchObject({
      role: "system",
    });
    expect(body.messages[0].content).toContain(buildAgentActionSystemPrompt(customPromptConfig));
    expect(body.messages[0].content).toContain("\"promptVersion\":\"agent-action-custom-test\"");
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
      request: {
        layers: {
          repairContext: {
            present: false,
          },
        },
      },
    });
    expect(planner.getModelTraceEvents()[1]).toMatchObject({
      plannerCallIndex: 2,
      runtimeStep: 2,
      request: {
        layers: {
          repairContext: {
            present: true,
            errorCode: AGENT_ERROR_CODES.INVALID_ACTION,
          },
        },
      },
    });
    const firstBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as { messages: Array<{ content: string }> };
    const secondBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)) as { messages: Array<{ content: string }> };
    const firstUserPayload = JSON.parse(firstBody.messages[1].content) as Record<string, unknown>;
    const secondUserPayload = JSON.parse(secondBody.messages[1].content) as {
      repairContext?: {
        error?: { code?: string };
        errors?: Array<{ path?: string; expected?: unknown; actual?: unknown }>;
      };
    };

    expect(firstBody.messages[0].content).not.toContain("repair-only 指令");
    expect(firstUserPayload).not.toHaveProperty("repairContext");
    expect(secondBody.messages[0].content).toContain("repair-only 指令");
    expect(secondBody.messages[0].content).toContain("只修正上一轮非法 AgentAction");
    expect(secondUserPayload.repairContext).toMatchObject({
      error: { code: AGENT_ERROR_CODES.INVALID_ACTION },
    });
    expect(secondUserPayload.repairContext?.errors?.[0]).toEqual(expect.objectContaining({
      path: expect.any(String),
      actual: expect.anything(),
    }));
  });
});
