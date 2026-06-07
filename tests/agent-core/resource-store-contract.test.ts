import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { executeTool } from "@/lib/server/agent-core/executor";
import { validateAndRegisterProducedResources, validateConsumedResources } from "@/lib/server/agent-core/resource-contract";
import { createResourceId, ResourceStore, toResourceRef } from "@/lib/server/agent-core/resource-store";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";

const fixtureResource = {
  resourceId: "resource-1",
  resourceType: "fixture_document",
  role: "consumable" as const,
  schemaVersion: "fixture@v1",
  summary: { title: "Fixture" },
  sourceToolResultId: "tr_1",
};

function createRun(runId = "run-resource") {
  return {
    runId,
    actor: { userId: "user-1" },
    userInput: "resource",
  };
}

function createProducerTool(options: {
  producedType?: string;
  producedRole?: "consumable" | "diagnostic";
  omitResources?: boolean;
  producedResourceId?: string;
} = {}) {
  return defineTool({
    name: "resourceProducerForTest",
    version: "0.1.0",
    description: "在测试中产出一个 resource。",
    whenToUse: "仅在 resource contract 测试中使用。",
    whenNotToUse: "不要在生产环境使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    resourceContract: {
      produces: [
        { resourceType: "fixture_document", role: "consumable", schemaVersion: "fixture@v1" },
      ],
    },
    handler: (input: { id: string }) => input,
    toResources: options.omitResources
        ? undefined
      : (output: { id: string }) => [
          {
            resourceId: options.producedResourceId,
            resourceType: options.producedType ?? "fixture_document",
            role: options.producedRole ?? "consumable",
            schemaVersion: "fixture@v1",
            summary: { id: output.id },
          },
        ],
  });
}

function createConsumerTool() {
  return defineTool({
    name: "resourceConsumerForTest",
    version: "0.1.0",
    description: "在测试中消费一个 resource。",
    whenToUse: "仅在 resource contract 测试中使用。",
    whenNotToUse: "不要在生产环境使用。",
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
  });
}

describe("agent-core ResourceStore", () => {
  it("registers, queries and exposes current-run inventory", () => {
    const store = new ResourceStore("run-resource");
    const registered = store.register(fixtureResource);

    expect(store.get({ resourceId: "resource-1" })).toEqual(registered);
    expect(store.list({ resourceType: "fixture_document" })).toHaveLength(1);
    expect(store.inventory()).toEqual([
      {
        ref: toResourceRef(registered),
        summary: { title: "Fixture" },
      },
    ]);
  });

  it("generates resource ids when omitted and rejects duplicate ids in one run", () => {
    const store = new ResourceStore("run-resource");
    const registered = store.register({
      resourceType: "fixture_document",
      role: "consumable",
      schemaVersion: "fixture@v1",
      summary: { title: "Generated" },
      sourceToolResultId: "tr_generated",
    });

    expect(registered.resourceId).toBe(createResourceId({
      runId: "run-resource",
      sourceToolResultId: "tr_generated",
      resourceType: "fixture_document",
      role: "consumable",
      schemaVersion: "fixture@v1",
    }));
    expect(() => store.register({
      ...fixtureResource,
      sourceToolResultId: "tr_duplicate",
    })).not.toThrow();
    expect(() => store.register({
      ...fixtureResource,
      sourceToolResultId: "tr_duplicate_2",
    })).toThrow(AgentContractError);
    try {
      store.register({
        ...fixtureResource,
        sourceToolResultId: "tr_duplicate_3",
      });
      throw new Error("duplicate resource id should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION });
    }
  });

  it("rejects missing, cross-run and diagnostic resources as consumable inputs", () => {
    const store = new ResourceStore("run-resource");
    store.register(fixtureResource);
    store.register({
      ...fixtureResource,
      resourceId: "diagnostic-1",
      role: "diagnostic",
    });

    expect(() => store.assertConsumable({ resourceId: "missing" })).toThrow(AgentContractError);
    try {
      store.assertConsumable({ resourceId: "missing" });
      throw new Error("missing resource should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.RESOURCE_MISSING });
    }

    try {
      store.assertConsumable({ resourceId: "resource-1", runId: "other-run" });
      throw new Error("cross-run resource should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.RESOURCE_RUN_MISMATCH });
    }

    try {
      store.assertConsumable({ resourceId: "diagnostic-1" });
      throw new Error("diagnostic resource should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.RESOURCE_ROLE_INVALID });
    }
  });
});

describe("agent-core Resource Contract Validator", () => {
  it("accepts a consumer with a matching current-run consumable resource", () => {
    const store = new ResourceStore("run-resource");
    const registered = store.register(fixtureResource);
    const result = validateConsumedResources({
      tool: createConsumerTool(),
      resourceStore: store,
      action: {
        type: "tool_call",
        toolName: "resourceConsumerForTest",
        input: {},
      },
    });

    expect(result).toMatchObject({
      ok: true,
      consumedResources: [toResourceRef(registered)],
    });
  });

  it("rejects missing requirements and ignores diagnostic resources", () => {
    const store = new ResourceStore("run-resource");
    store.register({
      ...fixtureResource,
      resourceId: "diagnostic-1",
      role: "diagnostic",
    });

    expect(validateConsumedResources({
      tool: createConsumerTool(),
      resourceStore: store,
      action: { type: "tool_call", toolName: "resourceConsumerForTest", input: {} },
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET } });

    expect(validateConsumedResources({
      tool: createConsumerTool(),
      resourceStore: store,
      action: {
        type: "tool_call",
        toolName: "resourceConsumerForTest",
        input: {},
      },
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET } });
  });

  it("registers declared produced resources and rejects undeclared or missing productions", async () => {
    const store = new ResourceStore("run-resource");
    const producer = createProducerTool();
    const result = await executeTool({
      tool: producer,
      input: { id: "doc-1" },
      run: createRun(),
      timeoutMs: 100,
      toolCallId: "tc_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("producer should succeed");
    }

    expect(validateAndRegisterProducedResources({
      tool: producer,
      result,
      resourceStore: store,
      projectionContext: {
        runId: "run-resource",
        actor: { userId: "user-1" },
        toolCallId: "tc_1",
      },
    })).toMatchObject({ ok: true });
    const generatedResourceId = createResourceId({
      runId: "run-resource",
      sourceToolResultId: result.toolResultId,
      resourceType: "fixture_document",
      role: "consumable",
      schemaVersion: "fixture@v1",
    });
    expect(store.get({ resourceId: generatedResourceId })).toMatchObject({ role: "consumable" });

    const invalidProducer = createProducerTool({ producedType: "unexpected_type" });
    const invalidResult = await executeTool({
      tool: invalidProducer,
      input: { id: "doc-2" },
      run: createRun(),
      timeoutMs: 100,
      toolCallId: "tc_2",
    });
    if (!invalidResult.ok) {
      throw new Error("invalid producer handler should still return schema-valid output");
    }
    expect(validateAndRegisterProducedResources({
      tool: invalidProducer,
      result: invalidResult,
      resourceStore: store,
      projectionContext: {
        runId: "run-resource",
        actor: { userId: "user-1" },
        toolCallId: "tc_2",
      },
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION } });

    const missingProducer = createProducerTool({ omitResources: true });
    const missingResult = await executeTool({
      tool: missingProducer,
      input: { id: "doc-3" },
      run: createRun(),
      timeoutMs: 100,
      toolCallId: "tc_3",
    });
    if (!missingResult.ok) {
      throw new Error("missing producer handler should still return schema-valid output");
    }
    expect(validateAndRegisterProducedResources({
      tool: missingProducer,
      result: missingResult,
      resourceStore: store,
      projectionContext: {
        runId: "run-resource",
        actor: { userId: "user-1" },
        toolCallId: "tc_3",
      },
    })).toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION } });
  });
});
