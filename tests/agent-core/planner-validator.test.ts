import { z } from "zod";
import { describe, expect, it } from "vitest";

import { validateAgentAction } from "@/lib/server/agent-core/action-validator";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import { ResourceStore, toResourceRef } from "@/lib/server/agent-core/resource-store";
import { TerminalOutputValidatorRegistry } from "@/lib/server/agent-core/terminal-output-validator";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createProductionToolRegistry } from "@/lib/server/agent-tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { toTerminalResourceRefs, toTerminalToolResultRefs, type ToolResult } from "@/lib/server/agent-core/contracts";

function createRegistry() {
  const registry = new ToolRegistry();
  registry.register(defineTool({
    name: "readOne",
    version: "0.1.0",
    description: "读取一个 validator 测试值。",
    whenToUse: "仅在 validator 测试需要只读 tool 时使用。",
    whenNotToUse: "不要在 validator 测试之外使用。",
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
    description: "写入一个 validator 测试值。",
    whenToUse: "仅用于证明 M0 会拒绝 write tool。",
    whenNotToUse: "不要在 M0 中执行。",
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

function createM1ResourceRegistry() {
  const registry = new ToolRegistry({ capabilityMode: "m1" });
  registry.register(defineTool({
    name: "consumeResource",
    version: "0.1.0",
    description: "消费一个 fixture resource。",
    whenToUse: "仅在 M1 validator 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ ok: z.boolean() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    resourceContract: {
      requires: [
        { resourceType: "fixture_document", role: "consumable" },
      ],
    },
    handler: () => ({ ok: true }),
  }));
  return registry;
}

function createTerminalGroundingToolResult(input: { toolResultId: string; ok: boolean; satisfied: boolean }): ToolResult {
  const base = {
    toolResultId: input.toolResultId,
    toolName: "readOne",
    toolVersion: "0.1.0",
    toolCallId: `tc_${input.toolResultId}`,
    idempotencyKey: `idem_${input.toolResultId}`,
    normalizedInputHash: `hash_${input.toolResultId}`,
    startedAt: "2026-06-03T00:00:00.000Z",
    completedAt: "2026-06-03T00:00:00.000Z",
    fulfillment: {
      summary: "validator fixture result",
      satisfied: input.satisfied,
    },
  };

  if (!input.ok) {
    return {
      ...base,
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.HANDLER_ERROR,
        message: "fixture failed",
        retryable: false,
      },
    };
  }

  return {
    ...base,
    ok: true,
    output: { id: input.toolResultId },
    projection: {
      model: { id: input.toolResultId },
      user: { id: input.toolResultId },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  it("accepts suggestedQuestions on terminal actions and rejects legacy suggestion fields", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "可以继续。",
        suggestedQuestions: ["我想继续了解训练安排"],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "你今天有多少时间？",
        suggestedQuestions: ["20 分钟", "40 分钟"],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        question: "你今天有多少时间？",
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        details: expect.objectContaining({
          target: expect.objectContaining({
            kind: "AgentAction",
            schemaId: "AgentAction",
            variant: "ask_user",
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "required_field_missing",
              path: "content",
            }),
            expect.objectContaining({
              code: "unknown_field",
              path: "question",
            }),
          ]),
        }),
      },
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "可以继续。",
        suggestedQuestions: ["1", "2", "3", "4"],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_ACTION } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "可以继续。",
        assistantSuggestions: ["旧字段不应进入新主链"],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_ACTION } });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "你今天有多少时间？",
        suggestions: ["旧字段不应进入新主链"],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_ACTION } });
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
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
        details: expect.objectContaining({
          target: expect.objectContaining({
            kind: "ToolInput",
            toolName: "readOne",
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "invalid_type",
              path: "id",
              expected: { type: "string" },
              actual: { type: "number", value: 1 },
            }),
          ]),
        }),
      },
    });
  });

  it("returns field-level schema facts for missing read_recent references", () => {
    const registry = createProductionToolRegistry();
    const result = validateAgentAction({
      action: {
        type: "tool_call",
        toolName: "inspectVisibleTrainingProposals",
        input: { operation: "read_recent" },
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
    });
    const detailsJson = result.ok ? "" : JSON.stringify(result.error.details);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
        details: expect.objectContaining({
          target: expect.objectContaining({
            kind: "ToolInput",
            toolName: "inspectVisibleTrainingProposals",
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "required_field_missing",
              path: "ref",
            }),
          ]),
        }),
      },
    });
    expect(detailsJson).toContain("schema_validation_failed");
    expect(detailsJson).toContain("invalid_literal");
    expect(detailsJson).toContain("required_field_missing");
    expect(detailsJson).not.toContain("payload");
    expect(detailsJson).not.toContain("stack");
  });

  it("projects field-level repair facts for a newly registered fixture tool input schema", () => {
    const registry = new ToolRegistry();
    registry.register(defineTool({
      name: "schemaRepairFixture",
      version: "0.1.0",
      description: "读取 schema repair fixture。",
      whenToUse: "仅在 schema repair fixture 测试中使用。",
      whenNotToUse: "不要在测试之外使用。",
      inputSchema: z.object({
        id: z.string().min(1),
        mode: z.enum(["brief", "full"]),
      }).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      policy: {
        sideEffect: "read",
        riskLevel: "low",
        confirmation: "never",
      },
      handler: () => ({ ok: true }),
    }));

    expect(validateAgentAction({
      action: {
        type: "tool_call",
        toolName: "schemaRepairFixture",
        input: {
          mode: "verbose",
          legacyId: "old",
        },
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT,
        details: expect.objectContaining({
          type: "schema_validation_failed",
          target: expect.objectContaining({
            kind: "ToolInput",
            toolName: "schemaRepairFixture",
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "required_field_missing",
              path: "id",
            }),
            expect.objectContaining({
              code: "invalid_enum_value",
              path: "mode",
              allowedValues: ["brief", "full"],
            }),
            expect.objectContaining({
              code: "unknown_field",
              path: "legacyId",
            }),
          ]),
        }),
      },
    });
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
        usedRefs: toTerminalResourceRefs([{ resourceId: "resource-1" }]),
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
        usedRefs: toTerminalToolResultRefs(["missing-tool-result"]),
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });
  });

  it("rejects ungrounded final_answer after current-run tool results", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const satisfiedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_satisfied",
      ok: true,
      satisfied: true,
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "我稍后继续处理。",
        visibleOutputs: [],
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
        details: expect.objectContaining({
          type: "domain_validation_failed",
          target: expect.objectContaining({
            kind: "DomainValidation",
            schemaId: "AgentAction",
            variant: "final_answer",
          }),
          facts: expect.arrayContaining([
            expect.objectContaining({
              code: "missing_terminal_grounding_after_tool_result",
              path: "usedRefs",
              actual: { kind: "missing" },
              toolResultCount: 1,
            }),
          ]),
        }),
      },
    });
  });

  it("allows plain no-tool final_answer and grounded final_answer after tool results", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const satisfiedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_satisfied",
      ok: true,
      satisfied: true,
    });
    const resourceStore = new ResourceStore("run-grounded-terminal");
    const consumable = resourceStore.register({
      resourceId: "fixture-doc",
      resourceType: "fixture_document",
      role: "consumable",
      schemaVersion: "fixture@v1",
      sourceToolResultId: satisfiedResult.toolResultId,
      summary: { title: "Doc" },
    });
    const terminalOutputValidators = new TerminalOutputValidatorRegistry();
    terminalOutputValidators.register({
      outputType: "fixtureVisible",
      schemaVersions: ["1"],
      validate: (output) => (
        isRecord(output.payload) && output.payload.accepted === true
          ? { ok: true }
          : { ok: false, message: "fixture visible output rejected." }
      ),
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "普通问答可以直接收口。",
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "已基于 tool result 回答。",
        usedRefs: toTerminalToolResultRefs([satisfiedResult.toolResultId]),
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "已基于 consumable resource 回答。",
        usedRefs: toTerminalResourceRefs([toResourceRef(consumable)]),
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
      resourceStore,
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "已输出合法可见结构。",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: "1", payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
      terminalOutputValidators,
    })).toMatchObject({ ok: true });
  });

  it("rejects final_answer grounding by failed or unsatisfied tool results but allows ask_user diagnostics", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const failedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_failed",
      ok: false,
      satisfied: false,
    });
    const unsatisfiedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_unsatisfied",
      ok: true,
      satisfied: false,
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedRefs: toTerminalToolResultRefs([failedResult.toolResultId]),
      },
      registry,
      manifests,
      toolResults: [failedResult],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedRefs: toTerminalToolResultRefs([unsatisfiedResult.toolResultId]),
      },
      registry,
      manifests,
      toolResults: [unsatisfiedResult],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "需要补充信息。",
        usedRefs: toTerminalToolResultRefs([unsatisfiedResult.toolResultId]),
      },
      registry,
      manifests,
      toolResults: [unsatisfiedResult],
    })).toMatchObject({ ok: true });
  });

  it("validates final_answer visibleOutputs through the terminal output validator registry", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const terminalOutputValidators = new TerminalOutputValidatorRegistry();
    terminalOutputValidators.register({
      outputType: "fixtureVisible",
      schemaVersions: ["1"],
      validate: (output) => (
        isRecord(output.payload) && output.payload.accepted === true
          ? { ok: true }
          : { ok: false, message: "fixture visible output rejected.", details: { accepted: false } }
      ),
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: "1", payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
      terminalOutputValidators,
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: "1", payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "missingVisible", schemaVersion: "1", payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
      terminalOutputValidators,
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: "2", payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
      terminalOutputValidators,
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: "1", payload: { accepted: false } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
      terminalOutputValidators,
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
        details: expect.objectContaining({
          target: expect.objectContaining({
            kind: "DomainValidation",
            outputType: "fixtureVisible",
            schemaId: "fixtureVisible@1",
          }),
          facts: expect.arrayContaining([
            expect.objectContaining({
              code: "domain_validation_failed",
              accepted: false,
            }),
          ]),
        }),
      },
    });

    const numericSchemaVersionResult = validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: 1, payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
      terminalOutputValidators,
    });

    expect(numericSchemaVersionResult).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        message: expect.stringContaining("schemaVersion must be a string"),
        details: expect.objectContaining({
          target: expect.objectContaining({
            kind: "VisibleOutputEnvelope",
            schemaId: "VisibleOutputEnvelope",
            outputType: "fixtureVisible",
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "invalid_type",
              path: "visibleOutputs[0].schemaVersion",
              expected: { type: "string" },
              actual: { type: "number", value: 1 },
            }),
          ]),
        }),
      },
    });
    if (numericSchemaVersionResult.ok) {
      throw new Error("numeric schemaVersion should fail validation");
    }
    expect(numericSchemaVersionResult.error.message).not.toContain("\"1\"");
    expect(JSON.stringify(numericSchemaVersionResult.error.details)).not.toContain("\"1\"");

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        visibleOutputs: [
          { outputType: "fixtureVisible", schemaVersion: "1", payload: { accepted: true } },
        ],
      },
      registry,
      manifests,
      toolResults: [],
      terminalOutputValidators,
    })).toMatchObject({ ok: true });
  });

  it("validates M1 resource consumes and terminal grounding by resource role", () => {
    const registry = createM1ResourceRegistry();
    const store = new ResourceStore("run-m1-validator");
    const consumable = store.register({
      resourceId: "doc-1",
      resourceType: "fixture_document",
      role: "consumable",
      schemaVersion: "fixture@v1",
      sourceToolResultId: "tr_doc",
      summary: { title: "Doc" },
    });
    const diagnostic = store.register({
      resourceId: "diag-1",
      resourceType: "fixture_diagnostic",
      role: "diagnostic",
      schemaVersion: "fixture@v1",
      sourceToolResultId: "tr_diag",
      summary: { code: "blocked" },
    });

    expect(validateAgentAction({
      action: {
        type: "tool_call",
        toolName: "consumeResource",
        input: {},
        consumes: [toResourceRef(consumable)],
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: store,
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "tool_call",
        toolName: "consumeResource",
        input: {},
        consumes: [toResourceRef(diagnostic)],
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: store,
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedRefs: toTerminalResourceRefs([toResourceRef(diagnostic)]),
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: store,
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID } });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "需要补充信息。",
        usedRefs: toTerminalResourceRefs([toResourceRef(diagnostic)]),
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: store,
    })).toMatchObject({ ok: true });
  });
});
