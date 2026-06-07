import { describe, expect, it, vi } from "vitest";

import { InMemoryConfirmationStore } from "@/lib/server/agent-core/confirmation-store";
import type { AgentResourceRef } from "@/lib/server/agent-core/contracts";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { createResourceId, ResourceStore } from "@/lib/server/agent-core/resource-store";
import { resumeConfirmedAction, runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createM0FixtureToolRegistry, createM1FixtureToolRegistry } from "@/lib/server/agent-tools";
import {
  M1_FIXTURE_DIAGNOSTIC_TYPE,
  M1_FIXTURE_RESOURCE_TYPE,
  M1_FIXTURE_SCHEMA_VERSION,
  getConfirmationWriteFixtureExecutions,
  resetConfirmationWriteFixtureExecutions,
} from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { DeepSeekModelAdapter } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import { agentRuntimeConfig } from "@/lib/server/config";

function createScriptedDeepSeekPlanner(actions: unknown[]) {
  const fetchImpl = vi.fn(async () => {
    const action = actions.shift();
    return new Response(JSON.stringify({
      model: agentRuntimeConfig.llm.deepSeek.defaultModel,
      choices: [
        {
          message: {
            content: JSON.stringify(action),
          },
        },
      ],
    }));
  });

  return {
    planner: new LlmPlanner(new DeepSeekModelAdapter({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    })),
    fetchImpl,
  };
}

describe("agent-core DeepSeek adapter fixture E2E", () => {
  it("drives read fixture through AgentAction and generic runtime", async () => {
    const toolInput = { fixtureId: "deepseek-read" };
    const { planner, fetchImpl } = createScriptedDeepSeekPlanner([
      { type: "tool_call", toolName: "readFixture", input: toolInput },
      {
        type: "final_answer",
        content: "read completed.",
      },
    ]);

    const result = await runAgentRuntime({
      registry: createM0FixtureToolRegistry(),
      planner,
      run: {
        runId: "run-deepseek-read",
        actor: {},
        userInput: "read fixture",
      },
    });

    expect(result.status).toBe("completed");
    expect(result.toolResults[0]).toMatchObject({ ok: true, toolName: "readFixture" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps resource producer and consumer constrained by ResourceStore and Action Validator", async () => {
    const producerInput = {
      title: "DeepSeek Doc",
      body: "safe body",
    };
    const producerToolResultId = createToolResultId("run-deepseek-resource", "m1ResourceProducer", hashNormalizedInput(producerInput));
    const resourceRef: AgentResourceRef = {
      resourceId: createResourceId({
        runId: "run-deepseek-resource",
        sourceToolResultId: producerToolResultId,
        resourceType: M1_FIXTURE_RESOURCE_TYPE,
        role: "consumable",
        schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
      }),
      resourceType: M1_FIXTURE_RESOURCE_TYPE,
      role: "consumable",
      runId: "run-deepseek-resource",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
    };
    const resourceStore = new ResourceStore("run-deepseek-resource");
    const { planner } = createScriptedDeepSeekPlanner([
      { type: "tool_call", toolName: "m1ResourceProducer", input: producerInput },
      {
        type: "tool_call",
        toolName: "m1ResourceConsumer",
        input: { label: "consumed" },
      },
      {
        type: "final_answer",
        content: "resource completed.",
      },
    ]);

    const result = await runAgentRuntime({
      registry: createM1FixtureToolRegistry(),
      planner,
      resourceStore,
      run: {
        runId: "run-deepseek-resource",
        actor: {},
        userInput: "resource fixture",
        limits: { maxSteps: 4 },
      },
    });

    expect(result.status).toBe("completed");
    expect(resourceStore.get(resourceRef)).toMatchObject({ role: "consumable" });
    expect(result.toolResults[1]).toMatchObject({ ok: true, fulfillment: { consumedResources: [resourceRef] } });
  });

  it("requires confirmation before executing DeepSeek-proposed write fixture and resumes saved pending action", async () => {
    resetConfirmationWriteFixtureExecutions();
    const confirmationStore = new InMemoryConfirmationStore();
    const run = {
      runId: "run-deepseek-confirmation",
      actor: { userId: "user-1", permissions: ["fixture:write"] },
      userInput: "write fixture",
    };
    const { planner } = createScriptedDeepSeekPlanner([
      {
        type: "tool_call",
        toolName: "m1ConfirmationWrite",
        input: {
          recordId: "deepseek-record",
          value: "original",
        },
      },
    ]);

    const initial = await runAgentRuntime({
      registry: createM1FixtureToolRegistry(),
      planner,
      confirmationStore,
      confirmationSecret: "test-secret",
      run,
    });

    expect(initial.status).toBe("requires_confirmation");
    expect(getConfirmationWriteFixtureExecutions()).toHaveLength(0);
    const request = initial.confirmationRequest;
    if (!request) {
      throw new Error("confirmation request should exist");
    }

    const resumed = await resumeConfirmedAction({
      registry: createM1FixtureToolRegistry(),
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
            recordId: "deepseek-record",
            value: "mutated",
          },
        },
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.toolResults[0]).toMatchObject({
      ok: true,
      output: {
        savedRecordId: "deepseek-record",
        savedValue: "original",
      },
    });
    expect(getConfirmationWriteFixtureExecutions()).toHaveLength(1);
  });

  it("rejects stale terminal refs before accepting diagnostic ask_user", async () => {
    const diagnosticInput = {
      code: "deepseek_blocked",
      message: "fixture blocked.",
    };
    const diagnosticToolResultId = createToolResultId("run-deepseek-diagnostic", "m1DiagnosticFailure", hashNormalizedInput(diagnosticInput));
    const diagnosticRef: AgentResourceRef = {
      resourceId: createResourceId({
        runId: "run-deepseek-diagnostic",
        sourceToolResultId: diagnosticToolResultId,
        resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE,
        role: "diagnostic",
        schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
      }),
      resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE,
      role: "diagnostic",
      runId: "run-deepseek-diagnostic",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
    };
    const { planner } = createScriptedDeepSeekPlanner([
      { type: "tool_call", toolName: "m1DiagnosticFailure", input: diagnosticInput },
      {
        type: "final_answer",
        content: "success.",
        usedRefs: [{ type: "resource", id: diagnosticRef.resourceId, resourceType: diagnosticRef.resourceType }],
      },
      {
        type: "ask_user", content: "fixture blocked.",
      },
    ]);

    const result = await runAgentRuntime({
      registry: createM1FixtureToolRegistry(),
      planner,
      run: {
        runId: "run-deepseek-diagnostic",
        actor: {},
        userInput: "diagnostic fixture",
        limits: {
          maxInvalidActions: 1,
          maxSteps: 4,
        },
      },
    });

    expect(result.status).toBe("needs_input");
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "invalid_action",
        content: expect.objectContaining({ code: AGENT_ERROR_CODES.INVALID_ACTION }),
      }),
    ]));
  });
});
