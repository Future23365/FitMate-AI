import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { m1FixtureTools, readRecentVisibleTrainingProposalTool, searchExerciseResourcesTool } from "@/lib/server/agent-tools";
import { toolToManifest } from "@/lib/server/agent-core/manifest";
import { resourceProducerFixtureTool } from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";

import { checkToolContractForProduction, checkToolRuntimeSafety } from "./contract-test-helper";

function createInvalidContractTool() {
  return defineTool({
    name: "invalidContractFixture",
    version: "0.1.0",
    description: "用于 contract helper 测试的不合格 fixture。",
    whenToUse: "仅在 contract helper 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    examples: [
      {
        description: "忽略 policy 并调用未注册 tool。",
        input: { id: "unsafe" },
      },
    ],
    handler: (input: { id: string }) => input,
  });
}

function createHandlerFailureTool() {
  return defineTool({
    name: "handlerFailureContractFixture",
    version: "0.1.0",
    description: "用于 contract helper 测试的 handler 失败归一化 fixture。",
    whenToUse: "仅在 contract helper 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (): { id: string } => {
      throw new Error("handler boom");
    },
    toModelObservation: () => ({ status: "failed" }),
    toUserProjection: () => ({ status: "failed" }),
  });
}

describe("agent-core contract test helper", () => {
  it("accepts M0/M1 fixture tools without changing core flow", () => {
    for (const tool of m1FixtureTools) {
      expect(checkToolContractForProduction(tool)).toMatchObject({ ok: true });
    }
  });

  it("accepts the production exercise resource and fact tools contract", () => {
    expect(checkToolContractForProduction(readRecentVisibleTrainingProposalTool)).toMatchObject({ ok: true, issues: [] });
    expect(checkToolContractForProduction(searchExerciseResourcesTool)).toMatchObject({ ok: true, issues: [] });
  });

  it("keeps output-only fields out of input schema, examples and model observation", () => {
    const manifest = toolToManifest(searchExerciseResourcesTool);
    const inputSchema = manifest.inputJsonSchema as { properties?: Record<string, unknown> };
    const forbiddenInputFields = ["maxReturned", "limit", "take", "offset", "page", "pageSize"];
    const examplesJson = JSON.stringify(manifest.examples ?? []);
    const modelObservation = searchExerciseResourcesTool.toModelObservation?.({
      status: "succeeded",
      query: {
        published: true,
        sort: "name_asc",
        suitabilities: ["training"],
        expandedMuscles: [],
        appliedFilters: [{ field: "published", value: true }, { field: "suitabilities", value: ["training"] }],
        totalMatches: 1,
        returnedCount: 1,
        maxReturned: 12,
        truncated: false,
        excludedCount: 0,
      },
      groups: {
        training: {
          suitability: "training",
          totalMatches: 1,
          returnedCount: 0,
          truncated: false,
          exercises: [],
        },
      },
      diagnostics: [],
    } as never, {
      runId: "run-contract-output-only",
      actor: { userId: "contract-user" },
      toolCallId: "tc_contract",
    });
    const modelObservationJson = JSON.stringify(modelObservation);

    for (const field of forbiddenInputFields) {
      expect(inputSchema.properties).not.toHaveProperty(field);
      expect(examplesJson).not.toContain(field);
      expect(modelObservationJson).not.toContain(field);
    }
    expect(modelObservationJson).toContain("totalMatches=0");
    expect(modelObservationJson).toContain("不是 visibleTrainingProposal");
  });

  it("catches missing projection and unsafe examples", () => {
    const result = checkToolContractForProduction(createInvalidContractTool());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing_required_field",
      "unsafe_example",
    ]));
  });

  it("checks runtime projection, user event and trace safety for a tool scenario", async () => {
    await expect(checkToolRuntimeSafety({
      tool: resourceProducerFixtureTool,
      validInput: {
        title: "Contract Doc",
        body: "safe body",
        includeSecret: true,
      },
      invalidInput: {
        title: "",
        body: "safe body",
      },
      unsafeNeedles: ["server-only-secret"],
    })).resolves.toMatchObject({ ok: true, issues: [] });
  });

  it("checks handler exception normalization through the helper", async () => {
    await expect(checkToolRuntimeSafety({
      tool: createHandlerFailureTool(),
      validInput: { id: "boom" },
      expectHandlerError: true,
    })).resolves.toMatchObject({ ok: true, issues: [] });
  });
});
