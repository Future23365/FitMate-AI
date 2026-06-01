import "server-only";

import { ZodError, z, type ZodType } from "zod";

import {
  agentToolDecisionSchema,
  agentToolDomainCapabilityContractSchema,
  type AgentToolAccessLevel,
  type AgentToolDecision,
  type AgentToolDependency,
  type AgentToolDomainCapabilityContract,
  type AgentToolError,
} from "./contracts";

export type AgentToolExecutionContext = {
  runId: string;
  userId: string;
  sessionId: string;
  traceId?: string;
  deadlineAt?: number;
};

export type AgentToolExecutionResult<Output> =
  | {
      ok: true;
      output: Output;
      toolResultId: string;
      modelSummary: unknown;
      traceSummary: unknown;
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
  writableResources?: string[];
};

export type AgentToolRegistrationIssue = {
  toolName: string;
  code:
    | "invalid_name"
    | "duplicate_tool"
    | "missing_description"
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
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      accessLevel: tool.accessLevel,
      inputJsonSchemaHint: z.toJSONSchema(tool.inputSchema),
      dependencies: tool.dependencies,
      writableResources: tool.domainCapability?.writableResources,
    }));
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

export type AgentToolDecisionParseResult =
  | { ok: true; decision: AgentToolDecision }
  | {
      ok: false;
      code: "invalid_json" | "invalid_decision" | "unknown_tool";
      message: string;
      detail?: unknown;
      rawContent?: string;
    };

// parseAgentToolDecision validates structured model output and rejects tools outside the registry.
export function parseAgentToolDecision(
  value: unknown,
  registry: Pick<AgentToolRegistry, "has">,
): AgentToolDecisionParseResult {
  if (Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_decision",
      message: "Agent tool decision must not request multiple tools.",
    };
  }

  const parsed = agentToolDecisionSchema.safeParse(value);
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

// parseAgentJsonObject accepts plain JSON or fenced JSON from structured-output fallback providers.
export function parseAgentJsonObject(content: string):
  | { ok: true; value: unknown }
  | { ok: false; code: "invalid_json"; message: string; detail?: unknown } {
  const normalized = content.trim();
  const jsonText = normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;

  try {
    return { ok: true, value: JSON.parse(jsonText) };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_json",
      message: "Agent model output is not valid JSON.",
      detail: error instanceof Error ? error.message : error,
    };
  }
}

function summarizeZodIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
