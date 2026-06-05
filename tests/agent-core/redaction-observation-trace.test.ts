import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { executeTool } from "@/lib/server/agent-core/executor";
import {
  createToolObservation,
  compressPlannerObservations,
  SUCCESSFUL_TOOL_RESULT_INDEX_OBSERVATION_ROLE,
  TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
} from "@/lib/server/agent-core/observation";
import { auditRedactedValue, redactJsonValue } from "@/lib/server/agent-core/redaction";
import { auditAgentTrace } from "@/lib/server/agent-core/trace-audit";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import type { AgentObservation, AgentTraceEvent, ToolResult } from "@/lib/server/agent-core/contracts";

function createSecretOutputTool() {
  return defineTool({
    name: "secretOutputFixture",
    version: "0.1.0",
    description: "为 redaction 测试返回包含敏感字段的输出。",
    whenToUse: "仅在 redaction 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({
      id: z.string(),
      visible: z.string(),
      secretInternalValue: z.string(),
    }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (input: { id: string }) => ({
      id: input.id,
      visible: "safe",
      secretInternalValue: "server-only-secret",
    }),
    toModelObservation: (output: { id: string; visible: string; secretInternalValue: string }) => ({
      id: output.id,
      visible: output.visible,
      secretInternalValue: output.secretInternalValue,
    }),
    toUserProjection: (output: { id: string; visible: string; secretInternalValue: string }) => ({
      visible: output.visible,
      secretInternalValue: output.secretInternalValue,
    }),
  });
}

describe("agent-core redaction, observation compression and trace audit", () => {
  it("supports field-level redaction, path allowlists and default deny", () => {
    const redacted = redactJsonValue({
      safe: {
        title: "ok",
        body: "hidden",
      },
      secretToken: "server-only-secret",
      output: {
        raw: "handler output",
      },
    }, {
      defaultDeny: true,
      allowedPaths: ["$.safe.title"],
    });

    expect(redacted).toEqual({
      safe: {
        title: "ok",
      },
    });
  });

  it("keeps satisfied success observations lightweight and points detailed facts to toolResults", async () => {
    const result = await executeTool({
      tool: createSecretOutputTool(),
      input: { id: "secret-1" },
      run: {
        runId: "run-redaction",
        actor: {},
        userInput: "redact",
      },
      timeoutMs: 100,
      toolCallId: "tc_1",
    });

    if (!result.ok) {
      throw new Error("secret output fixture should succeed");
    }

    const observation = createToolObservation(result);
    const serializedObservation = JSON.stringify(observation);

    expect(observation).toMatchObject({
      type: "tool_result",
      source: "tool",
      toolResultId: result.toolResultId,
      toolName: "secretOutputFixture",
      ok: true,
      content: {
        observationRole: SUCCESSFUL_TOOL_RESULT_INDEX_OBSERVATION_ROLE,
        toolResultId: result.toolResultId,
        toolName: "secretOutputFixture",
        ok: true,
        modelFactsChannel: TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
        projectionModelOmitted: true,
        boundary: expect.stringContaining("详细事实见 toolResults[].projection.model"),
      },
    });
    expect(serializedObservation).not.toContain("server-only-secret");
    expect(serializedObservation).not.toContain("visible");
    expect(auditRedactedValue(observation).ok).toBe(true);
  });

  it("keeps failed and unsatisfied repair details in diagnostic observations", () => {
    const failedResult: ToolResult = {
      toolResultId: "tr_failed",
      toolName: "diagnosticFixture",
      toolVersion: "0.1.0",
      toolCallId: "tc_failed",
      idempotencyKey: "idem_failed",
      normalizedInputHash: "hash_failed",
      startedAt: "2026-06-05T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z",
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
        message: "Tool input failed.",
        retryable: false,
        details: {
          repairFacts: ["保留失败 details 供 Planner 修复。"],
        },
      },
      fulfillment: {
        satisfied: false,
        summary: "输入不满足合同。",
        unmetRequirements: [
          {
            reason: AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
            message: "需要修正 input。",
          },
        ],
      },
    };
    const unsatisfiedResult: ToolResult = {
      toolResultId: "tr_unsatisfied",
      toolName: "diagnosticFixture",
      toolVersion: "0.1.0",
      toolCallId: "tc_unsatisfied",
      idempotencyKey: "idem_unsatisfied",
      normalizedInputHash: "hash_unsatisfied",
      startedAt: "2026-06-05T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z",
      ok: true,
      output: "[redacted]",
      projection: {
        model: {
          status: "no_candidates",
          repairFacts: ["放宽器械或目标部位。"],
        },
      },
      fulfillment: {
        satisfied: false,
        summary: "没有满足条件的候选。",
        unmetRequirements: [
          {
            reason: AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET,
            message: "没有候选动作。",
          },
        ],
      },
    };

    const failedObservation = createToolObservation(failedResult);
    const unsatisfiedObservation = createToolObservation(unsatisfiedResult);

    expect(JSON.stringify(failedObservation.content)).toContain("repairFacts");
    expect(JSON.stringify(failedObservation.content)).toContain("保留失败 details");
    expect(JSON.stringify(unsatisfiedObservation.content)).toContain("no_candidates");
    expect(JSON.stringify(unsatisfiedObservation.content)).toContain("放宽器械或目标部位");
    expect(JSON.stringify(unsatisfiedObservation.content)).not.toContain(SUCCESSFUL_TOOL_RESULT_INDEX_OBSERVATION_ROLE);
  });

  it("compresses observations without changing diagnostic resource role", () => {
    const diagnosticObservation: AgentObservation = {
      type: "tool_result",
      source: "tool",
      toolResultId: "tr_diag",
      toolName: "diagnosticFixture",
      ok: false,
      content: {
        summary: "诊断信息。",
        fulfillment: {
          satisfied: false,
          producedResources: [
            {
              resourceId: "diag-1",
              resourceType: "fixture_diagnostic",
              role: "diagnostic",
              runId: "run-redaction",
            },
          ],
        },
      },
    };

    const [compressed] = compressPlannerObservations([diagnosticObservation], 160);
    expect(JSON.stringify(compressed)).toContain("\"role\":\"diagnostic\"");
    expect(JSON.stringify(compressed)).not.toContain("\"role\":\"consumable\"");
  });

  it("detects unsafe trace leaks", () => {
    const unsafeTrace = [
      {
        type: "resource_registered",
        toolResultId: "tr_1",
        resource: { resourceId: "res_1", role: "consumable" },
        summary: {
          output: {
            secretInternalValue: "server-only-secret",
          },
        },
      },
    ] as AgentTraceEvent[];

    expect(auditAgentTrace(unsafeTrace)).toMatchObject({
      ok: false,
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "complete_output" }),
      ]),
    });
  });
});
