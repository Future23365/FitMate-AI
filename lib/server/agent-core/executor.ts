import { createHash } from "node:crypto";

import { stableStringify } from "./canonical-json";
import type { AgentResourceRef, AgentRunInput, AnyTool, ToolError, ToolResult, ToolProjectionContext } from "./contracts";
import { createToolError } from "./action-validator";
import { AGENT_ERROR_CODES, isAgentContractError } from "./errors";
import type { ResourceStore } from "./resource-store";

/** ExecuteToolInput 是 Executor 调用单个 tool handler 时所需的确定性上下文。 */
export type ExecuteToolInput = {
  tool: AnyTool;
  input: unknown;
  run: AgentRunInput;
  timeoutMs: number;
  toolCallId: string;
  idempotencyKey?: string;
  parentSignal?: AbortSignal;
  resourceStore?: ResourceStore;
  consumedResources?: AgentResourceRef[];
};

/** executeTool 统一处理 handler 调用、取消、timeout、output schema 校验和 ToolResult 归一化。 */
export async function executeTool(input: ExecuteToolInput): Promise<ToolResult> {
  const startedAt = new Date().toISOString();
  const normalizedInputHash = hashNormalizedInput(input.input);
  const idempotencyKey = input.idempotencyKey ?? createDefaultIdempotencyKey(input.run.runId, input.tool.name, normalizedInputHash);
  const toolResultBase = {
    toolResultId: createToolResultId(input.run.runId, input.tool.name, normalizedInputHash),
    toolName: input.tool.name,
    toolVersion: input.tool.version,
    toolCallId: input.toolCallId,
    idempotencyKey,
    normalizedInputHash,
    startedAt,
  };

  const inputResult = input.tool.inputSchema.safeParse(input.input);
  if (!inputResult.success) {
    return failedToolResult(toolResultBase, createToolError(
      AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
      `Tool "${input.tool.name}" input does not match its schema.`,
    ));
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(input.parentSignal?.reason);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  if (input.parentSignal?.aborted) {
    return failedToolResult(toolResultBase, createToolError(AGENT_ERROR_CODES.ABORTED, "Tool execution was aborted."));
  }

  input.parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const handlerContext = {
      runId: input.run.runId,
      actor: input.run.actor,
      toolCallId: input.toolCallId,
      idempotencyKey,
      signal: controller.signal,
      metadata: input.run.metadata,
      resources: input.resourceStore,
      consumedResources: input.consumedResources,
    };

    const output = await Promise.race([
      Promise.resolve().then(() => input.tool.handler(inputResult.data, handlerContext)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("TOOL_TIMEOUT"));
        }, input.timeoutMs);
      }),
    ]);

    const outputResult = input.tool.outputSchema.safeParse(output);
    if (!outputResult.success) {
      return failedToolResult(toolResultBase, createToolError(
        AGENT_ERROR_CODES.INVALID_TOOL_OUTPUT,
        `Tool "${input.tool.name}" output does not match its schema.`,
      ));
    }

    const projectionContext: ToolProjectionContext = {
      runId: input.run.runId,
      actor: input.run.actor,
      toolCallId: input.toolCallId,
      idempotencyKey,
      metadata: input.run.metadata,
      resources: input.resourceStore,
      consumedResources: input.consumedResources,
    };
    const fulfillment = input.tool.toFulfillment?.(outputResult.data, projectionContext);
    const projection = {
      model: input.tool.toModelObservation?.(outputResult.data, projectionContext),
      user: input.tool.toUserProjection?.(outputResult.data, projectionContext),
    };

    return {
      ...toolResultBase,
      completedAt: new Date().toISOString(),
      ok: true,
      output: outputResult.data,
      projection,
      fulfillment: {
        satisfied: fulfillment?.satisfied ?? true,
        summary: `Tool "${input.tool.name}" completed successfully.`,
        ...fulfillment,
        consumedResources: input.consumedResources,
      },
    };
  } catch (error) {
    if ((error as Error).message === "TOOL_TIMEOUT") {
      return failedToolResult(toolResultBase, createToolError(
        AGENT_ERROR_CODES.TIMEOUT,
        `Tool "${input.tool.name}" exceeded timeout.`,
      ));
    }

    if (controller.signal.aborted || input.parentSignal?.aborted) {
      return failedToolResult(toolResultBase, createToolError(
        AGENT_ERROR_CODES.ABORTED,
        `Tool "${input.tool.name}" was aborted.`,
      ));
    }

    const normalizedError = isAgentContractError(error)
      ? createToolError(error.code, error.message)
      : createToolError(AGENT_ERROR_CODES.HANDLER_ERROR, `Tool "${input.tool.name}" handler failed.`);

    return failedToolResult(toolResultBase, normalizedError, input.consumedResources);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    input.parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

/** hashNormalizedInput 为重复失败熔断提供稳定输入指纹，不包含原始业务语义判断。 */
export function hashNormalizedInput(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex").slice(0, 16);
}

/** createToolResultId 生成可测试的 toolResultId，M0 不依赖外部 id 服务。 */
export function createToolResultId(runId: string, toolName: string, normalizedInputHash: string): string {
  return `tr_${hashNormalizedInput({ runId, toolName, normalizedInputHash })}`;
}

function createDefaultIdempotencyKey(runId: string, toolName: string, normalizedInputHash: string): string {
  return `idem_${hashNormalizedInput({ runId, toolName, normalizedInputHash })}`;
}

function failedToolResult(
  base: Omit<ToolResult, "completedAt" | "ok" | "error" | "fulfillment">,
  error: ToolError,
  consumedResources?: AgentResourceRef[],
): ToolResult {
  return {
    ...base,
    completedAt: new Date().toISOString(),
    ok: false,
    error,
    fulfillment: {
      satisfied: false,
      summary: `Tool "${base.toolName}" failed with ${error.code}.`,
      consumedResources,
    },
  };
}

export { stableStringify };
