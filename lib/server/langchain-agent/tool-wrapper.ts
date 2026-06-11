import "server-only";

import { tool } from "langchain";
import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";

import {
  getErrorMessage,
  stringifyForModelSummary,
  toLangChainJsonValue,
} from "./utils";
import type {
  LangChainAgentToolExecution,
  LangChainAgentRuntimeErrorCode,
  LangChainJsonValue,
  LangChainAgentSchemaIssue,
} from "./types";

export type LangChainToolWrapperContext = {
  actor: {
    userId: string;
    conversationId?: string;
  };
  signal?: AbortSignal;
};

type LangChainToolWrapperHandler<SchemaT extends z.ZodObject, OutputT> = {
  bivarianceHack(input: z.output<SchemaT>, context: LangChainToolWrapperContext): Promise<OutputT>;
}["bivarianceHack"];

type LangChainToolOutputMapper<OutputT, ResultT> = {
  bivarianceHack(output: OutputT): ResultT;
}["bivarianceHack"];

export type LangChainToolWrapperDefinition<SchemaT extends z.ZodObject, OutputT> = {
  name: string;
  description: string;
  inputSchema: SchemaT;
  outputSchema?: z.ZodType<OutputT>;
  /** executionKind 区分真实业务工具和 request-local 活动汇报工具，避免 UI 状态消耗业务工具预算。 */
  executionKind?: "business" | "activity";
  timeoutMs?: number;
  handler: LangChainToolWrapperHandler<SchemaT, OutputT>;
  toModelVisibleSummary: LangChainToolOutputMapper<OutputT, string | LangChainJsonValue>;
  toUserProjection?: LangChainToolOutputMapper<OutputT, LangChainJsonValue>;
  toTraceSummary?: LangChainToolOutputMapper<OutputT, LangChainJsonValue>;
};

export type LangChainToolWrapper<SchemaT extends z.ZodObject = z.ZodObject, OutputT = unknown> =
  LangChainToolWrapperDefinition<SchemaT, OutputT>;

export type LangChainToolExecutionRecorder = (execution: LangChainAgentToolExecution) => void | Promise<void>;
export type LangChainToolExecutionBudget = {
  reserveToolCall: (wrapper: LangChainToolWrapper) => boolean;
};

/** defineLangChainToolWrapper 定义生产 LangChain tool 的服务端 wrapper 合同，统一 schema、权限上下文、摘要和 trace 边界。 */
export function defineLangChainToolWrapper<SchemaT extends z.ZodObject, OutputT>(
  definition: LangChainToolWrapperDefinition<SchemaT, OutputT>,
): LangChainToolWrapper<SchemaT, OutputT> {
  return definition;
}

/** createExecutableLangChainTool 将项目 wrapper 转为 LangChain tool，并记录安全执行摘要。 */
export function createExecutableLangChainTool<SchemaT extends z.ZodObject, OutputT>(
  wrapper: LangChainToolWrapper<SchemaT, OutputT>,
  context: LangChainToolWrapperContext,
  recordExecution: LangChainToolExecutionRecorder,
  budget?: LangChainToolExecutionBudget,
) {
  const executableTool = tool(async (input, runtime) => {
    const budgetExceeded = budget ? !budget.reserveToolCall(wrapper) : false;
    const execution = await executeLangChainToolWrapper(wrapper, input, context, {
      toolCallId: readLangChainToolCallId(runtime),
      budgetExceeded,
    });

    await recordExecution(execution.record);

    return execution.modelMessage;
  }, {
    name: wrapper.name,
    description: wrapper.description,
    schema: wrapper.inputSchema,
  });

  return Object.assign(executableTool, {
    // ToolNode 默认会在 invoke -> call 中做本地 schema 校验，并把解析异常 stack trace 放进 ToolMessage。
    // 覆盖 invoke 可以保留 provider schema，同时把执行、校验和错误消毒统一交给项目 wrapper。
    invoke: async (input: unknown, runtime: unknown) => {
      const toolInput = readLangChainToolInvokeInput(input, runtime);
      const budgetExceeded = budget ? !budget.reserveToolCall(wrapper) : false;
      const execution = await executeLangChainToolWrapper(wrapper, toolInput.rawInput, context, {
        toolCallId: toolInput.toolCallId,
        budgetExceeded,
      });

      await recordExecution(execution.record);
      return execution.modelMessage;
    },
  });
}

function readLangChainToolCallId(runtime: unknown) {
  if (!runtime || typeof runtime !== "object") {
    return undefined;
  }

  const record = runtime as {
    toolCallId?: unknown;
    toolCall?: { id?: unknown };
  };
  if (typeof record.toolCallId === "string") {
    return record.toolCallId;
  }

  return typeof record.toolCall?.id === "string" ? record.toolCall.id : undefined;
}

function readLangChainToolInvokeInput(input: unknown, runtime: unknown) {
  if (input && typeof input === "object") {
    const record = input as {
      type?: unknown;
      id?: unknown;
      args?: unknown;
    };

    if (record.type === "tool_call" && "args" in record) {
      return {
        rawInput: record.args,
        toolCallId: typeof record.id === "string" ? record.id : readLangChainToolCallId(runtime),
      };
    }
  }

  return {
    rawInput: input,
    toolCallId: readLangChainToolCallId(runtime),
  };
}

/** executeLangChainToolWrapper 直接执行 wrapper，供 LangChain tool 和 tool-level tests 共用同一个确定性边界。 */
export async function executeLangChainToolWrapper<SchemaT extends z.ZodObject, OutputT>(
  wrapper: LangChainToolWrapper<SchemaT, OutputT>,
  rawInput: unknown,
  context: LangChainToolWrapperContext,
  options: { toolCallId?: string; budgetExceeded?: boolean } = {},
): Promise<{ modelMessage: string; record: LangChainAgentToolExecution }> {
  const startedAt = Date.now();
  const config = agentRuntimeConfig.langChain;
  const parsedInput = wrapper.inputSchema.safeParse(rawInput);
  const inputSummary = toLangChainJsonValue(rawInput, config.trace.toolArgumentsPreviewMaxLength);

  if (options.budgetExceeded) {
    return createFailedToolExecution({
      wrapper,
      toolCallId: options.toolCallId,
      startedAt,
      inputSummary,
      failureCode: "budget_exhausted",
      failureMessage: "工具调用次数超过本轮运行预算。",
      modelMessage: {
        status: "failed",
        code: "budget_exhausted",
        message: "工具调用次数超过本轮运行预算；不要继续假装工具已执行成功。",
      },
    });
  }

  if (!parsedInput.success) {
    const schemaIssues = summarizeZodIssues(parsedInput.error, rawInput);

    return createFailedToolExecution({
      wrapper,
      toolCallId: options.toolCallId,
      startedAt,
      inputSummary,
      failureCode: "tool_schema_invalid",
      failureMessage: "工具参数未通过服务端 schema 校验。",
      schemaIssues,
      modelMessage: {
        status: "failed",
        code: "tool_schema_invalid",
        message: "工具参数未通过服务端 schema 校验；请只修正 issues 中列出的字段，不要假装工具已成功。",
        issues: schemaIssues,
      },
    });
  }

  try {
    const rawOutput = await runWithToolTimeout(
      wrapper.handler(parsedInput.data, context),
      wrapper.timeoutMs ?? config.toolWrapper.defaultTimeoutMs,
    );
    const parsedOutput = wrapper.outputSchema?.safeParse(rawOutput);

    if (parsedOutput && !parsedOutput.success) {
      const schemaIssues = summarizeZodIssues(parsedOutput.error, rawOutput);

      return createFailedToolExecution({
        wrapper,
        toolCallId: options.toolCallId,
        startedAt,
        inputSummary,
        failureCode: "structured_output_validation_failed",
        failureMessage: "工具输出未通过服务端 schema 校验。",
        schemaIssues,
        modelMessage: {
          status: "failed",
          code: "structured_output_validation_failed",
          message: "工具输出未通过服务端 schema 校验；不要把该工具结果当作已成功事实。",
        },
      });
    }

    const output = parsedOutput ? parsedOutput.data : rawOutput;
    const modelVisibleSummary = stringifyForModelSummary(
      wrapper.toModelVisibleSummary(output),
      config.toolWrapper.modelVisibleSummaryMaxLength,
    );
    const rawUserProjection = wrapper.toUserProjection?.(output);
    const userProjection = rawUserProjection === undefined
      ? undefined
      : toLangChainJsonValue(rawUserProjection, config.toolWrapper.userProjectionMaxLength);
    const traceSummary = toLangChainJsonValue(
      wrapper.toTraceSummary?.(output) ?? output,
      config.toolWrapper.traceSummaryMaxLength,
    );

    return {
      modelMessage: modelVisibleSummary,
      record: {
        toolCallId: options.toolCallId,
        toolName: wrapper.name,
        executionKind: wrapper.executionKind ?? "business",
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        inputSummary,
        modelVisibleSummary,
        userProjection,
        traceSummary,
        enteredModelContext: true,
      },
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const failureCode: LangChainAgentRuntimeErrorCode = message === toolTimeoutMessage
      ? "tool_timeout"
      : "tool_handler_failed";

    return createFailedToolExecution({
      wrapper,
      toolCallId: options.toolCallId,
      startedAt,
      inputSummary,
      failureCode,
      failureMessage: message,
      modelMessage: {
        status: "failed",
        code: failureCode,
        message: failureCode === "tool_timeout"
          ? "工具执行超时；请缩小请求或向用户澄清。"
          : "工具执行失败；请解释失败或改用可恢复的问题收口。",
      },
    });
  }
}

const toolTimeoutMessage = "langchain_tool_timeout";

async function runWithToolTimeout<OutputT>(promise: Promise<OutputT>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(toolTimeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createFailedToolExecution(input: {
  wrapper: LangChainToolWrapper;
  toolCallId?: string;
  startedAt: number;
  inputSummary: LangChainJsonValue;
  failureCode: LangChainAgentRuntimeErrorCode;
  failureMessage: string;
  schemaIssues?: readonly LangChainAgentSchemaIssue[];
  modelMessage: LangChainJsonValue;
}): { modelMessage: string; record: LangChainAgentToolExecution } {
  return {
    modelMessage: stringifyForModelSummary(
      input.modelMessage,
      agentRuntimeConfig.langChain.toolWrapper.modelVisibleSummaryMaxLength,
    ),
    record: {
      toolCallId: input.toolCallId,
      toolName: input.wrapper.name,
      executionKind: input.wrapper.executionKind ?? "business",
      status: "failed",
      durationMs: Date.now() - input.startedAt,
      inputSummary: input.inputSummary,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      ...(input.schemaIssues?.length ? { schemaIssues: input.schemaIssues } : {}),
      enteredModelContext: true,
    },
  };
}

// summarizeZodIssues 只记录可定位 schema 问题的稳定字段，避免把完整 tool payload 写进 trace。
function summarizeZodIssues(error: z.ZodError, rawValue: unknown): readonly LangChainAgentSchemaIssue[] {
  return error.issues.slice(0, 20).map((issue) => {
    const baseIssue: LangChainAgentSchemaIssue = {
      path: issue.path.length ? issue.path.map(String).join(".") : "$",
      code: issue.code,
      message: issue.message,
    };
    const details = issue as z.ZodIssue & {
      keys?: unknown;
      expected?: unknown;
      received?: unknown;
      values?: unknown;
      options?: unknown;
    };
    const actual = isSensitiveIssuePath(issue.path)
      ? "redacted"
      : summarizeIssueActualValue(readIssuePathValue(rawValue, issue.path));

    return {
      ...baseIssue,
      ...readStringArrayIssueField(details.keys, "keys"),
      ...readExpectedIssueField(details),
      ...readStringIssueField(details.received, "received"),
      ...(actual ? { actual } : {}),
      ...readStringArrayIssueField(details.options, "options"),
    };
  });
}

function readExpectedIssueField(details: z.ZodIssue & { expected?: unknown; values?: unknown }) {
  if (typeof details.expected === "string") {
    return { expected: details.expected };
  }

  if (Array.isArray(details.values) && details.values.length > 0) {
    return { expected: details.values.slice(0, 20).map(summarizePrimitiveIssueValue).join(" | ") };
  }

  return {};
}

function readStringIssueField(value: unknown, key: "expected" | "received") {
  return typeof value === "string" ? { [key]: value } : {};
}

function readStringArrayIssueField(value: unknown, key: "keys" | "options") {
  return Array.isArray(value)
    ? { [key]: value.slice(0, 20).map(String) }
    : {};
}

function readIssuePathValue(rawValue: unknown, path: readonly (string | number | symbol)[]) {
  let current = rawValue;

  for (const segment of path) {
    if (typeof segment === "symbol") {
      return undefined;
    }

    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
      continue;
    }

    if (typeof current === "object" && String(segment) in current) {
      current = (current as Record<string, unknown>)[String(segment)];
      continue;
    }

    return undefined;
  }

  return current;
}

function isSensitiveIssuePath(path: readonly (string | number | symbol)[]) {
  const sensitivePattern = /password|token|secret|authorization|api[_-]?key|credential/i;

  return path.some((segment) => typeof segment !== "symbol" && sensitivePattern.test(String(segment)));
}

function summarizeIssueActualValue(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return `string ${JSON.stringify(truncateIssueValue(value))}`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? `number ${value}` : "number";
  }

  if (typeof value === "boolean") {
    return `boolean ${value}`;
  }

  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }

  if (typeof value === "object") {
    return "object";
  }

  return typeof value;
}

function summarizePrimitiveIssueValue(value: unknown) {
  if (typeof value === "string") {
    return JSON.stringify(truncateIssueValue(value));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function truncateIssueValue(value: string) {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}
