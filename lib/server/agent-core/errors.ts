/** AgentErrorCode 是 Agent core 跨 validator、executor、runtime 和 renderer 共用的稳定诊断码集合。 */
export const AGENT_ERROR_CODES = {
  UNKNOWN_TOOL: "unknown_tool",
  DUPLICATE_TOOL: "duplicate_tool",
  INVALID_TOOL_DEFINITION: "invalid_tool_definition",
  INVALID_TOOL_INPUT: "invalid_tool_input",
  INVALID_TOOL_OUTPUT: "invalid_tool_output",
  INVALID_ACTION: "invalid_action",
  INVALID_RESOURCE_REFERENCE: "invalid_resource_reference",
  RESOURCE_MISSING: "resource_missing",
  RESOURCE_RUN_MISMATCH: "resource_run_mismatch",
  RESOURCE_ROLE_INVALID: "resource_role_invalid",
  RESOURCE_TYPE_INVALID: "resource_type_invalid",
  RESOURCE_REQUIREMENT_UNMET: "resource_requirement_unmet",
  RESOURCE_CONTRACT_VIOLATION: "resource_contract_violation",
  TERMINAL_REFERENCE_INVALID: "terminal_reference_invalid",
  UNSUPPORTED_M0_CAPABILITY: "unsupported_m0_capability",
  POLICY_DENIED: "policy_denied",
  CONFIRMATION_REQUIRED: "confirmation_required",
  CONFIRMATION_EXPIRED: "confirmation_expired",
  CONFIRMATION_CONSUMED: "confirmation_consumed",
  CONFIRMATION_HASH_INVALID: "confirmation_hash_invalid",
  CONFIRMATION_CLIENT_FORBIDDEN: "confirmation_client_forbidden",
  TIMEOUT: "timeout",
  ABORTED: "aborted",
  HANDLER_ERROR: "handler_error",
  DUPLICATE_TOOL_FAILURE: "duplicate_tool_failure",
  DUPLICATE_TOOL_INPUT: "duplicate_tool_input",
  BUDGET_EXHAUSTED: "budget_exhausted",
  PLANNER_EXHAUSTED: "planner_exhausted",
  MAX_STEPS_EXCEEDED: "max_steps_exceeded",
  MAX_TOOL_CALLS_EXCEEDED: "max_tool_calls_exceeded",
  OVERALL_TIMEOUT: "overall_timeout",
  REPAIR_LIMIT_EXCEEDED: "repair_limit_exceeded",
} as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[keyof typeof AGENT_ERROR_CODES];

/** AgentContractError 用于在启动校验和运行时边界中抛出带稳定 code 的内部错误。 */
export class AgentContractError extends Error {
  readonly code: AgentErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: AgentErrorCode, message: string, options: { retryable?: boolean; details?: unknown } = {}) {
    super(message);
    this.name = "AgentContractError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

/** isAgentContractError 用于把未知异常归一化到 M0 稳定错误合同。 */
export function isAgentContractError(error: unknown): error is AgentContractError {
  return error instanceof AgentContractError;
}
