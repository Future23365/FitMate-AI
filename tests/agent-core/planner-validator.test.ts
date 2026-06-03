import { z } from "zod";
import { describe, expect, it } from "vitest";

import { validateAgentAction } from "@/lib/server/agent-core/action-validator";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";

function createRegistry() {
  const registry = new ToolRegistry();
  registry.register(defineTool({
    name: "readOne",
    version: "0.1.0",
    description: "Read one value.",
    whenToUse: "Use in validator tests.",
    whenNotToUse: "Do not use outside validator tests.",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (input: { id: string }) => input,
  }));
  registry.register(defineTool({
    name: "writeOne",
    version: "0.1.0",
    description: "Write one value.",
    whenToUse: "Use to prove M0 rejects write tools.",
    whenNotToUse: "Do not execute in M0.",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "write",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (input: { id: string }) => input,
  }));
  return registry;
}

describe("agent-core PlannerPort, ReplayPlanner and Action Validator", () => {
  it("replays fixed actions and records planner inputs", async () => {
    const planner = new ReplayPlanner([
      { type: "final_answer", content: "done" },
    ]);
    const action = await planner.decideNext({
      run: {
        runId: "run-replay",
        actor: {},
        userInput: "hello",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    });

    expect(action).toEqual({ type: "final_answer", content: "done" });
    expect(planner.calls).toHaveLength(1);
    await expect(planner.decideNext({
      run: {
        runId: "run-replay",
        actor: {},
        userInput: "hello",
      },
      step: 2,
      manifests: [],
      observations: [],
      toolResults: [],
    })).rejects.toThrow(AgentContractError);
  });

  it("accepts valid tool calls and terminal references", () => {
    const registry = createRegistry();
    const result = validateAgentAction({
      action: { type: "tool_call", toolName: "readOne", input: { id: "a" } },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unknown action, confirmation action, unknown tool and invalid input", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();

    expect(validateAgentAction({
      action: { type: "request_confirmation", pendingActionId: "x" },
      registry,
      manifests,
      toolResults: [],
    }).ok).toBe(false);

    expect(validateAgentAction({
      action: { type: "tool_call", toolName: "missing", input: { id: "a" } },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.UNKNOWN_TOOL } });

    expect(validateAgentAction({
      action: { type: "tool_call", toolName: "readOne", input: { id: 1 } },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
  });

  it("rejects non-M0 capabilities and non-empty resource references", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();

    expect(validateAgentAction({
      action: { type: "tool_call", toolName: "writeOne", input: { id: "a" } },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.UNSUPPORTED_M0_CAPABILITY } });

    expect(validateAgentAction({
      action: {
        type: "tool_call",
        toolName: "readOne",
        input: { id: "a" },
        consumes: [{ resourceId: "resource-1" }],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_RESOURCE_REFERENCE } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedResourceRefs: [{ resourceId: "resource-1" }],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_RESOURCE_REFERENCE } });
  });

  it("rejects terminal actions that cite tool result ids outside the current run", () => {
    const registry = createRegistry();

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedToolResultIds: ["missing-tool-result"],
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });
  });
});

