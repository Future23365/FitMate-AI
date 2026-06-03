import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { renderAgentResponseEvents, renderAgentResponseNdjson } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";

function createEchoTool(options: { name?: string; fail?: boolean; invalidOutput?: boolean; delayMs?: number } = {}) {
  return defineTool({
    name: options.name ?? "echoRead",
    version: "0.1.0",
    description: "Echo read fixture.",
    whenToUse: "Use in executor tests.",
    whenNotToUse: "Do not use outside executor tests.",
    inputSchema: z.object({ text: z.string() }).strict(),
    outputSchema: z.object({ text: z.string(), secretInternalValue: z.string().optional() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: async (input: { text: string }) => {
      if (options.delayMs) {
        await delay(options.delayMs);
      }
      if (options.fail) {
        throw new Error("handler failed");
      }
      if (options.invalidOutput) {
        return { wrong: true } as never;
      }
      return {
        text: input.text,
        secretInternalValue: "server-only",
      };
    },
    toModelObservation: (output: { text: string }) => ({ text: output.text }),
    toUserProjection: (output: { text: string }) => ({ text: output.text }),
  });
}

function createRun(runId = "run-executor") {
  return {
    runId,
    actor: { userId: "user-1" },
    userInput: "read",
  };
}

describe("agent-core Executor, Runtime and Response Renderer", () => {
  it("executes a tool, validates output and creates safe projections", async () => {
    const result = await executeTool({
      tool: createEchoTool(),
      input: { text: "hello" },
      run: createRun(),
      timeoutMs: 100,
      toolCallId: "tc_1",
    });

    expect(result).toMatchObject({
      ok: true,
      toolName: "echoRead",
      toolVersion: "0.1.0",
      projection: { model: { text: "hello" }, user: { text: "hello" } },
    });
  });

  it("normalizes handler exceptions, output schema failures and per-tool timeout", async () => {
    await expect(executeTool({
      tool: createEchoTool({ fail: true }),
      input: { text: "hello" },
      run: createRun(),
      timeoutMs: 100,
      toolCallId: "tc_1",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.HANDLER_ERROR } });

    await expect(executeTool({
      tool: createEchoTool({ invalidOutput: true }),
      input: { text: "hello" },
      run: createRun(),
      timeoutMs: 100,
      toolCallId: "tc_1",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_OUTPUT } });

    await expect(executeTool({
      tool: createEchoTool({ delayMs: 40 }),
      input: { text: "hello" },
      run: createRun(),
      timeoutMs: 5,
      toolCallId: "tc_1",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TIMEOUT } });
  });

  it("runs the M0 loop from tool call to final answer and renders NDJSON events", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());
    const toolInput = { text: "hello" };
    const expectedToolResultId = createToolResultId("run-success", "echoRead", hashNormalizedInput(toolInput));
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "echoRead", input: toolInput },
      {
        type: "final_answer",
        content: "已读取。",
        usedToolResultIds: [expectedToolResultId],
        assistantSuggestions: ["继续"],
      },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        ...createRun("run-success"),
        limits: { maxSteps: 3 },
      },
    });
    const events = renderAgentResponseEvents(result);
    const ndjson = renderAgentResponseNdjson(result);

    expect(result.status).toBe("completed");
    expect(planner.calls[1].observations[0]).toMatchObject({ ok: true, content: { text: "hello" } });
    expect(events).toEqual([
      { type: "tool_result", toolResultId: expectedToolResultId, toolName: "echoRead", content: { text: "hello" } },
      { type: "content", content: "已读取。" },
      { type: "assistant_suggestions", suggestions: ["继续"] },
      { type: "done" },
    ]);
    expect(ndjson).toContain("\"type\":\"done\"");
    expect(ndjson).not.toContain("server-only");
  });

  it("renders ask_user and runtime errors through the event whitelist", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const askResult = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "ask_user", question: "需要哪个 fixture？", suggestions: ["alpha", "beta"] },
      ]),
      run: createRun("run-ask"),
    });
    expect(renderAgentResponseEvents(askResult)).toEqual([
      { type: "content", content: "需要哪个 fixture？" },
      { type: "assistant_suggestions", suggestions: ["alpha", "beta"] },
      { type: "done" },
    ]);

    const errorResult = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "unknown_action" },
        { type: "unknown_action" },
      ]),
      run: createRun("run-error"),
    });
    expect(renderAgentResponseEvents(errorResult)).toMatchObject([
      { type: "error", error: { code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED } },
      { type: "done" },
    ]);
  });

  it("enforces maxSteps, overall timeout and duplicate failure fuse", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    await expect(runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "echoRead", input: { text: "loop" } },
      ]),
      run: {
        ...createRun("run-max-steps"),
        limits: { maxSteps: 1 },
      },
    })).resolves.toMatchObject({ status: "failed", terminalError: { code: AGENT_ERROR_CODES.MAX_STEPS_EXCEEDED } });

    const slowRegistry = new ToolRegistry();
    slowRegistry.register(createEchoTool({ delayMs: 40 }));

    await expect(runAgentRuntime({
      registry: slowRegistry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "echoRead", input: { text: "slow" } },
      ]),
      run: {
        ...createRun("run-overall-timeout"),
        limits: { overallTimeoutMs: 5, perToolTimeoutMs: 500 },
      },
    })).resolves.toMatchObject({ status: "failed", terminalError: { code: AGENT_ERROR_CODES.OVERALL_TIMEOUT } });

    const failingHandler = vi.fn(() => {
      throw new Error("boom");
    });
    const failingRegistry = new ToolRegistry();
    failingRegistry.register(defineTool({
      ...createEchoTool({ name: "failingRead" }),
      name: "failingRead",
      handler: failingHandler,
    }));

    await expect(runAgentRuntime({
      registry: failingRegistry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "failingRead", input: { text: "same" } },
        { type: "tool_call", toolName: "failingRead", input: { text: "same" } },
      ]),
      run: {
        ...createRun("run-duplicate-failure"),
        limits: { maxSteps: 3 },
      },
    })).resolves.toMatchObject({
      status: "failed",
      terminalError: { code: AGENT_ERROR_CODES.DUPLICATE_TOOL_FAILURE },
    });
    expect(failingHandler).toHaveBeenCalledTimes(1);
  });
});
