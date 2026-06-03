import { defineTool } from "@/lib/server/agent-core/define-tool";
import { toolToManifest } from "@/lib/server/agent-core/manifest";
import { lintToolManifest } from "@/lib/server/agent-core/manifest-hardening";
import { auditRedactedValue } from "@/lib/server/agent-core/redaction";
import type { AnyTool, ToolManifestLintIssue } from "@/lib/server/agent-core/contracts";

export type ToolContractCheckResult = {
  ok: boolean;
  issues: ToolManifestLintIssue[];
};

/** checkToolContractForProduction 验证 fixture 或未来业务 tool 的 manifest、policy、projection 和 redaction 边界。 */
export function checkToolContractForProduction(tool: AnyTool): ToolContractCheckResult {
  const issues: ToolManifestLintIssue[] = [];

  try {
    defineTool(tool);
  } catch (error) {
    issues.push({
      code: "missing_required_field",
      path: "$",
      message: (error as Error).message,
    });
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
