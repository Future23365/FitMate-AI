import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { executeTool } from "@/lib/server/agent-core/executor";
import { createToolObservation, compressPlannerObservations } from "@/lib/server/agent-core/observation";
import { auditRedactedValue, redactJsonValue } from "@/lib/server/agent-core/redaction";
import { auditAgentTrace } from "@/lib/server/agent-core/trace-audit";
import type { AgentObservation, AgentTraceEvent } from "@/lib/server/agent-core/contracts";

function createSecretOutputTool() {
  return defineTool({
    name: "secretOutputFixture",
    version: "0.1.0",
    description: "Return a secret output for redaction tests.",
    whenToUse: "Use in redaction tests.",
    whenNotToUse: "Do not use outside tests.",
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

  it("redacts model observation and user projection without leaking complete handler output", async () => {
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

    expect(serializedObservation).not.toContain("server-only-secret");
    expect(serializedObservation).toContain("[redacted]");
    expect(auditRedactedValue(observation).ok).toBe(true);
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
