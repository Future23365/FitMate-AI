import { describe, expect, it, vi } from "vitest";

import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { createM0FixtureToolRegistry } from "@/lib/server/agent-tools";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { DeepSeekModelAdapter } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import { FakeModelAdapter } from "@/lib/server/agent-planners/model-adapters/model-adapter";

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
        usedToolResultIds: [expectedToolResultId],
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
  });
});
