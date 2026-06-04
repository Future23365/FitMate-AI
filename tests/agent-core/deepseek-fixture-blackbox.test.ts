import { describe, expect, it } from "vitest";

import { createM0FixtureToolRegistry } from "@/lib/server/agent-tools";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { createDeepSeekModelAdapterFromEnv } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";

const shouldRunDeepSeekBlackbox = Boolean(process.env.DEEPSEEK_API_KEY && process.env.RUN_DEEPSEEK_BLACKBOX === "1");

describe("agent-core DeepSeek fixture blackbox precondition", () => {
  it("records when the real DeepSeek blackbox is not enabled", () => {
    if (shouldRunDeepSeekBlackbox) {
      expect(shouldRunDeepSeekBlackbox).toBe(true);
      return;
    }

    expect(process.env.RUN_DEEPSEEK_BLACKBOX).not.toBe("1");
  });
});

describe.skipIf(!shouldRunDeepSeekBlackbox)("agent-core DeepSeek fixture blackbox", () => {
  it("drives fixture read tool only through AgentAction and generic runtime", async () => {
    const adapter = createDeepSeekModelAdapterFromEnv();
    if (!adapter) {
      throw new Error("DEEPSEEK_API_KEY is required when RUN_DEEPSEEK_BLACKBOX=1.");
    }

    const result = await runAgentRuntime({
      registry: createM0FixtureToolRegistry(),
      planner: new LlmPlanner(adapter),
      run: {
        runId: "run-deepseek-blackbox",
        actor: {},
        userInput: "Use the available fixture read tool for fixtureId alpha-intro, then answer briefly.",
        limits: {
          maxSteps: 4,
          maxInvalidActions: 2,
          overallTimeoutMs: 30_000,
        },
      },
    });

    expect(["completed", "needs_input"]).toContain(result.status);
    expect(result.registrySnapshot?.manifestHash).toBeTruthy();
  });
});
