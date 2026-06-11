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
  timeoutMs?: number;
  handler: LangChainToolWrapperHandler<SchemaT, OutputT>;
  toModelVisibleSummary: LangChainToolOutputMapper<OutputT, string | LangChainJsonValue>;
  toUserProjection?: LangChainToolOutputMapper<OutputT, LangChainJsonValue>;
  toTraceSummary?: LangChainToolOutputMapper<OutputT, LangChainJsonValue>;
};

export type LangChainToolWrapper<SchemaT extends z.ZodObject = z.ZodObject, OutputT = unknown> =
  LangChainToolWrapperDefinition<SchemaT, OutputT>;

export type LangChainToolExecutionRecorder = (execution: LangChainAgentToolExecution) => void;
export type LangChainToolExecutionBudget = {
  reserveToolCall: () => boolean;
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
    const budgetExceeded = budget ? !budget.reserveToolCall() : false;
    const execution = await executeLangChainToolWrapper(wrapper, input, context, {
      toolCallId: readLangChainToolCallId(runtime),
      budgetExceeded,
    });

    recordExecution(execution.record);

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
      const budgetExceeded = budget ? !budget.reserveToolCall() : false;
      const execution = await executeLangChainToolWrapper(wrapper, toolInput.rawInput, context, {
        toolCallId: toolInput.toolCallId,
        budgetExceeded,
      });

      recordExecution(execution.record);
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
    return createFailedToolExecution({
      wrapper,
      toolCallId: options.toolCallId,
      startedAt,
      inputSummary,
      failureCode: "tool_schema_invalid",
      failureMessage: "工具参数未通过服务端 schema 校验。",
      modelMessage: {
        status: "failed",
        code: "tool_schema_invalid",
        message: "工具参数未通过服务端 schema 校验；请只修正当前工具参数，不要假装工具已成功。",
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
      return createFailedToolExecution({
        wrapper,
        toolCallId: options.toolCallId,
        startedAt,
        inputSummary,
        failureCode: "structured_output_validation_failed",
        failureMessage: "工具输出未通过服务端 schema 校验。",
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
      status: "failed",
      durationMs: Date.now() - input.startedAt,
      inputSummary: input.inputSummary,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      enteredModelContext: true,
    },
  };
}
