import { describe, expect, it } from "vitest";

import { InMemoryConfirmationStore } from "@/lib/server/agent-core/confirmation-store";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { createResourceId } from "@/lib/server/agent-core/resource-store";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { createM1FixtureToolRegistry } from "@/lib/server/agent-tools";
import {
  getConfirmationWriteFixtureExecutions,
  M1_FIXTURE_DIAGNOSTIC_TYPE,
  M1_FIXTURE_RESOURCE_TYPE,
  M1_FIXTURE_SCHEMA_VERSION,
  resetConfirmationWriteFixtureExecutions,
  summarizeM1FixtureTrace,
} from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { toTerminalResourceRefs, toTerminalToolResultRefs, type AgentResourceRef } from "@/lib/server/agent-core/contracts";

describe("agent tool governance regressions", () => {
  it("does not execute write or high-risk tools before Policy Guard returns confirmation", async () => {
    resetConfirmationWriteFixtureExecutions();
    const confirmationStore = new InMemoryConfirmationStore();
    const result = await runAgentRuntime({
      registry: createM1FixtureToolRegistry(),
      confirmationStore,
      confirmationSecret: "governance-secret",
      planner: new ReplayPlanner([
        {
          type: "tool_call",
          toolName: "m1ConfirmationWrite",
          input: {
            recordId: "governance-record",
            value: "should-not-run-yet",
          },
        },
      ]),
      run: {
        runId: "run-governance-confirmation",
        actor: { userId: "user-1", permissions: ["fixture:write"] },
        userInput: "write fixture",
      },
    });

    expect(result.status).toBe("requires_confirmation");
    expect(result.toolResults).toHaveLength(0);
    expect(confirmationStore.list()).toHaveLength(1);
    expect(getConfirmationWriteFixtureExecutions()).toHaveLength(0);
  });

  it("does not allow diagnostic resources to support successful final answer", async () => {
    const diagnosticInput = {
      code: "fixture_blocked",
      message: "fixture 被阻断。",
    };
    const diagnosticToolResultId = createToolResultId(
      "run-governance-diagnostic",
      "m1DiagnosticFailure",
      hashNormalizedInput(diagnosticInput),
    );
    const diagnosticRef: AgentResourceRef = {
      resourceId: createResourceId({
        runId: "run-governance-diagnostic",
        sourceToolResultId: diagnosticToolResultId,
        resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE,
        role: "diagnostic",
        schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
      }),
      resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE,
      role: "diagnostic",
      runId: "run-governance-diagnostic",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
    };

    const result = await runAgentRuntime({
      registry: createM1FixtureToolRegistry(),
      planner: new ReplayPlanner([
        {
          type: "tool_call",
          toolName: "m1DiagnosticFailure",
          input: diagnosticInput,
        },
        {
          type: "final_answer",
          content: "已成功完成。",
          usedRefs: [
            ...toTerminalToolResultRefs([diagnosticToolResultId]),
            ...toTerminalResourceRefs([diagnosticRef]),
          ],
        },
      ]),
      run: {
        runId: "run-governance-diagnostic",
        actor: { userId: "user-1" },
        userInput: "diagnostic fixture",
        limits: { maxSteps: 3, maxInvalidActions: 0 },
      },
    });

    expect(result.status).toBe("failed");
    expect(result.terminalError).toMatchObject({
      code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
    });
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "invalid_action",
        content: expect.objectContaining({ code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID }),
      }),
    ]));
  });

  it("does not default complete tool output into model observations, user events or trace summaries", async () => {
    const producerInput = {
      title: "Governance Doc",
      body: "safe body",
      includeSecret: true,
    };
    const producerToolResultId = createToolResultId(
      "run-governance-projection",
      "m1ResourceProducer",
      hashNormalizedInput(producerInput),
    );
    const resourceRef: AgentResourceRef = {
      resourceId: createResourceId({
        runId: "run-governance-projection",
        sourceToolResultId: producerToolResultId,
        resourceType: M1_FIXTURE_RESOURCE_TYPE,
        role: "consumable",
        schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
      }),
      resourceType: M1_FIXTURE_RESOURCE_TYPE,
      role: "consumable",
      runId: "run-governance-projection",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
    };
    const planner = new ReplayPlanner([
      {
        type: "tool_call",
        toolName: "m1ResourceProducer",
        input: producerInput,
      },
      {
        type: "final_answer",
        content: "资源已创建。",
        usedRefs: [
          ...toTerminalToolResultRefs([producerToolResultId]),
          ...toTerminalResourceRefs([resourceRef]),
        ],
      },
    ]);
    const result = await runAgentRuntime({
      registry: createM1FixtureToolRegistry(),
      planner,
      run: {
        runId: "run-governance-projection",
        actor: { userId: "user-1" },
        userInput: "produce secret fixture",
      },
    });
    const rawOutput = JSON.stringify(result.toolResults[0]);
    const modelContext = JSON.stringify(planner.calls);
    const userEvents = JSON.stringify(renderAgentResponseEvents(result));
    const traceSummary = JSON.stringify(summarizeM1FixtureTrace(result));

    expect(rawOutput).toContain("server-only-secret");
    expect(modelContext).not.toContain("server-only-secret");
    expect(userEvents).not.toContain("server-only-secret");
    expect(traceSummary).not.toContain("server-only-secret");
    expect(modelContext).not.toContain("secretInternalValue");
    expect(userEvents).not.toContain("secretInternalValue");
    expect(traceSummary).not.toContain("secretInternalValue");
  });
});
