import { createHash } from "node:crypto";

import { stableStringify } from "./canonical-json";
import type { AgentResourceRef, AgentRunInput, ToolCallAction } from "./contracts";

/** CreateToolIdempotencyKeyInput 绑定一次 tool execution 的稳定结构化字段。 */
export type CreateToolIdempotencyKeyInput = {
  run: AgentRunInput;
  toolName: string;
  toolVersion: string;
  input: unknown;
  action?: ToolCallAction;
  resourceRefs?: AgentResourceRef[];
  pendingActionId?: string;
  actionHash?: string;
};

/** createToolExecutionIdempotencyKey 为普通执行和 confirmation resume 生成可复用幂等键。 */
export function createToolExecutionIdempotencyKey(input: CreateToolIdempotencyKeyInput): string {
  const payload = {
    runId: input.run.runId,
    actor: input.run.actor,
    toolName: input.toolName,
    toolVersion: input.toolVersion,
    input,
    actionType: input.action?.type,
    resourceRefs: input.resourceRefs ?? input.action?.consumes ?? [],
    pendingActionId: input.pendingActionId,
    actionHash: input.actionHash,
  };

  return `idem_${createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 24)}`;
}
