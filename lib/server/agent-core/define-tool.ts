import { AgentContractError, AGENT_ERROR_CODES } from "./errors";
import type { Tool, ToolExample, ToolPolicy, ToolResourceContract } from "./contracts";

/** defineTool 在注册前校验 tool 合同完整性，防止不完整能力进入 Planner 或 Executor。 */
export function defineTool<Input, Output>(tool: Tool<Input, Output>): Tool<Input, Output> {
  assertNonEmptyString(tool.name, "name");
  assertNonEmptyString(tool.version, "version");
  assertNonEmptyString(tool.description, "description");
  assertNonEmptyString(tool.whenToUse, "whenToUse");
  assertNonEmptyString(tool.whenNotToUse, "whenNotToUse");
  assertZodSchema(tool.inputSchema, "inputSchema");
  assertZodSchema(tool.outputSchema, "outputSchema");
  assertPolicy(tool.policy);
  assertResourceContract(tool.resourceContract);
  assertExamples(tool.name, tool.examples, tool.inputSchema);

  if (typeof tool.handler !== "function") {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      "Tool handler must be a function.",
      { details: { field: "handler" } },
    );
  }

  return Object.freeze({ ...tool });
}

function assertExamples(toolName: string, examples: ToolExample[] | undefined, inputSchema: Tool["inputSchema"]) {
  for (const [index, example] of (examples ?? []).entries()) {
    if (example.action?.type !== "tool_call") {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool example action.type must be tool_call.",
        { details: { field: `examples[${index}].action.type` } },
      );
    }

    if (example.action.toolName !== toolName) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool example action.toolName must match the tool name.",
        { details: { field: `examples[${index}].action.toolName`, toolName } },
      );
    }

    const parsedInput = inputSchema.safeParse(example.action.input);
    if (!parsedInput.success) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool example action.input must match the tool input schema.",
        {
          details: {
            field: `examples[${index}].action.input`,
            toolName,
            issues: parsedInput.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
      );
    }
  }
}

/** isM0ExecutablePolicy 表达 M0 只能执行低风险、无需确认、只读 tool 的安全边界。 */
export function isM0ExecutablePolicy(policy: ToolPolicy): boolean {
  return policy.sideEffect === "read" && policy.riskLevel === "low" && policy.confirmation === "never";
}

/** assertM0ExecutableTool 在执行前阻断 write、高风险或需要确认的 tool。 */
export function assertM0ExecutableTool(tool: Tool) {
  if (!isM0ExecutablePolicy(tool.policy)) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.UNSUPPORTED_M0_CAPABILITY,
      "M0 runtime can only execute read, low risk tools that never require confirmation.",
      {
        details: {
          toolName: tool.name,
          sideEffect: tool.policy.sideEffect,
          riskLevel: tool.policy.riskLevel,
          confirmation: tool.policy.confirmation,
        },
      },
    );
  }
}

function assertNonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      `Tool ${field} must be a non-empty string.`,
      { details: { field } },
    );
  }
}

function assertZodSchema(value: unknown, field: string) {
  if (!value || typeof (value as { safeParse?: unknown }).safeParse !== "function") {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      `Tool ${field} must be a Zod schema.`,
      { details: { field } },
    );
  }
}

function assertPolicy(policy: ToolPolicy | undefined) {
  if (!policy) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      "Tool policy is required.",
      { details: { field: "policy" } },
    );
  }

  if (!["read", "write"].includes(policy.sideEffect)) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      "Tool policy.sideEffect is invalid.",
      { details: { field: "policy.sideEffect" } },
    );
  }

  if (!["low", "medium", "high"].includes(policy.riskLevel)) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      "Tool policy.riskLevel is invalid.",
      { details: { field: "policy.riskLevel" } },
    );
  }

  if (!["never", "required", "always", "dynamic"].includes(policy.confirmation)) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      "Tool policy.confirmation is invalid.",
      { details: { field: "policy.confirmation" } },
    );
  }

  if (policy.permissions && !policy.permissions.every((permission) => typeof permission === "string" && permission.length > 0)) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
      "Tool policy.permissions must be non-empty strings.",
      { details: { field: "policy.permissions" } },
    );
  }
}

function assertResourceContract(contract: ToolResourceContract | undefined) {
  if (!contract) {
    return;
  }

  for (const requirement of contract.requires ?? []) {
    if (typeof requirement.resourceType !== "string" || requirement.resourceType.length === 0) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool resourceContract.requires[].resourceType must be a non-empty string.",
        { details: { field: "resourceContract.requires.resourceType" } },
      );
    }

    if (requirement.role && !["consumable", "diagnostic"].includes(requirement.role)) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool resourceContract.requires[].role is invalid.",
        { details: { field: "resourceContract.requires.role" } },
      );
    }
  }

  for (const production of contract.produces ?? []) {
    if (typeof production.resourceType !== "string" || production.resourceType.length === 0) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool resourceContract.produces[].resourceType must be a non-empty string.",
        { details: { field: "resourceContract.produces.resourceType" } },
      );
    }

    if (!["consumable", "diagnostic"].includes(production.role)) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
        "Tool resourceContract.produces[].role is invalid.",
        { details: { field: "resourceContract.produces.role" } },
      );
    }
  }
}
