import { z } from "zod";
import { describe, expect, it } from "vitest";

import { validateAgentAction } from "@/lib/server/agent-core/action-validator";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import { ResourceStore } from "@/lib/server/agent-core/resource-store";
import { TerminalOutputValidatorRegistry } from "@/lib/server/agent-core/terminal-output-validator";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createProductionToolRegistry } from "@/lib/server/agent-tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { AgentActionSchema, type ToolResult } from "@/lib/server/agent-core/contracts";
import type { PlannerInput } from "@/lib/server/agent-core/planner-port";

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

function withPlannerContext(input: Omit<PlannerInput, "context">): PlannerInput {
  return {
    ...input,
    context: {
      run: input.run,
      step: input.step,
      manifests: input.manifests,
      observations: input.observations,
      toolResults: input.toolResults,
    },
  };
}

describe("agent-core PlannerPort, ReplayPlanner and Action Validator", () => {
  it("replays fixed actions and records planner inputs", async () => {
    const planner = new ReplayPlanner([
      { type: "final_answer", content: "done" },
    ]);
    const action = await planner.decideNext(withPlannerContext({
      run: {
        runId: "run-replay",
        actor: {},
        userInput: "hello",
      },
      step: 1,
      manifests: [],
      observations: [],
      toolResults: [],
    }));

    expect(action).toEqual({ type: "final_answer", content: "done" });
    expect(planner.calls).toHaveLength(1);
    await expect(planner.decideNext(withPlannerContext({
      run: {
        runId: "run-replay",
        actor: {},
        userInput: "hello",
      },
      step: 2,
      manifests: [],
      observations: [],
      toolResults: [],
    }))).rejects.toThrow(AgentContractError);
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

  it("normalizes discardable top-level tool_call fields without touching tool input", () => {
    const registry = createRegistry();
    const result = validateAgentAction({
      action: {
        type: "tool_call",
        toolName: "readOne",
        input: { id: "a" },
        content: "这段中间说明不能进入工具执行或前端响应。",
        suggestedQuestions: ["换一个动作"],
        visibleOutputs: [{ outputType: "debug", schemaVersion: "1", payload: { hidden: true } }],
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
    });

    expect(result).toMatchObject({
      ok: true,
      action: { type: "tool_call", toolName: "readOne", input: { id: "a" } },
      normalization: {
        selectedActionType: "tool_call",
        droppedFields: expect.arrayContaining([
          expect.objectContaining({ path: "content", valueType: "string", length: expect.any(Number) }),
          expect.objectContaining({ path: "suggestedQuestions", valueType: "array", length: 1 }),
          expect.objectContaining({ path: "visibleOutputs", valueType: "array", length: 1 }),
        ]),
      },
    });
    expect(result.ok ? result.action : undefined).not.toHaveProperty("content");
    expect(result.ok ? result.action : undefined).not.toHaveProperty("suggestedQuestions");
    expect(result.ok ? result.action : undefined).not.toHaveProperty("visibleOutputs");
    expect(JSON.stringify(result)).not.toContain("这段中间说明不能进入工具执行或前端响应");
  });

  it("accepts optional activitySummary on all AgentAction variants and reports only deterministic field errors", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();

    expect(validateAgentAction({
      action: { type: "tool_call", toolName: "readOne", input: { id: "a" }, activitySummary: "需要读取测试事实" },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: { type: "final_answer", content: "可以。", activitySummary: "正在整理最终回复" },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: { type: "ask_user", content: "你今天能练多久？", activitySummary: "需要确认训练时间" },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({ ok: true });

    const parsed = AgentActionSchema.safeParse({
      type: "ask_user",
      content: "你今天能练多久？",
      activitySummary: { debug: "internal" },
    });

    expect(parsed.success).toBe(false);
    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "你今天能练多久？",
        activitySummary: { debug: "internal" },
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
              code: "invalid_type",
              path: "activitySummary",
              expected: { type: "string" },
            }),
          ]),
        }),
      },
    });
  });

  it("accepts suggestedQuestions on terminal actions and drops discardable legacy extra fields", () => {
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

    const finalWithLegacySuggestion = validateAgentAction({
      action: {
        type: "final_answer",
        content: "可以继续。",
        assistantSuggestions: ["旧字段不应进入新主链"],
      },
      registry,
      manifests,
      toolResults: [],
    });

    expect(finalWithLegacySuggestion).toMatchObject({
      ok: true,
      normalization: {
        selectedActionType: "final_answer",
        droppedFields: [
          expect.objectContaining({ path: "assistantSuggestions", valueType: "array", length: 1 }),
        ],
      },
    });
    expect(finalWithLegacySuggestion.ok ? finalWithLegacySuggestion.action : undefined).not.toHaveProperty("assistantSuggestions");

    const askUserWithLegacySuggestion = validateAgentAction({
      action: {
        type: "ask_user",
        content: "你今天有多少时间？",
        suggestions: ["旧字段不应进入新主链"],
      },
      registry,
      manifests,
      toolResults: [],
    });

    expect(askUserWithLegacySuggestion).toMatchObject({
      ok: true,
      normalization: {
        selectedActionType: "ask_user",
        droppedFields: [
          expect.objectContaining({ path: "suggestions", valueType: "array", length: 1 }),
        ],
      },
    });
    expect(askUserWithLegacySuggestion.ok ? askUserWithLegacySuggestion.action : undefined).not.toHaveProperty("suggestions");
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
      action: { type: "tool_call", input: { id: "a" }, content: "不能补 toolName" },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        details: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "required_field_missing",
              path: "toolName",
            }),
            expect.objectContaining({
              code: "unknown_field",
              path: "content",
            }),
          ]),
        }),
      },
      normalization: {
        diagnosticStatus: "not_normalizable",
        selectedActionType: "tool_call",
        droppedFields: [],
      },
    });

    expect(validateAgentAction({
      action: { type: "tool_call", toolName: "readOne", content: "不能补 input" },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        details: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "required_field_missing",
              path: "input",
            }),
            expect.objectContaining({
              code: "unknown_field",
              path: "content",
            }),
          ]),
        }),
      },
      normalization: {
        diagnosticStatus: "not_normalizable",
        selectedActionType: "tool_call",
        droppedFields: [],
      },
    });

    const invalidToolInput = validateAgentAction({
      action: { type: "tool_call", toolName: "readOne", input: { id: 1 } },
      registry,
      manifests,
      toolResults: [],
    });

    expect(invalidToolInput).toMatchObject({
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

    const invalidToolInputWithTopLevelNoise = validateAgentAction({
      action: { type: "tool_call", toolName: "readOne", input: { id: 1 }, content: "不会放宽 input schema" },
      registry,
      manifests,
      toolResults: [],
    });

    expect(invalidToolInputWithTopLevelNoise).toMatchObject({
      ok: false,
      normalization: {
        selectedActionType: "tool_call",
        droppedFields: [
          expect.objectContaining({ path: "content", valueType: "string", length: expect.any(Number) }),
        ],
      },
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
            }),
          ]),
        }),
      },
    });
  });

  it("returns field-level schema facts for stale read_recent operation", () => {
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
              code: "invalid_literal",
              path: "operation",
              allowedValues: ["list_recent"],
            }),
          ]),
        }),
      },
    });
    expect(detailsJson).toContain("schema_validation_failed");
    expect(detailsJson).toContain("invalid_literal");
    expect(detailsJson).toContain("list_recent");
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

  it("rejects non-M0 capabilities and Planner-owned internal reference fields", () => {
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
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        details: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "unknown_field",
              path: "consumes",
              repair: expect.stringContaining("服务端内部维护"),
            }),
          ]),
        }),
      },
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedRefs: [{ type: "resource", id: "resource-1" }],
      },
      registry,
      manifests,
      toolResults: [],
    })).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        details: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "unknown_field",
              path: "usedRefs",
              repair: expect.stringContaining("服务端内部维护"),
            }),
          ]),
        }),
      },
    });
  });

  it("accepts final_answer and ask_user without usedRefs after current-run tool results", () => {
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
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "你希望保留哪些动作？",
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
    })).toMatchObject({ ok: true });
  });

  it("projects legacy terminal resource refs as removable schema fields", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const resourceStore = new ResourceStore("run-missing-terminal-resource");

    const result = validateAgentAction({
      action: {
        type: "final_answer",
        content: "我已基于这个资源回答。",
        usedRefs: [{ type: "resource", id: "business-object-id", resourceType: "fixture_document" }],
      },
      registry,
      manifests,
      toolResults: [],
      resourceStore,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: AGENT_ERROR_CODES.INVALID_ACTION,
        details: expect.objectContaining({
          type: "schema_validation_failed",
          target: expect.objectContaining({
            kind: "AgentAction",
            schemaId: "AgentAction",
            variant: "final_answer",
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: "unknown_field",
              path: "usedRefs",
              repair: expect.stringContaining("请删除"),
            }),
          ]),
        }),
      },
    });
    expect(JSON.stringify(result)).not.toContain("fulfillment.producedResources");
    expect(JSON.stringify(result)).not.toContain("inspectVisibleTrainingProposals");
  });

  it("allows plain terminal actions after tool results and still validates visibleOutputs", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const satisfiedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_satisfied",
      ok: true,
      satisfied: true,
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
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "还需要确认训练时间。",
      },
      registry,
      manifests,
      toolResults: [satisfiedResult],
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

  it("accepts plain terminal actions after failed or diagnostic tool results but rejects legacy refs", () => {
    const registry = createRegistry();
    const manifests = registry.serializeForPlanner();
    const failedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_failed",
      ok: false,
      satisfied: false,
    });
    const emptySatisfiedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_empty_satisfied",
      ok: true,
      satisfied: true,
    });
    const unsatisfiedResult = createTerminalGroundingToolResult({
      toolResultId: "tr_unsatisfied",
      ok: true,
      satisfied: false,
    });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "工具失败了，我无法基于它给出结构化结果。",
      },
      registry,
      manifests,
      toolResults: [failedResult],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "查询成功但没有找到满足条件的结果。",
      },
      registry,
      manifests,
      toolResults: [emptySatisfiedResult],
    })).toMatchObject({ ok: true });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedRefs: [{ type: "tool_result", id: unsatisfiedResult.toolResultId }],
      },
      registry,
      manifests,
      toolResults: [unsatisfiedResult],
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_ACTION } });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "需要补充信息。",
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

  it("validates M1 resource requirements through server-owned ResourceStore matching", () => {
    const registry = createM1ResourceRegistry();
    const store = new ResourceStore("run-m1-validator");
    store.register({
      resourceId: "doc-1",
      resourceType: "fixture_document",
      role: "consumable",
      schemaVersion: "fixture@v1",
      sourceToolResultId: "tr_doc",
      summary: { title: "Doc" },
    });
    const diagnosticOnlyStore = new ResourceStore("run-m1-validator-diagnostic");
    diagnosticOnlyStore.register({
      resourceId: "diag-1",
      resourceType: "fixture_document",
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
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: diagnosticOnlyStore,
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET } });

    expect(validateAgentAction({
      action: {
        type: "final_answer",
        content: "done",
        usedRefs: [{ type: "resource", id: "diag-1", resourceType: "fixture_document", role: "diagnostic" }],
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: store,
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_ACTION } });

    expect(validateAgentAction({
      action: {
        type: "ask_user",
        content: "需要补充信息。",
      },
      registry,
      manifests: registry.serializeForPlanner(),
      toolResults: [],
      resourceStore: store,
    })).toMatchObject({ ok: true });
  });
});
