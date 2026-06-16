import "server-only";

import { tool } from "langchain";
import { z } from "zod";

import { agentRuntimeConfig, createLangChainJsonProjectionBudget } from "@/lib/server/config";

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
  LangChainToolRuntimeActivityMetadata,
  LangChainRuntimeActivitySummaryDiscardReason,
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
  version?: string;
  description: string;
  inputSchema: SchemaT;
  outputSchema?: z.ZodType<OutputT>;
  /** executionKind 标记真实业务工具；runtimeMetadata 只作为该业务调用的 request-local metadata。 */
  executionKind?: "business";
  /** runtimeActivity 定义业务 tool handler 前可投影的安全 UI metadata，不参与业务事实。 */
  runtimeActivity?: {
    defaultSummary?: string;
  };
  timeoutMs?: number;
  handler: LangChainToolWrapperHandler<SchemaT, OutputT>;
  toModelVisibleSummary: LangChainToolOutputMapper<OutputT, string | LangChainJsonValue>;
  toUserProjection?: LangChainToolOutputMapper<OutputT, LangChainJsonValue>;
  toTraceSummary?: LangChainToolOutputMapper<OutputT, LangChainJsonValue>;
};

export type LangChainToolWrapper<SchemaT extends z.ZodObject = z.ZodObject, OutputT = unknown> =
  LangChainToolWrapperDefinition<SchemaT, OutputT>;

export type LangChainToolExecutionResult = { modelMessage: string; record: LangChainAgentToolExecution };
export type LangChainToolExecutionRecorder = (execution: LangChainAgentToolExecution) => void | Promise<void>;
export type LangChainToolRuntimeActivityRecorder = (
  activity: LangChainToolRuntimeActivityMetadata & { toolName: string; toolCallId?: string },
) => void | Promise<void>;
export type LangChainToolExecutionBudget = {
  reserveToolCall: (wrapper: LangChainToolWrapper) => boolean;
};
export type LangChainToolExecutionCoordinator = {
  /** execute 让 runtime 在 wrapper handler 前后注入通用预算、duplicate input 等边界。 */
  execute: <SchemaT extends z.ZodObject, OutputT>(input: {
    wrapper: LangChainToolWrapper<SchemaT, OutputT>;
    rawInput: unknown;
    toolCallId?: string;
    runExecution: () => Promise<LangChainToolExecutionResult>;
  }) => Promise<LangChainToolExecutionResult>;
};

/** toolCallRuntimeMetadataSchema 是所有生产业务 LangChain tool provider-visible input 共享的 UI metadata envelope。 */
export const toolCallRuntimeMetadataSchema = z.object({
  activitySummary: z.string()
    .optional()
    .describe("当前业务 tool call 的用户可见 UI 状态短句；只描述正在做什么，不是调用理由、业务事实、tool output 或最终回答依据。建议中文 8-40 个字，不写 toolName、trace、schema、数据库 id、错误码或完成态承诺。"),
}).strict().describe("可选 request-local runtime metadata，只服务当前请求的 UI 进度和 trace 诊断；不属于业务 tool input，也不能作为业务事实或最终回答依据。");

/** defineLangChainToolWrapper 定义生产 LangChain tool 的服务端 wrapper 合同，统一 schema、权限上下文、摘要和 trace 边界。 */
export function defineLangChainToolWrapper<SchemaT extends z.ZodObject, OutputT>(
  definition: LangChainToolWrapperDefinition<SchemaT, OutputT>,
): LangChainToolWrapper<SchemaT, OutputT> {
  return definition;
}

/** getLangChainToolProviderInputSchema 给业务 tool 统一注入 runtimeMetadata，同时保持源 inputSchema 只描述业务字段。 */
export function getLangChainToolProviderInputSchema<SchemaT extends z.ZodObject>(
  wrapper: LangChainToolWrapper<SchemaT, unknown>,
) {
  return wrapper.inputSchema.extend({
    runtimeMetadata: toolCallRuntimeMetadataSchema.optional(),
  });
}

/** createExecutableLangChainTool 将项目 wrapper 转为 LangChain tool，并记录安全执行摘要。 */
export function createExecutableLangChainTool<SchemaT extends z.ZodObject, OutputT>(
  wrapper: LangChainToolWrapper<SchemaT, OutputT>,
  context: LangChainToolWrapperContext,
  recordExecution: LangChainToolExecutionRecorder,
  budget?: LangChainToolExecutionBudget,
  coordinator?: LangChainToolExecutionCoordinator,
  recordRuntimeActivity?: LangChainToolRuntimeActivityRecorder,
) {
  const executableTool = tool(async (input, runtime) => {
    const toolCallId = readLangChainToolCallId(runtime);
    const execution = await executeLangChainToolWithRuntimeBoundaries({
      wrapper,
      rawInput: input,
      context,
      toolCallId,
      budget,
      coordinator,
      onRuntimeActivity: recordRuntimeActivity,
    });

    await recordExecution(execution.record);

    return execution.modelMessage;
  }, {
    name: wrapper.name,
    description: wrapper.description,
    schema: getLangChainToolProviderInputSchema(wrapper),
  });

  return Object.assign(executableTool, {
    // ToolNode 默认会在 invoke -> call 中做本地 schema 校验，并把解析异常 stack trace 放进 ToolMessage。
    // 覆盖 invoke 可以保留 provider schema，同时把执行、校验和错误消毒统一交给项目 wrapper。
    invoke: async (input: unknown, runtime: unknown) => {
      const toolInput = readLangChainToolInvokeInput(input, runtime);
      const execution = await executeLangChainToolWithRuntimeBoundaries({
        wrapper,
        rawInput: toolInput.rawInput,
        context,
        toolCallId: toolInput.toolCallId,
        budget,
        coordinator,
        onRuntimeActivity: recordRuntimeActivity,
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

async function executeLangChainToolWithRuntimeBoundaries<SchemaT extends z.ZodObject, OutputT>(input: {
  wrapper: LangChainToolWrapper<SchemaT, OutputT>;
  rawInput: unknown;
  context: LangChainToolWrapperContext;
  toolCallId?: string;
  budget?: LangChainToolExecutionBudget;
  coordinator?: LangChainToolExecutionCoordinator;
  onRuntimeActivity?: LangChainToolRuntimeActivityRecorder;
}): Promise<LangChainToolExecutionResult> {
  const runExecution = async () => {
    const budgetExceeded = input.budget ? !input.budget.reserveToolCall(input.wrapper) : false;

    return executeLangChainToolWrapper(input.wrapper, input.rawInput, input.context, {
      toolCallId: input.toolCallId,
      budgetExceeded,
      onRuntimeActivity: input.onRuntimeActivity,
    });
  };

  return input.coordinator
    ? input.coordinator.execute({
        wrapper: input.wrapper,
        rawInput: input.rawInput,
        toolCallId: input.toolCallId,
        runExecution,
      })
    : runExecution();
}

/** executeLangChainToolWrapper 直接执行 wrapper，供 LangChain tool 和 tool-level tests 共用同一个确定性边界。 */
export async function executeLangChainToolWrapper<SchemaT extends z.ZodObject, OutputT>(
  wrapper: LangChainToolWrapper<SchemaT, OutputT>,
  rawInput: unknown,
  context: LangChainToolWrapperContext,
  options: {
    toolCallId?: string;
    budgetExceeded?: boolean;
    onRuntimeActivity?: LangChainToolRuntimeActivityRecorder;
  } = {},
): Promise<LangChainToolExecutionResult> {
  const startedAt = Date.now();
  const config = agentRuntimeConfig.langChain;
  const runtimeMetadata = extractRuntimeMetadataEnvelope(wrapper, rawInput);
  const parsedInput = wrapper.inputSchema.safeParse(runtimeMetadata.businessInput);
  const inputSummary = toLangChainJsonValue(
    runtimeMetadata.businessInput,
    createLangChainJsonProjectionBudget(config.trace.toolArgumentsPreviewMaxLength),
  );

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
    const schemaIssues = summarizeZodIssues(parsedInput.error, runtimeMetadata.businessInput);

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
    await emitToolRuntimeActivityBeforeHandler({
      wrapper,
      toolCallId: options.toolCallId,
      runtimeActivity: runtimeMetadata.runtimeActivity,
      onRuntimeActivity: options.onRuntimeActivity,
    });

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
        runtimeActivity: runtimeMetadata.runtimeActivity,
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
      createLangChainJsonProjectionBudget(config.toolWrapper.modelVisibleSummaryMaxLength),
    );
    const rawUserProjection = wrapper.toUserProjection?.(output);
    const userProjection = rawUserProjection === undefined
      ? undefined
      : toLangChainJsonValue(
        rawUserProjection,
        createLangChainJsonProjectionBudget(config.toolWrapper.userProjectionMaxLength),
      );
    const traceSummary = toLangChainJsonValue(
      wrapper.toTraceSummary?.(output) ?? output,
      createLangChainJsonProjectionBudget(config.toolWrapper.traceSummaryMaxLength),
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
        ...(runtimeMetadata.runtimeActivity ? { runtimeActivity: runtimeMetadata.runtimeActivity } : {}),
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
      runtimeActivity: runtimeMetadata.runtimeActivity,
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

function extractRuntimeMetadataEnvelope(
  wrapper: LangChainToolWrapper,
  rawInput: unknown,
): {
  businessInput: unknown;
  runtimeActivity?: LangChainToolRuntimeActivityMetadata;
} {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return {
      businessInput: rawInput,
      runtimeActivity: createFallbackRuntimeActivity(wrapper, undefined),
    };
  }

  const { runtimeMetadata, ...businessInput } = rawInput as Record<string, unknown>;

  return {
    businessInput,
    runtimeActivity: createRuntimeActivityMetadata(wrapper, runtimeMetadata),
  };
}

function createRuntimeActivityMetadata(
  wrapper: LangChainToolWrapper,
  runtimeMetadata: unknown,
): LangChainToolRuntimeActivityMetadata {
  const metadataRecord = runtimeMetadata && typeof runtimeMetadata === "object" && !Array.isArray(runtimeMetadata)
    ? runtimeMetadata as Record<string, unknown>
    : {};
  const normalizedSummary = normalizeRuntimeActivitySummary(metadataRecord.activitySummary);

  if (normalizedSummary.ok) {
    return {
      activitySummary: normalizedSummary.summary,
      source: "model",
      rawSummaryLength: normalizedSummary.rawSummaryLength,
    };
  }

  return createFallbackRuntimeActivity(wrapper, normalizedSummary.reason, normalizedSummary.rawSummaryLength);
}

function createFallbackRuntimeActivity(
  wrapper: LangChainToolWrapper,
  discardedSummaryReason: LangChainRuntimeActivitySummaryDiscardReason | undefined,
  rawSummaryLength?: number,
): LangChainToolRuntimeActivityMetadata {
  const toolDefaultSummary = normalizeStaticRuntimeActivitySummary(wrapper.runtimeActivity?.defaultSummary);
  const fallbackSummary = normalizeStaticRuntimeActivitySummary(agentRuntimeConfig.langChain.runtimeActivity.defaultSummary)
    ?? "正在处理当前请求";

  return {
    activitySummary: toolDefaultSummary ?? fallbackSummary,
    source: toolDefaultSummary ? "tool_default" : "fallback",
    ...(discardedSummaryReason ? { discardedSummaryReason } : {}),
    ...(rawSummaryLength === undefined ? {} : { rawSummaryLength }),
  };
}

function normalizeRuntimeActivitySummary(value: unknown): (
  | { ok: true; summary: string; rawSummaryLength: number }
  | { ok: false; reason: LangChainRuntimeActivitySummaryDiscardReason; rawSummaryLength?: number }
) {
  if (typeof value !== "string") {
    return { ok: false, reason: "not_string" };
  }

  const rawSummaryLength = value.length;
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty", rawSummaryLength };
  }

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, reason: "control_character", rawSummaryLength };
  }

  const normalized = trimmed.replace(/\s+/g, " ");

  if (normalized.length > agentRuntimeConfig.langChain.runtimeActivity.maxSummaryLength) {
    return { ok: false, reason: "too_long", rawSummaryLength };
  }

  if (containsRuntimeInternalDetail(normalized)) {
    return { ok: false, reason: "internal_detail", rawSummaryLength };
  }

  if (containsPrematureCompletionClaim(normalized)) {
    return { ok: false, reason: "completion_claim", rawSummaryLength };
  }

  return {
    ok: true,
    summary: normalized,
    rawSummaryLength,
  };
}

function normalizeStaticRuntimeActivitySummary(value: string | undefined) {
  const normalized = normalizeRuntimeActivitySummary(value);

  return normalized.ok ? normalized.summary : undefined;
}

function containsRuntimeInternalDetail(summary: string) {
  return [
    /\btoolName\b/i,
    /\btool_call\b/i,
    /\btool result\b/i,
    /\bruntime\b/i,
    /\bprovider\b/i,
    /\btrace\b/i,
    /\bschema\b/i,
    /\bpayload\b/i,
    /\bNDJSON\b/i,
    /\bJSON\b/,
    /\bstack\b/i,
    /[`{}[\]]/,
    /字段路径/,
    /错误码/,
    /数据库\s*id/i,
    /trace\s*id/i,
    /内部/,
    /调试/,
    /执行合同/,
  ].some((pattern) => pattern.test(summary));
}

function containsPrematureCompletionClaim(summary: string) {
  return /(已|已经).{0,8}(完成|生成|保存|写入|提交|通过校验|校验通过)/.test(summary);
}

async function emitToolRuntimeActivityBeforeHandler(input: {
  wrapper: LangChainToolWrapper;
  toolCallId?: string;
  runtimeActivity?: LangChainToolRuntimeActivityMetadata;
  onRuntimeActivity?: LangChainToolRuntimeActivityRecorder;
}) {
  if (!input.runtimeActivity || !input.onRuntimeActivity) {
    return;
  }

  try {
    await input.onRuntimeActivity({
      ...input.runtimeActivity,
      toolName: input.wrapper.name,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    });
  } catch {
    // runtime activity 只服务 request-local UI / trace，投影失败不能改变业务 tool 执行。
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
  runtimeActivity?: LangChainToolRuntimeActivityMetadata;
  failureCode: LangChainAgentRuntimeErrorCode;
  failureMessage: string;
  schemaIssues?: readonly LangChainAgentSchemaIssue[];
  modelMessage: LangChainJsonValue;
}): { modelMessage: string; record: LangChainAgentToolExecution } {
  return {
    modelMessage: stringifyForModelSummary(
      input.modelMessage,
      agentRuntimeConfig.langChain.toolWrapper.modelVisibleSummaryMaxLength,
      createLangChainJsonProjectionBudget(agentRuntimeConfig.langChain.toolWrapper.modelVisibleSummaryMaxLength),
    ),
    record: {
      toolCallId: input.toolCallId,
      toolName: input.wrapper.name,
      executionKind: input.wrapper.executionKind ?? "business",
      status: "failed",
      durationMs: Date.now() - input.startedAt,
      inputSummary: input.inputSummary,
      ...(input.runtimeActivity ? { runtimeActivity: input.runtimeActivity } : {}),
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      ...(input.schemaIssues?.length ? { schemaIssues: input.schemaIssues } : {}),
      enteredModelContext: true,
    },
  };
}

// summarizeZodIssues 只记录可定位 schema 问题的稳定字段，避免把完整 tool payload 写进 trace。
function summarizeZodIssues(error: z.ZodError, rawValue: unknown): readonly LangChainAgentSchemaIssue[] {
  const issueLimit = agentRuntimeConfig.langChain.toolWrapper.jsonProjectionMaxArrayItems;

  return error.issues.slice(0, issueLimit).map((issue) => {
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
    return {
      expected: details.values
        .slice(0, agentRuntimeConfig.langChain.toolWrapper.jsonProjectionMaxArrayItems)
        .map(summarizePrimitiveIssueValue)
        .join(" | "),
    };
  }

  return {};
}

function readStringIssueField(value: unknown, key: "expected" | "received") {
  return typeof value === "string" ? { [key]: value } : {};
}

function readStringArrayIssueField(value: unknown, key: "keys" | "options") {
  return Array.isArray(value)
    ? { [key]: value.slice(0, agentRuntimeConfig.langChain.toolWrapper.jsonProjectionMaxArrayItems).map(String) }
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
