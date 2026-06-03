import { createHmac } from "node:crypto";

import type {
  AgentRunInput,
  AnyTool,
  ConfirmationRequest,
  ConfirmationResumeInput,
  PendingAction,
  PolicyDecision,
  ToolCallAction,
  ToolError,
} from "./contracts";
import { hashNormalizedInput, stableStringify } from "./executor";
import { AGENT_ERROR_CODES } from "./errors";

/** ConfirmationStore 保存等待用户确认的服务端 pending action，M1 只提供 core 级接口。 */
export interface ConfirmationStore {
  save(action: PendingAction): void;
  get(pendingActionId: string): PendingAction | undefined;
  update(action: PendingAction): void;
  list(): PendingAction[];
}

/** InMemoryConfirmationStore 是 M1 测试实现，不代表生产持久化能力。 */
export class InMemoryConfirmationStore implements ConfirmationStore {
  private readonly actions = new Map<string, PendingAction>();

  save(action: PendingAction): void {
    this.actions.set(action.pendingActionId, action);
  }

  get(pendingActionId: string): PendingAction | undefined {
    return this.actions.get(pendingActionId);
  }

  update(action: PendingAction): void {
    this.actions.set(action.pendingActionId, action);
  }

  list(): PendingAction[] {
    return [...this.actions.values()];
  }
}

/** CreatePendingActionInput 汇总服务端生成 confirmation hash 时必须绑定的结构化字段。 */
export type CreatePendingActionInput = {
  run: AgentRunInput;
  tool: AnyTool;
  action: ToolCallAction;
  decision: Extract<PolicyDecision, { kind: "requires_confirmation" }>;
  secret: string;
  now?: Date;
};

/** createPendingAction 生成服务端 pending action 和 actionHash，不接受 Planner 或客户端提供的 hash。 */
export function createPendingAction(input: CreatePendingActionInput): PendingAction {
  const createdAt = (input.now ?? new Date()).toISOString();
  const inputHash = hashNormalizedInput(input.action.input);
  const pendingActionId = `pa_${hashNormalizedInput({
    runId: input.run.runId,
    toolName: input.tool.name,
    toolVersion: input.tool.version,
    inputHash,
    createdAt,
  })}`;
  const pendingActionWithoutHash: Omit<PendingAction, "actionHash"> = {
    pendingActionId,
    runId: input.run.runId,
    actor: input.run.actor,
    toolName: input.tool.name,
    toolVersion: input.tool.version,
    toolCall: input.action,
    inputHash,
    resourceRefs: input.action.consumes ?? [],
    policyVersion: input.decision.policyVersion,
    status: "pending",
    createdAt,
    expiresAt: input.decision.expiresAt,
    message: input.decision.message,
  };

  return {
    ...pendingActionWithoutHash,
    actionHash: createActionHash(pendingActionWithoutHash, input.secret),
  };
}

/** createConfirmationRequest 将 pending action 压缩为 renderer 可输出的白名单确认事件。 */
export function createConfirmationRequest(action: PendingAction): ConfirmationRequest {
  return {
    pendingActionId: action.pendingActionId,
    actionHash: action.actionHash,
    expiresAt: action.expiresAt,
    message: action.message,
    toolName: action.toolName,
  };
}

/** ClaimPendingActionResult 表示 confirmation resume 是否成功占用待执行 action。 */
export type ClaimPendingActionResult =
  | { ok: true; pendingAction: PendingAction }
  | { ok: false; error: ToolError };

/** claimPendingActionForExecution 校验 hash、actor、run、过期和状态后占用服务端保存的 tool_call。 */
export function claimPendingActionForExecution(input: {
  store: ConfirmationStore;
  resume: ConfirmationResumeInput;
  secret: string;
  now?: Date;
}): ClaimPendingActionResult {
  const pending = input.store.get(input.resume.pendingActionId);
  if (!pending) {
    return {
      ok: false,
      error: createConfirmationError(
        AGENT_ERROR_CODES.CONFIRMATION_HASH_INVALID,
        "Pending action does not exist or cannot be verified.",
      ),
    };
  }

  if (pending.status === "consumed") {
    return {
      ok: false,
      error: createConfirmationError(
        AGENT_ERROR_CODES.CONFIRMATION_CONSUMED,
        "Pending action has already been consumed.",
      ),
    };
  }

  const now = input.now ?? new Date();
  if (pending.status === "expired" || new Date(pending.expiresAt).getTime() <= now.getTime()) {
    const expired = { ...pending, status: "expired" as const };
    input.store.update(expired);
    return {
      ok: false,
      error: createConfirmationError(
        AGENT_ERROR_CODES.CONFIRMATION_EXPIRED,
        "Pending action has expired.",
      ),
    };
  }

  const recomputedHash = createActionHash(stripActionHash(pending), input.secret);
  if (input.resume.actionHash !== pending.actionHash || recomputedHash !== pending.actionHash) {
    return {
      ok: false,
      error: createConfirmationError(
        AGENT_ERROR_CODES.CONFIRMATION_HASH_INVALID,
        "Pending action hash does not match the saved canonical action.",
      ),
    };
  }

  if (input.resume.run.runId !== pending.runId || stableStringify(input.resume.run.actor) !== stableStringify(pending.actor)) {
    return {
      ok: false,
      error: createConfirmationError(
        AGENT_ERROR_CODES.CONFIRMATION_HASH_INVALID,
        "Pending action actor or run binding does not match the resume context.",
      ),
    };
  }

  const consumed = { ...pending, status: "consumed" as const };
  input.store.update(consumed);
  return { ok: true, pendingAction: consumed };
}

/** createActionHash 使用服务端 secret 绑定 canonical pending action，防止 TOCTOU 输入替换。 */
export function createActionHash(action: Omit<PendingAction, "actionHash">, secret: string): string {
  return createHmac("sha256", secret)
    .update(stableStringify(toCanonicalHashPayload(action)))
    .digest("hex");
}

function stripActionHash(action: PendingAction): Omit<PendingAction, "actionHash"> {
  const { actionHash: _actionHash, ...withoutHash } = action;
  return withoutHash;
}

function toCanonicalHashPayload(action: Omit<PendingAction, "actionHash">) {
  return {
    pendingActionId: action.pendingActionId,
    runId: action.runId,
    actor: action.actor,
    toolName: action.toolName,
    toolVersion: action.toolVersion,
    toolCall: action.toolCall,
    inputHash: action.inputHash,
    resourceRefs: action.resourceRefs,
    policyVersion: action.policyVersion,
    expiresAt: action.expiresAt,
  };
}

function createConfirmationError(code: ToolError["code"], message: string): ToolError {
  return {
    code,
    message,
    retryable: false,
  };
}
