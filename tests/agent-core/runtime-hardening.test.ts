import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { InMemoryConfirmationStore } from "@/lib/server/agent-core/confirmation-store";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createToolExecutionIdempotencyKey } from "@/lib/server/agent-core/idempotency";
import { resumeConfirmedAction, runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createM1FixtureToolRegistry } from "@/lib/server/agent-tools";
import {
  getConfirmationWriteFixtureExecutions,
  resetConfirmationWriteFixtureExecutions,
} from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";

function createIdempotencyTool(handler: (idempotencyKey: string) => void) {
  return defineTool({
    name: "idempotencyRead",
    version: "0.1.0",
    description: "Read idempotency context in tests.",
    whenToUse: "Use in idempotency tests.",
    whenNotToUse: "Do not use outside tests.",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string(), idempotencyKey: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (input: { id: string }, context) => {
      handler(context.idempotencyKey);
      return {
        id: input.id,
        idempotencyKey: context.idempotencyKey,
      };
    },
    toModelObservation: (output: { id: string }) => ({ id: output.id }),
    toUserProjection: (output: { id: string }) => ({ id: output.id }),
  });
}

describe("agent-core runtime budget and idempotency hardening", () => {
  it("stops before planner when planner or token budgets are exhausted", async () => {
    const planner = new ReplayPlanner([
      { type: "final_answer", content: "should not run" },
    ]);

    const plannerBudgetResult = await runAgentRuntime({
      registry: new ToolRegistry(),
      planner,
      run: {
        runId: "run-planner-budget",
        actor: {},
        userInput: "budget",
        limits: {
          maxPlannerCalls: 0,
        },
      },
    });

    expect(plannerBudgetResult).toMatchObject({
      status: "failed",
      terminalError: { code: AGENT_ERROR_CODES.BUDGET_EXHAUSTED },
    });
    expect(planner.calls).toHaveLength(0);

    const tokenPlanner = new ReplayPlanner([
      { type: "final_answer", content: "should not run" },
    ]);
    const tokenBudgetResult = await runAgentRuntime({
      registry: new ToolRegistry(),
      planner: tokenPlanner,
      run: {
        runId: "run-token-budget",
        actor: {},
        userInput: "budget",
        limits: {
          maxEstimatedTokens: 1,
        },
      },
    });

    expect(tokenBudgetResult).toMatchObject({
      status: "failed",
      terminalError: { code: AGENT_ERROR_CODES.BUDGET_EXHAUSTED },
    });
    expect(tokenPlanner.calls).toHaveLength(0);
    expect(tokenBudgetResult.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "budget_event", budget: "estimated_tokens", status: "exhausted" }),
    ]));
  });

  it("stops before tool handler when tool or repair budgets are exhausted", async () => {
    const handler = vi.fn();
    const registry = new ToolRegistry();
    registry.register(createIdempotencyTool(handler));

    const toolBudgetResult = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "idempotencyRead", input: { id: "a" } },
      ]),
      run: {
        runId: "run-tool-budget",
        actor: {},
        userInput: "tool budget",
        limits: {
          maxToolCalls: 0,
        },
      },
    });

    expect(toolBudgetResult).toMatchObject({
      status: "failed",
      terminalError: { code: AGENT_ERROR_CODES.BUDGET_EXHAUSTED },
    });
    expect(handler).not.toHaveBeenCalled();

    const repairResult = await runAgentRuntime({
      registry: new ToolRegistry(),
      planner: new ReplayPlanner([
        { type: "unknown_action" },
      ]),
      run: {
        runId: "run-repair-budget",
        actor: {},
        userInput: "repair",
        limits: {
          maxRepairAttempts: 0,
        },
      },
    });

    expect(repairResult).toMatchObject({
      status: "failed",
      terminalError: { code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED },
    });
    expect(repairResult.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "budget_event", budget: "repair_attempts", status: "exhausted" }),
    ]));
  });

  it("injects stable idempotencyKey into ordinary tool execution", async () => {
    const keys: string[] = [];
    const registry = new ToolRegistry();
    registry.register(createIdempotencyTool((key) => keys.push(key)));
    const run = {
      runId: "run-idempotency",
      actor: {},
      userInput: "idempotency",
    };
    const action = { type: "tool_call" as const, toolName: "idempotencyRead", input: { id: "a" } };
    const expectedKey = createToolExecutionIdempotencyKey({
      run,
      toolName: "idempotencyRead",
      toolVersion: "0.1.0",
      input: action.input,
      action,
      resourceRefs: [],
    });

    await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        action,
        { type: "final_answer", content: "done" },
      ]),
      run,
    });

    expect(keys).toEqual([expectedKey]);
  });

  it("does not repeat fixture write execution after consumed confirmation resume", async () => {
    resetConfirmationWriteFixtureExecutions();
    const registry = createM1FixtureToolRegistry();
    const confirmationStore = new InMemoryConfirmationStore();
    const run = {
      runId: "run-confirmation-idempotency",
      actor: { userId: "user-1", permissions: ["fixture:write"] },
      userInput: "write fixture",
    };
    const initial = await runAgentRuntime({
      registry,
      confirmationStore,
      confirmationSecret: "test-secret",
      planner: new ReplayPlanner([
        {
          type: "tool_call",
          toolName: "m1ConfirmationWrite",
          input: {
            recordId: "record-idempotency",
            value: "value",
          },
        },
      ]),
      run,
    });
    const request = initial.confirmationRequest;
    if (!request) {
      throw new Error("confirmation request should exist");
    }

    await resumeConfirmedAction({
      registry,
      confirmationStore,
      confirmationSecret: "test-secret",
      resume: {
        pendingActionId: request.pendingActionId,
        actionHash: request.actionHash,
        run,
      },
    });
    await resumeConfirmedAction({
      registry,
      confirmationStore,
      confirmationSecret: "test-secret",
      resume: {
        pendingActionId: request.pendingActionId,
        actionHash: request.actionHash,
        run,
      },
    });

    const executions = getConfirmationWriteFixtureExecutions();
    expect(executions).toHaveLength(1);
    expect(executions[0].idempotencyKey).toMatch(/^idem_/);
  });
});
