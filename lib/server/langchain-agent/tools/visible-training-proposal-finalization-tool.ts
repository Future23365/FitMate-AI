import "server-only";

import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  JsonValueSchema,
  type VisibleOutputEnvelope,
} from "@/lib/server/visible-outputs/contracts";
import {
  toJsonValue,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  visibleTrainingProposalSchemaVersion,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";
import {
  validateVisibleTrainingProposalOutput,
  type VisibleTrainingProposalValidatorOptions,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-validator";
import { renderVisibleTrainingProposalOutput } from "@/lib/server/visible-training-proposals/visible-training-proposal-renderer";

import { defineLangChainToolWrapper } from "../tool-wrapper";
import type { LangChainJsonValue } from "../types";

export type CreateSubmitVisibleTrainingProposalLangChainToolOptions = VisibleTrainingProposalValidatorOptions;

const submitVisibleTrainingProposalInputSchema = z.object({
  outputType: z.literal(visibleTrainingProposalOutputType)
    .describe("固定为 visibleTrainingProposal；表示提交用户可见训练方案结构给服务端校验。"),
  schemaVersion: z.literal(visibleTrainingProposalSchemaVersion)
    .describe("固定为当前 visibleTrainingProposal schemaVersion。"),
  payload: visibleTrainingProposalPayloadSchema
    .describe("训练方案结构。exerciseItems[].exerciseId 必须来自模型可见、可被服务端数据库复核的受控动作事实，不能编造。kind=exercise_selection 表示动作候选或动作推荐卡片，只需要 exerciseId、section、order，不包含处方或日程；kind=routine 或 kind=plan 时，training 是硬边界。"),
}).strict();

const acceptedVisibleOutputSchema = z.object({
  outputType: z.literal(visibleTrainingProposalOutputType),
  schemaVersion: z.literal(visibleTrainingProposalSchemaVersion),
  payload: JsonValueSchema,
  content: JsonValueSchema.optional(),
}).strict();

const submitVisibleTrainingProposalOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("accepted"),
    visibleOutput: acceptedVisibleOutputSchema,
    validation: z.object({
      metadata: JsonValueSchema.optional(),
    }).strict(),
  }).strict(),
  z.object({
    status: z.literal("rejected"),
    code: z.enum(["structured_output_validation_failed", "visible_output_render_failed"]),
    message: z.string(),
    details: JsonValueSchema.optional(),
  }).strict(),
]);

export const submitVisibleTrainingProposalOutputType = submitVisibleTrainingProposalOutputSchema;
type AcceptedVisibleTrainingProposalOutput = z.infer<typeof acceptedVisibleOutputSchema>;
export type SubmitVisibleTrainingProposalOutput = z.infer<typeof submitVisibleTrainingProposalOutputSchema>;

/** submitVisibleTrainingProposalLangChainTool 是训练方案结构化终态的唯一校验收口，不保存数据也不解析自然语言。 */
export const submitVisibleTrainingProposalLangChainTool = createSubmitVisibleTrainingProposalLangChainTool();

/** createSubmitVisibleTrainingProposalLangChainTool 允许测试注入动作事实 loader，生产默认读取数据库事实。 */
export function createSubmitVisibleTrainingProposalLangChainTool(
  options: CreateSubmitVisibleTrainingProposalLangChainToolOptions = {},
) {
  return defineLangChainToolWrapper<
    typeof submitVisibleTrainingProposalInputSchema,
    SubmitVisibleTrainingProposalOutput
  >({
    name: "submitVisibleTrainingProposal",
    description: [
      "提交已经生成完成的 visibleTrainingProposal 结构，让服务端校验并生成用户可见训练卡片投影。",
      "当用户需要用户可见、可后续引用的动作候选、动作推荐卡片、routine 或 plan，且你已有模型可见、可被服务端数据库复核的受控动作事实时调用。",
      "kind=exercise_selection 表示动作候选或动作推荐卡片；通常只提交 training section 的 exerciseId、section、order，不包含 prescription 或 schedule。",
      "kind=routine 或 kind=plan 表示带训练处方或日程的结构化方案；应优先使用 warmup、training、stretch 三类动作事实，已有 training 但缺 warmup 或 stretch 且仍可继续查询时，应先查询缺失 support section。",
      "本 tool 不查询动作库、不保存计划、不写入用户数据；accepted 才会生成 visible_output，rejected 不能说成已生成卡片或已保存。",
    ].join("\n"),
    inputSchema: submitVisibleTrainingProposalInputSchema,
    outputSchema: submitVisibleTrainingProposalOutputSchema,
    timeoutMs: agentRuntimeConfig.tools.submitVisibleTrainingProposal.timeoutMs,
    handler: async (input) => {
      const envelope: VisibleOutputEnvelope = {
        outputType: input.outputType,
        schemaVersion: input.schemaVersion,
        payload: toJsonValue(input.payload),
      };
      const validation = await validateVisibleTrainingProposalOutput(
        envelope,
        { toolResults: [] },
        options,
      );

      if (!validation.ok) {
        return {
          status: "rejected",
          code: "structured_output_validation_failed",
          message: validation.message,
          ...(validation.details === undefined ? {} : { details: validation.details }),
        } satisfies SubmitVisibleTrainingProposalOutput;
      }

      const rendered = renderVisibleTrainingProposalOutput(
        envelope,
        {
          terminalOutputValidation: {
            outputs: [{
              index: 0,
              outputType: envelope.outputType,
              schemaVersion: envelope.schemaVersion,
              ...(validation.metadata === undefined ? {} : { metadata: validation.metadata }),
            }],
          },
        },
        0,
      )[0];

      if (!rendered) {
        return {
          status: "rejected",
          code: "visible_output_render_failed",
          message: "visibleTrainingProposal 已通过校验，但未能生成用户可见投影。",
        } satisfies SubmitVisibleTrainingProposalOutput;
      }
      const visibleOutput: AcceptedVisibleTrainingProposalOutput = {
        outputType: visibleTrainingProposalOutputType,
        schemaVersion: visibleTrainingProposalSchemaVersion,
        payload: rendered.payload,
        ...(rendered.content === undefined ? {} : { content: rendered.content }),
      };

      return {
        status: "accepted",
        visibleOutput,
        validation: {
          ...(validation.metadata === undefined ? {} : { metadata: validation.metadata }),
        },
      } satisfies SubmitVisibleTrainingProposalOutput;
    },
    toModelVisibleSummary: createSubmitVisibleTrainingProposalModelSummary,
    toUserProjection: createSubmitVisibleTrainingProposalUserProjection,
    toTraceSummary: createSubmitVisibleTrainingProposalTraceSummary,
  });
}

function createSubmitVisibleTrainingProposalModelSummary(
  output: SubmitVisibleTrainingProposalOutput,
): LangChainJsonValue {
  if (output.status === "rejected") {
    return {
      status: "rejected",
      code: output.code,
      message: output.message,
      ...(output.details === undefined ? {} : { details: output.details }),
      instruction: "不要把该结构当作已生成卡片；请修正结构、重新调用工具，或向用户说明无法生成。",
    };
  }

  const payloadKind = readPayloadKind(output.visibleOutput.payload);
  return {
    status: "accepted",
    outputType: output.visibleOutput.outputType,
    schemaVersion: output.visibleOutput.schemaVersion,
    ...(payloadKind === undefined ? {} : { payloadKind }),
    exerciseItemCount: countExerciseItems(output.visibleOutput.payload),
    instruction: "服务端已校验该结构，最终回答可以引用这张已验证训练卡片。",
  };
}

function createSubmitVisibleTrainingProposalUserProjection(
  output: SubmitVisibleTrainingProposalOutput,
): LangChainJsonValue {
  if (output.status === "accepted") {
    return {
      validatedVisibleOutputs: [output.visibleOutput],
    };
  }

  return {
    rejectedVisibleOutput: {
      code: output.code,
      message: output.message,
    },
  };
}

function createSubmitVisibleTrainingProposalTraceSummary(
  output: SubmitVisibleTrainingProposalOutput,
): LangChainJsonValue {
  if (output.status === "rejected") {
    return {
      status: "rejected",
      code: output.code,
      message: output.message,
    };
  }

  const payloadKind = readPayloadKind(output.visibleOutput.payload);
  return {
    status: "accepted",
    outputType: output.visibleOutput.outputType,
    schemaVersion: output.visibleOutput.schemaVersion,
    ...(payloadKind === undefined ? {} : { payloadKind }),
    exerciseItemCount: countExerciseItems(output.visibleOutput.payload),
  };
}

function readPayloadKind(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const kind = (payload as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

function countExerciseItems(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return 0;
  }

  const exerciseItems = (payload as { exerciseItems?: unknown }).exerciseItems;
  return Array.isArray(exerciseItems) ? exerciseItems.length : 0;
}
