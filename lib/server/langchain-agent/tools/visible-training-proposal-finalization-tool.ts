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
    .describe("结构化训练结果。exerciseItems[].exerciseId 必须来自模型可见、可被服务端数据库复核的受控动作事实，不能编造。kind=exercise_selection 表示训练动作集合，kind=routine 表示单次训练，kind=plan 表示多天训练计划；字段、section、处方和日程由 schema 与服务端 validator 校验。"),
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
      "Purpose：提交模型已经构造好的 visibleTrainingProposal 结构化训练结果，让服务端 validator 校验并生成用户可见投影。",
      "Use When：当前回答要交付可展示、可后续引用或可继续调整的训练动作集合、单次训练 routine 或多天训练 plan。",
      "Do Not Use When：只回答普通训练知识、动作教学、注意事项、热身或拉伸方法、筛选结果说明等纯文本内容时，不需要使用本 tool。",
      "Input Source：payload 中的 exerciseItems[].exerciseId 必须来自模型可见、可被服务端数据库复核的受控动作事实；不能编造动作 id 或复写完整动作详情。",
      "Output Meaning：payload.kind 可为 exercise_selection、routine 或 plan；字段、section、prescription、schedule 和动作数据库事实都必须匹配当前 schema 与 validator 边界。",
      "Grounding Rules：本 tool 不查询动作库、不自动补全动作、不生成处方、不保存计划、不写入用户数据。",
      "accepted 表示结构已通过服务端 validator 并生成可渲染投影；rejected 只表示结构或确定性事实校验失败。",
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
        {},
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
      validationBoundary: "rejected payload 不会渲染为训练卡片，也不会保存为已展示事实；message 和 details 只表达服务端 validator 的确定性失败事实。",
    };
  }

  const payloadKind = readPayloadKind(output.visibleOutput.payload);
  return {
    status: "accepted",
    outputType: output.visibleOutput.outputType,
    schemaVersion: output.visibleOutput.schemaVersion,
    ...(payloadKind === undefined ? {} : { payloadKind }),
    exerciseItemCount: countExerciseItems(output.visibleOutput.payload),
    validationBoundary: "accepted 表示服务端已校验该结构，并生成可渲染的用户可见投影事实。",
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
