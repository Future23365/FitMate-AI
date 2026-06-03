import type { AgentActor, AnyTool, PolicyDecision, ToolCallAction, ToolError } from "./contracts";
import { AGENT_ERROR_CODES } from "./errors";

/** PolicyGuardInput 是 Executor 前策略裁决所需的结构化事实，不包含用户自然语言原文。 */
export type PolicyGuardInput = {
  actor: AgentActor;
  tool: AnyTool;
  action: ToolCallAction;
  now?: Date;
  confirmationSatisfied?: boolean;
};

/** evaluateToolPolicy 基于权限、tool policy、风险和确认策略输出 allow/deny/requires_confirmation。 */
export function evaluateToolPolicy(input: PolicyGuardInput): PolicyDecision {
  const policyVersion = input.tool.policy.policyVersion ?? `${input.tool.name}@${input.tool.version}:policy:v1`;
  const missingPermissions = getMissingPermissions(input.actor.permissions ?? [], input.tool.policy.permissions ?? []);

  if (missingPermissions.length > 0) {
    return {
      kind: "deny",
      policyVersion,
      error: createPolicyError(
        AGENT_ERROR_CODES.POLICY_DENIED,
        "Actor does not have permissions required by the tool policy.",
        { missingPermissions, toolName: input.tool.name },
      ),
    };
  }

  if (input.confirmationSatisfied) {
    return {
      kind: "allow",
      policyVersion,
      reason: "Confirmation was satisfied for the saved pending action.",
    };
  }

  if (requiresConfirmation(input.tool)) {
    return {
      kind: "requires_confirmation",
      policyVersion,
      message: input.tool.policy.confirmationMessage ?? `需要确认后才能执行 ${input.tool.name}。`,
      expiresAt: new Date((input.now ?? new Date()).getTime() + (input.tool.policy.confirmationExpiresInMs ?? 5 * 60_000)).toISOString(),
    };
  }

  return {
    kind: "allow",
    policyVersion,
    reason: "Tool policy allows execution.",
  };
}

function requiresConfirmation(tool: AnyTool) {
  return tool.policy.confirmation === "required"
    || tool.policy.confirmation === "always"
    || tool.policy.sideEffect === "write"
    || tool.policy.riskLevel === "high"
    || (tool.policy.confirmation === "dynamic" && tool.policy.riskLevel === "medium");
}

function getMissingPermissions(actorPermissions: string[], requiredPermissions: string[]) {
  const actorPermissionSet = new Set(actorPermissions);
  return requiredPermissions.filter((permission) => !actorPermissionSet.has(permission));
}

function createPolicyError(code: ToolError["code"], message: string, details?: ToolError["details"]): ToolError {
  return {
    code,
    message,
    retryable: false,
    details,
  };
}
