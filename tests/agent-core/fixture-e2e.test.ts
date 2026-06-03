import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createM0FixtureToolRegistry } from "@/lib/server/agent-tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";

describe("agent-core fixture read tool end to end", () => {
  it("exposes manifest, runs fixture tool, creates observation and renders safe events", async () => {
    const registry = createM0FixtureToolRegistry();
    const toolInput = { fixtureId: "alpha-intro", includeMeta: true, tags: ["alpha"] };
    const expectedToolResultId = createToolResultId("run-fixture", "readFixture", hashNormalizedInput(toolInput));
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "readFixture", input: toolInput },
      {
        type: "final_answer",
        content: "fixture 已读取。",
        usedToolResultIds: [expectedToolResultId],
      },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-fixture",
        actor: { userId: "user-1" },
        userInput: "read fixture",
      },
    });

    expect(registry.serializeForPlanner()[0]).toMatchObject({
      name: "readFixture",
      policyHint: {
        sideEffect: "read",
        riskLevel: "low",
        confirmation: "never",
      },
    });
    expect(result.status).toBe("completed");
    expect(result.toolResults[0]).toMatchObject({ ok: true, toolName: "readFixture" });
    expect(planner.calls[1].observations[0]).toMatchObject({
      type: "tool_result",
      ok: true,
      content: {
        fixtureId: "alpha-intro",
        title: "Fixture alpha-intro",
      },
    });
    expect(renderAgentResponseEvents(result)).toMatchObject([
      { type: "tool_result", toolName: "readFixture" },
      { type: "content", content: "fixture 已读取。" },
      { type: "done" },
    ]);
  });

  it("adds a second read fixture tool through registration without changing core flow", async () => {
    const registry = new ToolRegistry();
    registry.register(defineTool({
      name: "readSecondFixture",
      version: "0.1.0",
      description: "第二个只读 fixture。",
      whenToUse: "仅用于证明新增只读 tool 只需要注册即可进入流程。",
      whenNotToUse: "不要作为生产业务 tool 使用。",
      inputSchema: z.object({ id: z.string() }).strict(),
      outputSchema: z.object({ id: z.string(), label: z.string() }).strict(),
      policy: {
        sideEffect: "read",
        riskLevel: "low",
        confirmation: "never",
      },
      handler: (input: { id: string }) => ({ id: input.id, label: `second-${input.id}` }),
      toModelObservation: (output: { id: string; label: string }) => ({ label: output.label }),
      toUserProjection: (output: { id: string; label: string }) => ({ label: output.label }),
    }));

    const input = { id: "two" };
    const expectedToolResultId = createToolResultId("run-second-fixture", "readSecondFixture", hashNormalizedInput(input));
    const result = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "readSecondFixture", input },
        {
          type: "final_answer",
          content: "second fixture 已读取。",
          usedToolResultIds: [expectedToolResultId],
        },
      ]),
      run: {
        runId: "run-second-fixture",
        actor: {},
        userInput: "read second fixture",
      },
    });

    expect(registry.serializeForPlanner().map((manifest) => manifest.name)).toEqual(["readSecondFixture"]);
    expect(result.status).toBe("completed");
    expect(renderAgentResponseEvents(result)).toMatchObject([
      { type: "tool_result", toolName: "readSecondFixture", content: { label: "second-two" } },
      { type: "content", content: "second fixture 已读取。" },
      { type: "done" },
    ]);
  });
});
