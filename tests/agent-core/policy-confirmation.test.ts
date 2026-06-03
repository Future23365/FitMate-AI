import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  claimPendingActionForExecution,
  createPendingAction,
  InMemoryConfirmationStore,
  markPendingActionConsumed,
} from "@/lib/server/agent-core/confirmation-store";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { evaluateToolPolicy } from "@/lib/server/agent-core/policy-guard";
import type { AnyTool, PolicyDecision, ToolCallAction } from "@/lib/server/agent-core/contracts";

const run = {
  runId: "run-confirmation",
  actor: {
    userId: "user-1",
    permissions: ["fixture:write"],
  },
  userInput: "write",
};

const action: ToolCallAction = {
  type: "tool_call",
  toolName: "writeFixture",
  input: { id: "a" },
};

function createTool(policy: AnyTool["policy"]) {
  return defineTool({
    name: "writeFixture",
    version: "0.1.0",
    description: "用于 policy 测试的 fixture tool。",
    whenToUse: "仅在 policy 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy,
    handler: (input: { id: string }) => input,
  });
}

function requiresConfirmationDecision(expiresAt = "2099-01-01T00:00:00.000Z"): Extract<PolicyDecision, { kind: "requires_confirmation" }> {
  return {
    kind: "requires_confirmation",
    policyVersion: "policy@v1",
    message: "确认执行。",
    expiresAt,
  };
}

describe("agent-core Policy Guard", () => {
  it("allows low-risk read tools when permissions are satisfied", () => {
    const tool = createTool({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    });

    expect(evaluateToolPolicy({
      actor: { userId: "user-1" },
      tool,
      action,
    })).toMatchObject({ kind: "allow" });
  });

  it("denies execution when actor permissions are missing", () => {
    const tool = createTool({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
      permissions: ["fixture:write"],
    });

    expect(evaluateToolPolicy({
      actor: { userId: "user-1", permissions: [] },
      tool,
      action,
    })).toMatchObject({ kind: "deny", error: { code: AGENT_ERROR_CODES.POLICY_DENIED } });
  });

  it("requires confirmation for write, high-risk or confirmation-required tools", () => {
    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: createTool({
        sideEffect: "write",
        riskLevel: "low",
        confirmation: "never",
        permissions: ["fixture:write"],
      }),
      action,
    })).toMatchObject({ kind: "requires_confirmation" });

    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: createTool({
        sideEffect: "read",
        riskLevel: "high",
        confirmation: "never",
        permissions: ["fixture:write"],
      }),
      action,
    })).toMatchObject({ kind: "requires_confirmation" });

    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: createTool({
        sideEffect: "read",
        riskLevel: "low",
        confirmation: "always",
        permissions: ["fixture:write"],
      }),
      action,
    })).toMatchObject({ kind: "requires_confirmation" });
  });

  it("uses structured dynamic confirmation evaluator instead of fixed risk shortcut", () => {
    const dynamicTool = createTool({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "dynamic",
    });

    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: dynamicTool,
      action,
    })).toMatchObject({ kind: "requires_confirmation" });

    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: dynamicTool,
      action: {
        ...action,
        input: { requiresApproval: false },
      },
      dynamicConfirmationEvaluator: ({ action: evaluatedAction }) => {
        return Boolean((evaluatedAction.input as { requiresApproval?: boolean }).requiresApproval);
      },
    })).toMatchObject({ kind: "allow" });

    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: dynamicTool,
      action: {
        ...action,
        input: { requiresApproval: true },
      },
      dynamicConfirmationEvaluator: ({ action: evaluatedAction }) => ({
        requiresConfirmation: Boolean((evaluatedAction.input as { requiresApproval?: boolean }).requiresApproval),
        message: "结构化输入要求确认。",
      }),
    })).toMatchObject({ kind: "requires_confirmation", message: "结构化输入要求确认。" });

    expect(evaluateToolPolicy({
      actor: run.actor,
      tool: createTool({
        sideEffect: "read",
        riskLevel: "low",
        confirmation: "never",
      }),
      action,
      dynamicConfirmationEvaluator: () => true,
    })).toMatchObject({ kind: "requires_confirmation" });
  });
});

describe("agent-core ConfirmationStore and action hash", () => {
  it("creates pending actions, keeps claim pending, then consumes them after successful execution", () => {
    const tool = createTool({
      sideEffect: "write",
      riskLevel: "high",
      confirmation: "always",
      permissions: ["fixture:write"],
      policyVersion: "policy@v1",
    });
    const store = new InMemoryConfirmationStore();
    const pendingAction = createPendingAction({
      run,
      tool,
      action,
      decision: requiresConfirmationDecision(),
      secret: "secret",
    });
    store.save(pendingAction);

    expect(claimPendingActionForExecution({
      store,
      resume: {
        pendingActionId: pendingAction.pendingActionId,
        actionHash: pendingAction.actionHash,
        run,
      },
      secret: "secret",
    })).toMatchObject({ ok: true, pendingAction: { status: "pending" } });
    expect(store.get(pendingAction.pendingActionId)).toMatchObject({ status: "pending" });

    expect(markPendingActionConsumed(store, pendingAction.pendingActionId)).toMatchObject({ status: "consumed" });

    expect(claimPendingActionForExecution({
      store,
      resume: {
        pendingActionId: pendingAction.pendingActionId,
        actionHash: pendingAction.actionHash,
        run,
      },
      secret: "secret",
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.CONFIRMATION_CONSUMED } });
  });

  it("rejects expired pending actions and hash binding changes", () => {
    const tool = createTool({
      sideEffect: "write",
      riskLevel: "high",
      confirmation: "always",
      permissions: ["fixture:write"],
      policyVersion: "policy@v1",
    });
    const expiredStore = new InMemoryConfirmationStore();
    const expired = createPendingAction({
      run,
      tool,
      action,
      decision: requiresConfirmationDecision("2000-01-01T00:00:00.000Z"),
      secret: "secret",
    });
    expiredStore.save(expired);

    expect(claimPendingActionForExecution({
      store: expiredStore,
      resume: {
        pendingActionId: expired.pendingActionId,
        actionHash: expired.actionHash,
        run,
      },
      secret: "secret",
      now: new Date("2026-06-03T00:00:00.000Z"),
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.CONFIRMATION_EXPIRED } });

    const tamperedStore = new InMemoryConfirmationStore();
    const pending = createPendingAction({
      run,
      tool,
      action,
      decision: requiresConfirmationDecision(),
      secret: "secret",
    });
    tamperedStore.save({
      ...pending,
      toolVersion: "0.2.0",
    });

    expect(claimPendingActionForExecution({
      store: tamperedStore,
      resume: {
        pendingActionId: pending.pendingActionId,
        actionHash: pending.actionHash,
        run,
      },
      secret: "secret",
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.CONFIRMATION_HASH_INVALID } });
  });
});
