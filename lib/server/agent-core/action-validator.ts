import {
  parseAgentAction,
  type AgentAction,
  type TerminalAgentAction,
  type ToolCallAction,
  type ToolManifest,
  type ToolResult,
} from "./contracts";
import { assertM0ExecutableTool } from "./define-tool";
import { AGENT_ERROR_CODES, AgentContractError } from "./errors";
import type { ToolRegistry } from "./tool-registry";
import type { ToolError } from "./contracts";

/** ActionValidationInput 汇总 validator 校验 action 所需的 registry、manifest 和本轮结果引用。 */
export type ActionValidationInput = {
  action: unknown;
  registry: ToolRegistry;
  manifests: ToolManifest[];
  toolResults: ToolResult[];
};

/** ActionValidationResult 用稳定 ToolError 表达 action 是否可执行。 */
export type ActionValidationResult =
  | { ok: true; action: AgentAction }
  | { ok: false; error: ToolError };

/** validateAgentAction 在执行前校验 action 结构、tool 可用性、input schema 和 M0 resource 禁用边界。 */
export function validateAgentAction(input: ActionValidationInput): ActionValidationResult {
  const parsed = parseAgentAction(input.action);

  if (!parsed.success) {
    return invalidAction("Planner returned an action outside the M0 AgentAction contract.");
  }

  const action = parsed.data;

  if (action.type === "tool_call") {
    return validateToolCallAction(action, input);
  }

  return validateTerminalAction(action, input.toolResults);
}

function validateToolCallAction(action: ToolCallAction, input: ActionValidationInput): ActionValidationResult {
  if (action.consumes?.length) {
    return {
      ok: false,
      error: createToolError(
        AGENT_ERROR_CODES.INVALID_RESOURCE_REFERENCE,
        "M0 does not consume resource references. ResourceStore belongs to M1.",
      ),
    };
  }

  const tool = input.registry.get(action.toolName);
  if (!tool) {
    return {
      ok: false,
      error: createToolError(AGENT_ERROR_CODES.UNKNOWN_TOOL, `Tool "${action.toolName}" is not registered.`),
    };
  }

  const isVisible = input.manifests.some((manifest) => manifest.name === action.toolName);
  if (!isVisible) {
    try {
      assertM0ExecutableTool(tool);
    } catch (error) {
      if (error instanceof AgentContractError) {
        return {
          ok: false,
          error: createToolError(error.code, error.message),
        };
      }
      throw error;
    }

    return {
      ok: false,
      error: createToolError(
        AGENT_ERROR_CODES.UNSUPPORTED_M0_CAPABILITY,
        `Tool "${action.toolName}" is not available in the current M0 manifest.`,
      ),
    };
  }

  const inputResult = tool.inputSchema.safeParse(action.input);
  if (!inputResult.success) {
    return {
      ok: false,
      error: createToolError(
        AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
        `Tool "${action.toolName}" input does not match its schema.`,
      ),
    };
  }

  return { ok: true, action };
}

function validateTerminalAction(action: TerminalAgentAction, toolResults: ToolResult[]): ActionValidationResult {
  if (action.usedResourceRefs?.length) {
    return {
      ok: false,
      error: createToolError(
        AGENT_ERROR_CODES.INVALID_RESOURCE_REFERENCE,
        "M0 terminal actions cannot use resource references. ResourceStore belongs to M1.",
      ),
    };
  }

  const knownToolResultIds = new Set(toolResults.map((result) => result.toolResultId));
  const usedToolResultIds = action.usedToolResultIds ?? [];
  const unknownIds = usedToolResultIds.filter((id) => !knownToolResultIds.has(id));

  if (unknownIds.length > 0) {
    return {
      ok: false,
      error: createToolError(
        AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
        "Terminal action references tool results that do not exist in the current run.",
        { unknownIds },
      ),
    };
  }

  return { ok: true, action };
}

function invalidAction(message: string): ActionValidationResult {
  return {
    ok: false,
    error: createToolError(AGENT_ERROR_CODES.INVALID_ACTION, message),
  };
}

/** createToolError 将 validator/runtime 错误收敛成 renderer 可消费的 ToolError。 */
export function createToolError(code: ToolError["code"], message: string, details?: ToolError["details"]): ToolError {
  return {
    code,
    message,
    retryable: code === AGENT_ERROR_CODES.TIMEOUT || code === AGENT_ERROR_CODES.OVERALL_TIMEOUT,
    details,
  };
}

