import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import type { AgentRunResult, JsonValue, RegisteredResource, ToolHandlerContext } from "@/lib/server/agent-core/contracts";

export const M1_FIXTURE_RESOURCE_TYPE = "fixture_document";
export const M1_FIXTURE_DIAGNOSTIC_TYPE = "fixture_diagnostic";
export const M1_FIXTURE_SCHEMA_VERSION = "m1-fixture@v1";

const resourceProducerInputSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  includeSecret: z.boolean().optional(),
}).strict();

const resourceProducerOutputSchema = z.object({
  title: z.string(),
  body: z.string(),
  secretInternalValue: z.string().optional(),
}).strict();

/** resourceProducerFixtureTool 产出 consumable resource，用于验证 Runtime 统一登记资源。 */
export const resourceProducerFixtureTool = defineTool({
  name: "m1ResourceProducer",
  version: "0.1.0",
  description: "Produce a deterministic consumable resource for M1 resource-store tests.",
  whenToUse: "Use only in M1 fixture replay tests to create a consumable resource.",
  whenNotToUse: "Do not use for production chat, exercise search, workout generation, persistence, or user memory.",
  inputSchema: resourceProducerInputSchema,
  outputSchema: resourceProducerOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 500,
  },
  resourceContract: {
    produces: [
      { resourceType: M1_FIXTURE_RESOURCE_TYPE, role: "consumable", schemaVersion: M1_FIXTURE_SCHEMA_VERSION },
    ],
  },
  handler: (input: z.infer<typeof resourceProducerInputSchema>) => ({
    title: input.title,
    body: input.body,
    secretInternalValue: input.includeSecret ? "server-only-secret" : undefined,
  }),
  toResources: (output: z.infer<typeof resourceProducerOutputSchema>) => [
    {
      resourceType: M1_FIXTURE_RESOURCE_TYPE,
      role: "consumable",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
      summary: {
        title: output.title,
        preview: output.body,
      },
    },
  ],
  toModelObservation: (output: z.infer<typeof resourceProducerOutputSchema>) => ({
    title: output.title,
  }),
  toUserProjection: (output: z.infer<typeof resourceProducerOutputSchema>) => ({
    title: output.title,
    summary: output.body,
  }),
});

const resourceConsumerInputSchema = z.object({
  label: z.string().min(1).optional(),
}).strict();

const resourceConsumerOutputSchema = z.object({
  resourceId: z.string(),
  title: z.string(),
  label: z.string().optional(),
}).strict();

/** resourceConsumerFixtureTool 只读取 Runtime 已校验的 consumable resource，不自行判断自然语言意图。 */
export const resourceConsumerFixtureTool = defineTool({
  name: "m1ResourceConsumer",
  version: "0.1.0",
  description: "Consume a previously registered M1 fixture resource.",
  whenToUse: "Use only in M1 fixture replay tests after m1ResourceProducer registered a resource.",
  whenNotToUse: "Do not use without a current-run consumable resource reference.",
  inputSchema: resourceConsumerInputSchema,
  outputSchema: resourceConsumerOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 500,
  },
  resourceContract: {
    requires: [
      { resourceType: M1_FIXTURE_RESOURCE_TYPE, role: "consumable" },
    ],
  },
  handler: (input: z.infer<typeof resourceConsumerInputSchema>, context: ToolHandlerContext) => {
    const ref = context.consumedResources?.[0];
    if (!ref) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET,
        "m1ResourceConsumer requires a validated consumed resource.",
      );
    }

    const resource = context.resources?.assertConsumable(ref, { resourceType: M1_FIXTURE_RESOURCE_TYPE });
    return {
      resourceId: resource?.resourceId ?? ref.resourceId,
      title: readSummaryTitle(resource),
      label: input.label,
    };
  },
  toModelObservation: (output: z.infer<typeof resourceConsumerOutputSchema>) => ({
    consumedResourceId: output.resourceId,
    title: output.title,
    label: output.label ?? null,
  }),
  toUserProjection: (output: z.infer<typeof resourceConsumerOutputSchema>) => ({
    title: output.title,
    label: output.label ?? null,
  }),
});

const confirmationWriteInputSchema = z.object({
  recordId: z.string().min(1),
  value: z.string().min(1),
}).strict();

const confirmationWriteOutputSchema = z.object({
  savedRecordId: z.string(),
  savedValue: z.string(),
  executedAt: z.string(),
}).strict();

/** confirmationWriteFixtureTool 验证 write/high-risk tool 只能通过服务端 confirmation resume 执行。 */
export const confirmationWriteFixtureTool = defineTool({
  name: "m1ConfirmationWrite",
  version: "0.1.0",
  description: "Write a deterministic fixture value after confirmation.",
  whenToUse: "Use only in M1 confirmation replay tests.",
  whenNotToUse: "Do not execute before Policy Guard creates and consumes a pending action.",
  inputSchema: confirmationWriteInputSchema,
  outputSchema: confirmationWriteOutputSchema,
  policy: {
    sideEffect: "write",
    riskLevel: "high",
    confirmation: "always",
    permissions: ["fixture:write"],
    policyVersion: "m1-fixture-write-policy@v1",
    confirmationMessage: "确认写入 fixture 记录。",
    confirmationExpiresInMs: 60_000,
    timeoutMs: 500,
  },
  handler: (input: z.infer<typeof confirmationWriteInputSchema>) => ({
    savedRecordId: input.recordId,
    savedValue: input.value,
    executedAt: "2026-06-03T00:00:00.000Z",
  }),
  toModelObservation: (output: z.infer<typeof confirmationWriteOutputSchema>) => ({
    savedRecordId: output.savedRecordId,
  }),
  toUserProjection: (output: z.infer<typeof confirmationWriteOutputSchema>) => ({
    savedRecordId: output.savedRecordId,
    savedValue: output.savedValue,
  }),
});

const diagnosticFailureInputSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

const diagnosticFailureOutputSchema = z.object({
  code: z.string(),
  message: z.string(),
}).strict();

/** diagnosticFailureFixtureTool 产出 diagnostic resource，证明失败证据不能支撑成功 final answer。 */
export const diagnosticFailureFixtureTool = defineTool({
  name: "m1DiagnosticFailure",
  version: "0.1.0",
  description: "Produce diagnostic evidence for M1 grounding tests.",
  whenToUse: "Use only in M1 replay tests to explain blocked or failed fixture flows.",
  whenNotToUse: "Do not use as a successful business result.",
  inputSchema: diagnosticFailureInputSchema,
  outputSchema: diagnosticFailureOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 500,
  },
  resourceContract: {
    produces: [
      { resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE, role: "diagnostic", schemaVersion: M1_FIXTURE_SCHEMA_VERSION },
    ],
  },
  handler: (input: z.infer<typeof diagnosticFailureInputSchema>) => input,
  toFulfillment: (output: z.infer<typeof diagnosticFailureOutputSchema>) => ({
    satisfied: false,
    summary: output.message,
  }),
  toResources: (output: z.infer<typeof diagnosticFailureOutputSchema>) => [
    {
      resourceType: M1_FIXTURE_DIAGNOSTIC_TYPE,
      role: "diagnostic",
      schemaVersion: M1_FIXTURE_SCHEMA_VERSION,
      summary: {
        code: output.code,
        message: output.message,
      },
    },
  ],
  toModelObservation: (output: z.infer<typeof diagnosticFailureOutputSchema>) => ({
    code: output.code,
    message: output.message,
  }),
  toUserProjection: (output: z.infer<typeof diagnosticFailureOutputSchema>) => ({
    message: output.message,
  }),
});

/** m1SafetyFixtureTools 是 M1 验收工具集合，全部通过 ToolRegistry 注册而不是 core 特判。 */
export const m1SafetyFixtureTools = [
  resourceProducerFixtureTool,
  resourceConsumerFixtureTool,
  confirmationWriteFixtureTool,
  diagnosticFailureFixtureTool,
] as const;

/** summarizeM1FixtureTrace 生成测试可断言的安全 trace 摘要，不包含完整 tool output 或 secret。 */
export function summarizeM1FixtureTrace(result: AgentRunResult): JsonValue {
  return {
    status: result.status,
    traceEvents: result.traceEvents.map((event) => {
      if (event.type === "resource_registered") {
        return {
          type: event.type,
          toolResultId: event.toolResultId,
          resource: event.resource,
        };
      }
      if (event.type === "confirmation_request") {
        return {
          type: event.type,
          pendingActionId: event.request.pendingActionId,
          toolName: event.request.toolName,
        };
      }
      return event as unknown as JsonValue;
    }),
  };
}

function readSummaryTitle(resource: RegisteredResource | undefined) {
  const summary = resource?.summary;
  if (summary && typeof summary === "object" && !Array.isArray(summary) && typeof summary.title === "string") {
    return summary.title;
  }
  return resource?.resourceId ?? "unknown-resource";
}
