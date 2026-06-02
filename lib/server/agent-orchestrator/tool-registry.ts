import "server-only";

import { ZodError, z, type ZodType } from "zod";

import {
  agentExecutionResultSchema,
  agentToolCapabilityContractSchema,
  agentToolDecisionSchema,
  agentToolDomainCapabilityContractSchema,
  type AgentToolAccessLevel,
  type AgentToolCapabilityContract,
  type AgentToolDecision,
  type AgentToolDependency,
  type AgentToolDomainCapabilityContract,
  type AgentToolError,
  type AgentToolResultFulfillment,
  type AgentToolResultRecord,
  type ContextPackage,
} from "./contracts";

export type AgentToolExecutionContext = {
  runId: string;
  userId: string;
  sessionId: string;
  /** 当前 assistant response message id 来自服务端聊天流，用于写工具绑定 artifact 气泡。 */
  responseMessageId?: string;
  traceId?: string;
  deadlineAt?: number;
  /** 原始 ContextPackage 只作为结构化事实边界传入工具，工具不得读取自然语言原文重解释语义。 */
  contextPackage?: ContextPackage;
  toolResults?: AgentToolResultRecord[];
};

export type AgentToolExecutionResult<Output> =
  | {
      ok: true;
      output: Output;
      toolResultId: string;
      modelSummary: unknown;
      traceSummary: unknown;
      fulfillment?: AgentToolResultFulfillment;
    }
  | {
      ok: false;
      error: AgentToolError;
      traceSummary?: unknown;
    };

export type AgentToolDefinition<Input, Output> = {
  name: string;
  description: string;
  accessLevel: AgentToolAccessLevel;
  inputSchema: ZodType<Input>;
  dependencies: AgentToolDependency[];
  capabilityContract?: AgentToolCapabilityContract;
  domainCapability?: AgentToolDomainCapabilityContract;
  getIdempotencyKey(input: Input, context: AgentToolExecutionContext): string;
  summarizeOutput(output: Output): unknown;
  summarizeTrace(result: AgentToolExecutionResult<Output>): unknown;
  summarizeForResponseWriter?(output: Output): unknown;
  execute(input: Input, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult<Output>>;
};

export type AgentToolDefinitionSummary = {
  name: string;
  description: string;
  accessLevel: AgentToolAccessLevel;
  inputJsonSchemaHint: unknown;
  dependencies: AgentToolDependency[];
  capabilityContract: AgentToolCapabilityContract;
  toolRequestContractSummary: unknown;
  writableResources?: string[];
};

export type AgentToolRegistrationIssue = {
  toolName: string;
  code:
    | "invalid_name"
    | "duplicate_tool"
    | "missing_description"
    | "missing_capability_contract"
    | "invalid_capability_contract"
    | "missing_dependency"
    | "missing_write_contract"
    | "invalid_write_contract"
    | "missing_response_writer_summary";
  message: string;
  detail?: unknown;
};

// AgentToolRegistry is the service-side whitelist for model-visible Agent tools.
export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition<unknown, unknown>>();

  constructor(definitions: AgentToolDefinition<unknown, unknown>[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register<Input, Output>(definition: AgentToolDefinition<Input, Output>) {
    const issues = validateAgentToolDefinition(definition, this.tools.has(definition.name));
    if (issues.length > 0) {
      throw new AgentToolRegistryContractError(issues);
    }
    this.tools.set(definition.name, definition as AgentToolDefinition<unknown, unknown>);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  has(name: string) {
    return this.tools.has(name);
  }

  list() {
    return Array.from(this.tools.values());
  }

  listModelDefinitions(): AgentToolDefinitionSummary[] {
    return this.list().map((tool) => {
      const capabilityContract = tool.capabilityContract as AgentToolCapabilityContract;

      return {
        name: tool.name,
        description: tool.description,
        accessLevel: tool.accessLevel,
        inputJsonSchemaHint: z.toJSONSchema(tool.inputSchema),
        dependencies: tool.dependencies,
        capabilityContract,
        toolRequestContractSummary: summarizeToolRequestContract(capabilityContract),
        writableResources: tool.domainCapability?.writableResources,
      };
    });
  }
}

// createAgentToolRegistry centralizes registry construction for later phase-specific tool composition.
export function createAgentToolRegistry(definitions: AgentToolDefinition<unknown, unknown>[] = []) {
  return new AgentToolRegistry(definitions);
}

export class AgentToolRegistryContractError extends Error {
  readonly issues: AgentToolRegistrationIssue[];

  constructor(issues: AgentToolRegistrationIssue[]) {
    super("Agent tool definition violates registry contract.");
    this.name = "AgentToolRegistryContractError";
    this.issues = issues;
  }
}

// validateAgentToolDefinition enforces the shared contract before any tool becomes model-visible.
export function validateAgentToolDefinition<Input, Output>(
  definition: AgentToolDefinition<Input, Output>,
  duplicateName = false,
): AgentToolRegistrationIssue[] {
  const issues: AgentToolRegistrationIssue[] = [];
  const toolName = definition.name || "(unknown)";

  if (!/^[a-z][a-zA-Z0-9]*$/.test(definition.name)) {
    issues.push({
      toolName,
      code: "invalid_name",
      message: "Agent tool name must be lower camel case.",
    });
  }

  if (duplicateName) {
    issues.push({
      toolName,
      code: "duplicate_tool",
      message: "Agent tool name is already registered.",
    });
  }

  if (!definition.description.trim()) {
    issues.push({
      toolName,
      code: "missing_description",
      message: "Agent tool description is required.",
    });
  }

  if (!definition.capabilityContract) {
    issues.push({
      toolName,
      code: "missing_capability_contract",
      message: "Agent tools must declare a capability contract before they are model-visible.",
    });
  } else {
    const parsedCapability = agentToolCapabilityContractSchema.safeParse(definition.capabilityContract);
    if (!parsedCapability.success) {
      issues.push({
        toolName,
        code: "invalid_capability_contract",
        message: "Agent tool capability contract is invalid.",
        detail: summarizeZodIssues(parsedCapability.error),
      });
    }
  }

  if (definition.accessLevel === "write" && definition.dependencies.length === 0) {
    issues.push({
      toolName,
      code: "missing_dependency",
      message: "Write tools must declare dependency requirements.",
    });
  }

  if (definition.accessLevel === "write") {
    if (!definition.domainCapability) {
      issues.push({
        toolName,
        code: "missing_write_contract",
        message: "Write tools must declare a domain capability contract.",
      });
    } else {
      const parsedContract = agentToolDomainCapabilityContractSchema.safeParse(definition.domainCapability);
      if (!parsedContract.success) {
        issues.push({
          toolName,
          code: "invalid_write_contract",
          message: "Write tool domain capability contract is invalid.",
          detail: summarizeZodIssues(parsedContract.error),
        });
      }
    }

    if (!definition.summarizeForResponseWriter) {
      issues.push({
        toolName,
        code: "missing_response_writer_summary",
        message: "Write tools must provide a Response Writer safe summary projector.",
      });
    }
  }

  return issues;
}

// summarizeToolRequestContract 是模型可见摘要的单一来源，避免 prompt 和 trace 各写一套工具边界。
function summarizeToolRequestContract(contract: AgentToolCapabilityContract) {
  return {
    operationKind: contract.operationKind,
    supportedOperations: contract.supportedOperations,
    hardConstraints: contract.inputContract.hardConstraintFields,
    softPreferences: contract.inputContract.softPreferenceFields,
    resultRequirements: contract.inputContract.resultRequirementFields,
    projection: contract.inputContract.projectionFields,
    acceptedFilters: contract.inputContract.acceptedFilters,
    acceptedEnums: contract.inputContract.acceptedEnums,
    refusesWhen: contract.refusesWhen,
    unsupportedOperations: contract.unsupportedOperations,
    failureCodes: contract.failureCodes,
    evidence: contract.evidence,
  };
}

export type AgentToolDecisionParseResult =
  | { ok: true; decision: AgentToolDecision }
  | {
      ok: false;
      code: "invalid_json" | "invalid_decision" | "unknown_tool";
      message: string;
      detail?: unknown;
      rawContent?: string;
    };

export type AgentJsonParseRecovery = {
  strategy: "balanced_json_object";
  strictFailure: {
    code: "invalid_json";
    message: string;
    detail?: unknown;
  };
  discardedLeadingChars: number;
  discardedTrailingChars: number;
  recoveredTextLength: number;
};

export type AgentJsonObjectParseResult =
  | { ok: true; value: unknown; recovery?: AgentJsonParseRecovery }
  | { ok: false; code: "invalid_json"; message: string; detail?: unknown };

// parseAgentToolDecision validates structured model output and rejects tools outside the registry.
export function parseAgentToolDecision(
  value: unknown,
  registry: Pick<AgentToolRegistry, "has">,
): AgentToolDecisionParseResult {
  const normalizedValue = normalizeToolNameActionDecision(
    normalizeMissingFinalResultReason(normalizeLegacyFinalResult(value)),
    registry,
  );

  if (Array.isArray(normalizedValue)) {
    return {
      ok: false,
      code: "invalid_decision",
      message: "Agent tool decision must not request multiple tools.",
    };
  }

  const parsed = agentToolDecisionSchema.safeParse(normalizedValue);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_decision",
      message: "Agent tool decision did not match schema.",
      detail: summarizeZodIssues(parsed.error),
    };
  }

  if (parsed.data.action === "call_tool" && !registry.has(parsed.data.toolName)) {
    return {
      ok: false,
      code: "unknown_tool",
      message: "Agent tool decision referenced an unregistered tool.",
      detail: { toolName: parsed.data.toolName },
    };
  }

  return { ok: true, decision: parsed.data };
}

// normalizeToolNameActionDecision 只把“action 直接写成已注册工具名”的模型输出转回合法 call_tool 形态。
function normalizeToolNameActionDecision(
  value: unknown,
  registry: Pick<AgentToolRegistry, "has">,
) {
  if (!isPlainObject(value) || typeof value.action !== "string") {
    return value;
  }

  if (value.action === "call_tool" || value.action === "final_result" || !registry.has(value.action)) {
    return value;
  }

  if (!("input" in value)) {
    return value;
  }

  return {
    action: "call_tool",
    toolName: value.action,
    input: value.input,
    reason: typeof value.reason === "string" && value.reason.trim()
      ? value.reason
      : `调用 ${value.action} 工具。`,
  };
}

// 只修正模型旧形态 final_result 字段位置，不改写状态、引用或用户语义。
function normalizeLegacyFinalResult(value: unknown) {
  if (!isPlainObject(value) || value.action !== "final_result" || !isPlainObject(value.result)) {
    return value;
  }

  const result = value.result;
  if (result.status === "blocked" && typeof result.blockReason !== "string") {
    const replyContext = isPlainObject(result.replyContext) ? result.replyContext : undefined;
    const legacyReply = typeof replyContext?.reply === "string" ? replyContext.reply.trim() : "";
    if (!legacyReply) {
      return value;
    }

    return {
      ...value,
      result: {
        ...result,
        blockReason: legacyReply,
      },
    };
  }

  if (result.status !== "failed" || typeof result.failureCode === "string") {
    return value;
  }

  return {
    ...value,
    result: {
      ...result,
      failureCode: "tool_execution_failed",
    },
  };
}

// normalizeMissingFinalResultReason 只补齐非语义诊断字段，result 必须先满足 AgentExecutionResult 合同。
function normalizeMissingFinalResultReason(value: unknown) {
  if (!isPlainObject(value) || value.action !== "final_result" || !isPlainObject(value.result)) {
    return value;
  }

  if (typeof value.reason === "string" && value.reason.trim()) {
    return value;
  }

  const parsedResult = agentExecutionResultSchema.safeParse(value.result);
  if (!parsedResult.success) {
    return value;
  }

  return {
    ...value,
    result: parsedResult.data,
    reason: "模型返回了合法终止结果但缺少 reason，runtime 已补齐诊断原因。",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// parseAgentJsonObject accepts model JSON and only repairs non-semantic object boundary noise.
export function parseAgentJsonObject(content: string): AgentJsonObjectParseResult {
  return parseJsonObjectWithRecovery(content, "Agent model output is not valid JSON.");
}

// parseJsonObjectWithRecovery 只恢复 JSON 文本边界，不合成或改写任何 Agent 语义字段。
export function parseJsonObjectWithRecovery(content: string, message: string): AgentJsonObjectParseResult {
  const normalized = content.trim();
  const jsonText = normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;

  try {
    return { ok: true, value: JSON.parse(jsonText) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : error;
    const recovered = recoverJsonObjectBoundary(jsonText, {
      code: "invalid_json",
      message,
      detail,
    });

    if (recovered) {
      return recovered;
    }

    return {
      ok: false,
      code: "invalid_json",
      message,
      detail,
    };
  }
}

function summarizeZodIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function recoverJsonObjectBoundary(
  text: string,
  strictFailure: AgentJsonParseRecovery["strictFailure"],
): Extract<AgentJsonObjectParseResult, { ok: true }> | null {
  const candidates: Array<{
    jsonText: string;
    start: number;
    end: number;
    value: unknown;
  }> = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") {
      continue;
    }

    const end = findBalancedJsonObjectEnd(text, index);
    if (end === null) {
      continue;
    }

    const jsonText = text.slice(index, end);
    try {
      const value = JSON.parse(jsonText);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        candidates.push({ jsonText, start: index, end, value });
      }
    } catch {
      // 非候选 JSON 片段继续扫描，避免解释文本中的花括号影响真正对象。
    }
  }

  const outermostCandidates = candidates.filter((candidate) => (
    !candidates.some((other) => other.start < candidate.start && other.end >= candidate.end)
  ));

  if (outermostCandidates.length !== 1) {
    return null;
  }

  const [candidate] = outermostCandidates;

  return {
    ok: true,
    value: candidate.value,
    recovery: {
      strategy: "balanced_json_object",
      strictFailure,
      discardedLeadingChars: candidate.start,
      discardedTrailingChars: text.length - candidate.end,
      recoveredTextLength: candidate.jsonText.length,
    },
  };
}

function findBalancedJsonObjectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
      if (depth < 0) {
        return null;
      }
    }
  }

  return null;
}
