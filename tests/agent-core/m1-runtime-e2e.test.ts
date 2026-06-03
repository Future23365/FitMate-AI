import { describe, expect, it } from "vitest";

import { InMemoryConfirmationStore } from "@/lib/server/agent-core/confirmation-store";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { ResourceStore } from "@/lib/server/agent-core/resource-store";
import { resumeConfirmedAction, runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createM1FixtureToolRegistry } from "@/lib/server/agent-tools";
import {
  M1_FIXTURE_DIAGNOSTIC_TYPE,
  M1_FIXTURE_RESOURCE_TYPE,
  M1_FIXTURE_SCHEMA_VERSION,
  summarizeM1FixtureTrace,
} from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import type { AgentResourceRef } from "@/lib/server/agent-core/contracts";

describe("agent-core M1 resource runtime", () => {
  it("runs producer -> consumer -> final answer with consumable resource grounding", async () => {
    const registry = createM1FixtureToolRegistry();
    const resourceStore = new ResourceStore("run-m1-resource");
    const resourceRef: AgentResourceRef = {
      resourceId: "doc-1",
      resourceType: M1_FIXTURE_RESOURCE_TYPE,
      role: "consumable",
      runId: "run-m1-resource",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
    };
    const planner = new ReplayPlanner([
      {
        type: "tool_call",
        toolName: "m1ResourceProducer",
        input: {
          resourceId: "doc-1",
          title: "M1 Doc",
          body: "safe body",
          includeSecret: true,
        },
      },
      {
        type: "tool_call",
        toolName: "m1ResourceConsumer",
        input: { label: "used" },
        consumes: [resourceRef],
      },
      {
        type: "final_answer",
        content: "资源链路完成。",
        usedResourceRefs: [resourceRef],
      },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      resourceStore,
      run: {
        runId: "run-m1-resource",
        actor: { userId: "user-1" },
        userInput: "run resource fixture",
        limits: { maxSteps: 4 },
      },
    });
    const events = renderAgentResponseEvents(result);
    const serializedPlannerCalls = JSON.stringify(planner.calls);

    expect(result.status).toBe("completed");
    expect(result.toolResults).toHaveLength(2);
    expect(resourceStore.get(resourceRef)).toMatchObject({ role: "consumable", sourceToolResultId: result.toolResults[0].toolResultId });
    expect(result.toolResults[1]).toMatchObject({
      ok: true,
      fulfillment: {
        consumedResources: [resourceRef],
      },
    });
    expect(result.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "resource_registered", resource: resourceRef }),
      expect.objectContaining({ type: "terminal_grounding", usedResourceRefs: [resourceRef] }),
    ]));
    expect(summarizeM1FixtureTrace(result)).toMatchObject({ status: "completed" });
    expect(events).toEqual([
      expect.objectContaining({ type: "tool_result", toolName: "m1ResourceProducer" }),
      expect.objectContaining({ type: "tool_result", toolName: "m1ResourceConsumer" }),
      { type: "content", content: "资源链路完成。" },
      { type: "done" },
    ]);
    expect(serializedPlannerCalls).not.toContain("server-only-secret");
    expect(JSON.stringify(events)).not.toContain("server-only-secret");
  });
});

describe("agent-core M1 confirmation runtime", () => {
  it("returns confirmation request first, then resumes the saved pending action only", async () => {
    const registry = createM1FixtureToolRegistry();
    const confirmationStore = new InMemoryConfirmationStore();
    const run = {
      runId: "run-m1-confirmation",
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
            recordId: "record-1",
            value: "original-value",
          },
        },
      ]),
      run,
    });

    expect(initial.status).toBe("requires_confirmation");
    expect(initial.toolResults).toHaveLength(0);
    expect(confirmationStore.list()).toHaveLength(1);
    expect(renderAgentResponseEvents(initial)).toEqual([
      expect.objectContaining({
        type: "confirmation_request",
        toolName: "m1ConfirmationWrite",
      }),
      { type: "done" },
    ]);

    const request = initial.confirmationRequest;
    if (!request) {
      throw new Error("confirmation request should exist");
    }

    const resumed = await resumeConfirmedAction({
      registry,
      confirmationStore,
      confirmationSecret: "test-secret",
      resume: {
        pendingActionId: request.pendingActionId,
        actionHash: request.actionHash,
        run,
        clientAction: {
          type: "tool_call",
          toolName: "m1ConfirmationWrite",
          input: {
            recordId: "record-1",
            value: "client-mutated-value",
          },
        },
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.toolResults[0]).toMatchObject({
      ok: true,
      output: {
        savedRecordId: "record-1",
        savedValue: "original-value",
      },
    });
    expect(resumed.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "confirmation_resume", pendingActionId: request.pendingActionId }),
      expect.objectContaining({ type: "policy_decision", decision: "allow" }),
    ]));

    await expect(resumeConfirmedAction({
      registry,
      confirmationStore,
      confirmationSecret: "test-secret",
      resume: {
        pendingActionId: request.pendingActionId,
        actionHash: request.actionHash,
        run,
      },
    })).resolves.toMatchObject({
      status: "failed",
      terminalError: { code: AGENT_ERROR_CODES.CONFIRMATION_CONSUMED },
    });
  });
});

describe("agent-core M1 diagnostic grounding", () => {
  it("rejects diagnostic final answer grounding but allows ask_user explanation without success projection", async () => {
    const registry = createM1FixtureToolRegistry();
    const diagnosticRef: AgentResourceRef = {
      resourceId: "diag-1",
      resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE,
      role: "diagnostic",
      runId: "run-m1-diagnostic",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
    };
    const result = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        {
          type: "tool_call",
          toolName: "m1DiagnosticFailure",
          input: {
            evidenceId: "diag-1",
            code: "fixture_blocked",
            message: "fixture 被阻断。",
          },
        },
        {
          type: "final_answer",
          content: "已成功完成。",
          usedResourceRefs: [diagnosticRef],
        },
        {
          type: "ask_user",
          question: "fixture 被阻断，需要补充信息。",
          usedResourceRefs: [diagnosticRef],
        },
      ]),
      run: {
        runId: "run-m1-diagnostic",
        actor: { userId: "user-1" },
        userInput: "diagnostic fixture",
        limits: { maxSteps: 4, maxInvalidActions: 2 },
      },
    });
    const events = renderAgentResponseEvents(result);

    expect(result.status).toBe("needs_input");
    expect(result.toolResults[0]).toMatchObject({
      ok: true,
      fulfillment: {
        satisfied: false,
        producedResources: [diagnosticRef],
      },
    });
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "invalid_action",
        content: expect.objectContaining({ code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID }),
      }),
    ]));
    expect(events).toEqual([
      { type: "content", content: "fixture 被阻断，需要补充信息。" },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("tool_result");
  });
});
