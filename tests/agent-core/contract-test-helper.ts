import { defineTool } from "@/lib/server/agent-core/define-tool";
import { toTerminalToolResultRefs } from "@/lib/server/agent-core/contracts";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { executeTool } from "@/lib/server/agent-core/executor";
import { toolToManifest } from "@/lib/server/agent-core/manifest";
import { lintToolManifest } from "@/lib/server/agent-core/manifest-hardening";
import { createToolObservation } from "@/lib/server/agent-core/observation";
import { auditRedactedValue } from "@/lib/server/agent-core/redaction";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { auditAgentTrace } from "@/lib/server/agent-core/trace-audit";
import type { AgentTraceEvent, AnyTool, JsonValue, ToolManifestLintIssue } from "@/lib/server/agent-core/contracts";

export type ToolContractGovernanceIssueCode =
  | ToolManifestLintIssue["code"]
  | "missing_schema"
  | "missing_policy_metadata"
  | "missing_resource_contract_field"
  | "handler_error_not_normalized"
  | "projection_leak"
  | "trace_projection_leak"
  | "invalid_input_not_rejected"
  | "valid_input_failed";

export type ToolContractGovernanceIssue = Omit<ToolManifestLintIssue, "code"> & {
  code: ToolContractGovernanceIssueCode;
};

export type ToolContractCheckResult = {
  ok: boolean;
  issues: ToolContractGovernanceIssue[];
};

export type ToolRuntimeSafetyScenario = {
  tool: AnyTool;
  validInput: unknown;
  invalidInput?: unknown;
  unsafeNeedles?: string[];
  expectHandlerError?: boolean;
  runId?: string;
  timeoutMs?: number;
};

/** checkToolContractForProduction 验证 fixture 或未来业务 tool 的 manifest、policy、projection 和 redaction 边界。 */
export function checkToolContractForProduction(tool: AnyTool): ToolContractCheckResult {
  const issues: ToolContractGovernanceIssue[] = [];

  try {
    defineTool(tool);
  } catch (error) {
    issues.push({
      code: "missing_required_field",
      path: "$",
      message: (error as Error).message,
    });
  }

  if (typeof tool.inputSchema?.safeParse !== "function") {
    issues.push({
      code: "missing_schema",
      path: "$.inputSchema",
      message: "Tool must expose a Zod-compatible inputSchema.",
    });
  }

  if (typeof tool.outputSchema?.safeParse !== "function") {
    issues.push({
      code: "missing_schema",
      path: "$.outputSchema",
      message: "Tool must expose a Zod-compatible outputSchema.",
    });
  }

  if (!tool.policy?.sideEffect || !tool.policy?.riskLevel || !tool.policy?.confirmation) {
    issues.push({
      code: "missing_policy_metadata",
      path: "$.policy",
      message: "Tool must declare sideEffect, riskLevel and confirmation metadata.",
    });
  }

  for (const [index, requirement] of (tool.resourceContract?.requires ?? []).entries()) {
    if (!requirement.resourceType) {
      issues.push({
        code: "missing_resource_contract_field",
        path: `$.resourceContract.requires[${index}].resourceType`,
        message: "Resource requirements must name the required resourceType.",
      });
    }
  }

  for (const [index, production] of (tool.resourceContract?.produces ?? []).entries()) {
    if (!production.resourceType || !production.role) {
      issues.push({
        code: "missing_resource_contract_field",
        path: `$.resourceContract.produces[${index}]`,
        message: "Resource productions must name resourceType and role.",
      });
    }
  }

  if (typeof tool.toModelObservation !== "function" || typeof tool.toUserProjection !== "function") {
    issues.push({
      code: "missing_required_field",
      path: "$.projection",
      message: "Tool must provide safe model and user projections for production hardening.",
    });
  }

  const manifest = toolToManifest(tool);
  const lint = lintToolManifest(manifest);
  issues.push(...lint.issues);

  const audit = auditRedactedValue(manifest);
  for (const finding of audit.findings) {
    issues.push({
      code: "sensitive_field",
      path: finding.path,
      message: finding.message,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/** checkToolRuntimeSafety 验证 handler 错误归一化、projection、user event 和 trace 摘要不会泄漏完整输出。 */
export async function checkToolRuntimeSafety(scenario: ToolRuntimeSafetyScenario): Promise<ToolContractCheckResult> {
  const issues: ToolContractGovernanceIssue[] = [];
  const run = {
    runId: scenario.runId ?? `run-contract-${scenario.tool.name}`,
    actor: { userId: "contract-user" },
    userInput: "contract test",
  };

  if (scenario.invalidInput !== undefined) {
    const invalidResult = await executeTool({
      tool: scenario.tool,
      input: scenario.invalidInput,
      run,
      timeoutMs: scenario.timeoutMs ?? 100,
      toolCallId: "tc_invalid",
    });

    if (invalidResult.ok || invalidResult.error.code !== AGENT_ERROR_CODES.INVALID_TOOL_INPUT) {
      issues.push({
        code: "invalid_input_not_rejected",
        path: "$.inputSchema",
        message: "Invalid input must be rejected before handler execution.",
      });
    }
  }

  const result = await executeTool({
    tool: scenario.tool,
    input: scenario.validInput,
    run,
    timeoutMs: scenario.timeoutMs ?? 100,
    toolCallId: "tc_valid",
  });

  if (scenario.expectHandlerError) {
    if (result.ok || result.error.code !== AGENT_ERROR_CODES.HANDLER_ERROR) {
      issues.push({
        code: "handler_error_not_normalized",
        path: "$.handler",
        message: "Handler exceptions must normalize to HANDLER_ERROR.",
      });
    }
    return { ok: issues.length === 0, issues };
  }

  if (!result.ok) {
    issues.push({
      code: "valid_input_failed",
      path: "$.handler",
      message: `Valid input failed with ${result.error.code}.`,
    });
    return { ok: false, issues };
  }

  const observation = createToolObservation(result);
  const userEvents = renderAgentResponseEvents({
    runId: run.runId,
    status: "completed",
    terminalAction: {
      type: "final_answer",
      content: "contract done",
      usedRefs: toTerminalToolResultRefs([result.toolResultId]),
    },
    toolResults: [result],
    observations: [observation],
    traceEvents: [],
    steps: 1,
  });
  const traceProjection = createTraceProjection(result.toolResultId, result.fulfillment.producedResources?.[0], result.projection.model);
  const auditedSurfaces = {
    modelObservation: observation,
    userEvents,
    traceProjection,
  };
  const redactionAudit = auditRedactedValue(auditedSurfaces);
  const traceAudit = auditAgentTrace(traceProjection);

  if (!redactionAudit.ok) {
    for (const finding of redactionAudit.findings) {
      issues.push({
        code: "projection_leak",
        path: finding.path,
        message: finding.message,
      });
    }
  }

  if (!traceAudit.ok) {
    for (const finding of traceAudit.findings) {
      issues.push({
        code: "trace_projection_leak",
        path: finding.path,
        message: finding.message,
      });
    }
  }

  for (const needle of scenario.unsafeNeedles ?? []) {
    if (JSON.stringify(auditedSurfaces).includes(needle)) {
      issues.push({
        code: "projection_leak",
        path: "$.projection",
        message: `Unsafe value leaked to model, user event or trace projection: ${needle}`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createTraceProjection(toolResultId: string, resource: JsonValue | undefined, summary: JsonValue | undefined): AgentTraceEvent[] {
  if (resource && typeof resource === "object" && !Array.isArray(resource)) {
    return [
      {
        type: "resource_registered",
        toolResultId,
        resource: resource as Extract<AgentTraceEvent, { type: "resource_registered" }>["resource"],
        summary: summary ?? {},
      },
    ];
  }

  return [
    {
      type: "registry_snapshot",
      snapshotId: "contract-helper-snapshot",
      manifestHash: "contract-helper",
      toolCount: 1,
    },
  ];
}
