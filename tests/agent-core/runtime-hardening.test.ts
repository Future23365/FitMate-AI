import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { InMemoryConfirmationStore } from "@/lib/server/agent-core/confirmation-store";
import { toTerminalToolResultRefs } from "@/lib/server/agent-core/contracts";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
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
    description: "读取测试中的 idempotency 上下文。",
    whenToUse: "仅在 idempotency 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
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

function createSatisfiedResourceReadTool(handler: (id: string) => void) {
  return defineTool({
    name: "satisfiedResourceRead",
    version: "0.1.0",
    description: "读取测试中的成功资源并产出固定 resource。",
    whenToUse: "仅在重复成功 tool call 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    resourceContract: {
      produces: [
        {
          resourceType: "satisfied_resource",
          role: "consumable",
          schemaVersion: "1",
        },
      ],
    },
    handler: (input: { id: string }) => {
      handler(input.id);
      return { id: input.id };
    },
    toFulfillment: () => ({
      satisfied: true,
      summary: "已读取测试资源。",
    }),
    toResources: (output: { id: string }) => [
      {
        resourceId: `resource-${output.id}`,
        resourceType: "satisfied_resource",
        role: "consumable",
        schemaVersion: "1",
        summary: { id: output.id },
      },
    ],
    toModelObservation: (output: { id: string }) => ({ id: output.id }),
    toUserProjection: (output: { id: string }) => ({ id: output.id }),
  });
}

function createUnsatisfiedReadTool(handler: (id: string) => void) {
  return defineTool({
    name: "unsatisfiedRead",
    version: "0.1.0",
    description: "读取测试中的未满足结果。",
    whenToUse: "仅在重复成功 tool call 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string(), status: z.literal("empty") }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (input: { id: string }) => {
      handler(input.id);
      return { id: input.id, status: "empty" as const };
    },
    toFulfillment: () => ({
      satisfied: false,
      summary: "没有满足条件的测试资源。",
    }),
    toModelObservation: (output: { id: string }) => ({ id: output.id, status: "empty" }),
    toUserProjection: (output: { id: string }) => ({ id: output.id, status: "empty" }),
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

  it("returns duplicate input feedback without executing the same handler or registering resources again", async () => {
    const handler = vi.fn();
    const input = { id: "fact-1" };
    const expectedToolResultId = createToolResultId(
      "run-duplicate-success",
      "satisfiedResourceRead",
      hashNormalizedInput(input),
    );
    const registry = new ToolRegistry();
    registry.register(createSatisfiedResourceReadTool(handler));
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "satisfiedResourceRead", input },
      { type: "tool_call", toolName: "satisfiedResourceRead", input },
      { type: "final_answer", content: "已经基于第一次成功结果收口。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-duplicate-success",
        actor: { userId: "user-1" },
        userInput: "重复读取",
        limits: { maxToolCalls: 3, maxPlannerCalls: 4, maxSteps: 4, maxRepairAttempts: 1 },
      },
    });

    const duplicateFeedback = planner.calls[2].observations.find((observation) => (
      observation.source === "runtime"
      && JSON.stringify(observation.content).includes(AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT)
    ));
    const toolExecutionEvents = result.traceEvents.filter((event) => event.type === "tool_execution");
    const resourceRegisteredEvents = result.traceEvents.filter((event) => event.type === "resource_registered");

    expect(result).toMatchObject({
      status: "completed",
      terminalAction: {
        type: "final_answer",
        usedRefs: toTerminalToolResultRefs([expectedToolResultId]),
      },
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.toolResults).toHaveLength(1);
    expect(toolExecutionEvents).toHaveLength(1);
    expect(resourceRegisteredEvents).toHaveLength(1);
    expect(result.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "duplicate_tool_call",
        toolName: "satisfiedResourceRead",
        previousToolResultId: expectedToolResultId,
        previousOk: true,
        previousCount: 1,
        repeatCount: 2,
      }),
      expect.objectContaining({
        type: "budget_event",
        budget: "repair_attempts",
        status: "used",
        reason: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
      }),
    ]));
    expect(duplicateFeedback).toMatchObject({
      toolResultId: expectedToolResultId,
      toolName: "satisfiedResourceRead",
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
        details: expect.objectContaining({
          previousToolResultId: expectedToolResultId,
          producedResources: [
            expect.objectContaining({
              resourceType: "satisfied_resource",
              role: "consumable",
            }),
          ],
        }),
      }),
    });
    expect(planner.calls[2].repairContext).toMatchObject({
      error: {
        code: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
      },
      errors: [
        expect.objectContaining({
          code: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
          path: "tool_call.input",
        }),
      ],
      facts: [
        expect.objectContaining({
          previousToolResultId: expectedToolResultId,
          reusableRef: { type: "tool_result", id: expectedToolResultId },
          recoveryBoundary: expect.stringContaining("satisfied=true"),
        }),
      ],
    });
    expect(JSON.stringify(duplicateFeedback)).not.toContain("\"nextActionHints\"");
    expect(JSON.stringify(planner.calls[2].repairContext)).not.toContain("final_answer_with_current_tool_result");
    expect(JSON.stringify(planner.calls[2].repairContext)).not.toContain("continue_tool_call");
  });

  it("does not treat changed input as duplicate and dedupes repeated ok diagnostic results", async () => {
    const changedHandler = vi.fn();
    const changedRegistry = new ToolRegistry();
    changedRegistry.register(createSatisfiedResourceReadTool(changedHandler));
    const changedResult = await runAgentRuntime({
      registry: changedRegistry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "satisfiedResourceRead", input: { id: "a" } },
        { type: "tool_call", toolName: "satisfiedResourceRead", input: { id: "b" } },
        { type: "final_answer", content: "两个不同输入都已执行。", usedRefs: toTerminalToolResultRefs([
          createToolResultId("run-changed-input", "satisfiedResourceRead", hashNormalizedInput({ id: "a" })),
          createToolResultId("run-changed-input", "satisfiedResourceRead", hashNormalizedInput({ id: "b" })),
        ]) },
      ]),
      run: {
        runId: "run-changed-input",
        actor: { userId: "user-1" },
        userInput: "改变输入",
        limits: { maxToolCalls: 3, maxPlannerCalls: 4, maxSteps: 4 },
      },
    });

    const unsatisfiedHandler = vi.fn();
    const unsatisfiedRegistry = new ToolRegistry();
    unsatisfiedRegistry.register(createUnsatisfiedReadTool(unsatisfiedHandler));
    const unsatisfiedInput = { id: "empty" };
    const expectedUnsatisfiedToolResultId = createToolResultId(
      "run-unsatisfied-repeat",
      "unsatisfiedRead",
      hashNormalizedInput(unsatisfiedInput),
    );
    const unsatisfiedResult = await runAgentRuntime({
      registry: unsatisfiedRegistry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "unsatisfiedRead", input: unsatisfiedInput },
        { type: "tool_call", toolName: "unsatisfiedRead", input: unsatisfiedInput },
        { type: "ask_user", content: "没有找到满足条件的结果，要调整条件吗？" },
      ]),
      run: {
        runId: "run-unsatisfied-repeat",
        actor: { userId: "user-1" },
        userInput: "重复空结果",
        limits: { maxToolCalls: 3, maxPlannerCalls: 4, maxSteps: 4 },
      },
    });
    const unsatisfiedDuplicateFeedback = unsatisfiedResult.observations.find((observation) => (
      observation.source === "runtime"
      && JSON.stringify(observation.content).includes(AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT)
    ));

    expect(changedResult).toMatchObject({ status: "completed" });
    expect(changedHandler).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(changedResult.observations)).not.toContain(AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT);
    expect(unsatisfiedResult).toMatchObject({ status: "needs_input" });
    expect(unsatisfiedHandler).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(unsatisfiedResult.observations)).toContain(AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT);
    expect(unsatisfiedDuplicateFeedback).toMatchObject({
      content: expect.objectContaining({
        details: expect.objectContaining({
          previousSatisfied: false,
        }),
      }),
    });
    expect(JSON.stringify(unsatisfiedDuplicateFeedback)).not.toContain("\"nextActionHints\"");
    expect(JSON.stringify(unsatisfiedDuplicateFeedback)).not.toContain("final_answer_with_current_tool_result");
    expect(unsatisfiedResult.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "duplicate_tool_call",
        toolName: "unsatisfiedRead",
        previousToolResultId: expectedUnsatisfiedToolResultId,
        previousOk: true,
        previousCount: 1,
        repeatCount: 2,
      }),
    ]));
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

  it("emits nonfatal runtime trace observer events without changing the result", async () => {
    const observedTypes: string[] = [];
    const result = await runAgentRuntime({
      registry: new ToolRegistry(),
      planner: new ReplayPlanner([
        { type: "final_answer", content: "observer done" },
      ]),
      run: {
        runId: "run-observer",
        actor: {},
        userInput: "observer",
      },
      onTraceEvent: (event) => {
        observedTypes.push(event.type);

        if (event.type === "validation_result") {
          throw new Error("observer failed");
        }
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      terminalAction: { type: "final_answer", content: "observer done" },
    });
    expect(observedTypes).toEqual([
      "registry_snapshot",
      "agent_loop",
      "budget_event",
      "planner_action",
      "validation_result",
      "terminal_grounding",
    ]);
    expect(result.traceEvents.map((event) => event.type)).toEqual(observedTypes);
  });

  it("projects only safe activitySummary diagnostics into planner_action trace and keeps replay summary clean", async () => {
    const safeResult = await runAgentRuntime({
      registry: new ToolRegistry(),
      planner: new ReplayPlanner([
        { type: "final_answer", content: "可以。", activitySummary: "正在整理最终回复" },
      ]),
      run: {
        runId: "run-safe-activity-summary",
        actor: {},
        userInput: "hello",
      },
    });
    const safePlannerAction = safeResult.traceEvents.find((event) => event.type === "planner_action");

    expect(safePlannerAction).toMatchObject({
      type: "planner_action",
      actionType: "final_answer",
      activitySummary: "正在整理最终回复",
      activitySummarySource: "AgentAction.activitySummary",
    });
    expect(JSON.stringify(safeResult.replaySummary)).not.toContain("activitySummary");
    expect(JSON.stringify(safeResult.replaySummary)).not.toContain("正在整理最终回复");

    const rejectedResult = await runAgentRuntime({
      registry: new ToolRegistry(),
      planner: new ReplayPlanner([
        { type: "final_answer", content: "可以。", activitySummary: "toolName=readOne 内部调试" },
      ]),
      run: {
        runId: "run-rejected-activity-summary",
        actor: {},
        userInput: "hello",
      },
    });
    const rejectedPlannerAction = rejectedResult.traceEvents.find((event) => event.type === "planner_action");

    expect(rejectedPlannerAction).toMatchObject({
      type: "planner_action",
      actionType: "final_answer",
      activitySummaryRejectedReason: "internal_term",
    });
    expect(JSON.stringify(rejectedPlannerAction)).not.toContain("toolName=readOne");
    expect(JSON.stringify(rejectedPlannerAction)).not.toContain("内部调试");
  });
});
