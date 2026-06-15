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
  isVisibleTrainingCompositionSection,
  summarizeVisibleTrainingResourceCoverage,
} from "@/lib/server/visible-training-proposals/visible-training-resource-coverage";
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
    .describe("结构化训练结果。exerciseItems[].exerciseId 必须来自模型可见、可被服务端数据库复核的受控动作事实，不能编造；exerciseItems[] 可以来自 searchExerciseResources 返回的候选事实，也可以来自 inspectVisibleTrainingProposals 导入的历史 visibleTrainingProposal 事实。Kind Selection：kind=exercise_selection 只用于纯主训练动作推荐集合，exerciseItems[].section 必须全部是 training，且不包含 prescription 或 schedule；kind=routine 用于单次可执行训练，可以包含 warmup、training、stretch，至少包含 training，每个动作项必须包含 prescription，且不包含 schedule；kind=plan 用于多天或周期训练计划，每个动作项必须包含 prescription，并必须包含 schedule。schedule 可由模型基于本轮用户目标、明确周期、训练日/休息日安排或保守默认生成；字段、section、prescription、schedule 和动作数据库事实由 schema 与服务端 validator 校验。"),
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
      "Use When：最终回答会向用户呈现一个或多个具体训练动作，且这些动作来自模型可见、可被服务端数据库复核的受控动作事实；或当前回答要交付单次训练 routine / 多天训练 plan。",
      "Use When：当前回答只交付动作推荐集合、不交付组数次数休息或训练日程，但会向用户展示具体数据库动作条目时，也属于本 tool 的结构化收口场景；payload.kind 应选择 exercise_selection。",
      "Content Boundary：content 只解释已由 payload 承载并通过服务端 validator 的动作事实、推荐理由、目标肌群、适用场景、动作差异、动作注意事项或默认口径；content 不能替代 payload 中的动作、prescription 或 schedule 事实。",
      "Kind Selection：payload.kind=exercise_selection 只用于纯主训练动作推荐集合；exerciseItems[].section 必须全部是 training；不得包含 prescription 或 schedule。",
      "Kind Selection：payload.kind=routine 用于单次可执行训练；可以包含 warmup、training、stretch；至少包含 training；每个 exerciseItems[] 动作项都必须包含 prescription；不得包含 schedule。",
      "Kind Selection：payload.kind=plan 用于多天或周期训练计划；每个 exerciseItems[] 动作项都必须包含 prescription；必须包含 schedule；schedule 只表达同一套编排在周期内的训练日和休息日。",
      "Kind Selection：当结构需要 warmup / stretch，或要交付单次可执行训练时，不要把这些动作塞进 exercise_selection；应选择能承载可执行编排的 routine 或 plan。",
      "Do Not Use When：只回答普通训练知识、动作教学、注意事项、热身或拉伸方法、动作原理或差异解释、空结果或条件不足说明，且不把具体数据库动作作为回答条目展示时，不需要使用本 tool。",
      "Input Source：payload 中的 exerciseItems[].exerciseId 必须来自模型可见、可被服务端数据库复核的受控动作事实；不能编造动作 id 或复写完整动作详情。",
      "Input Source：payload.exerciseItems[] 可以从当前模型可见候选事实中选择子集构造；不要求使用候选池中的全部动作，也不要求先排除未使用动作。",
      "Input Source：payload.exerciseItems[] 可以来自 searchExerciseResources 返回的候选事实，也可以来自 inspectVisibleTrainingProposals 导入的历史 visibleTrainingProposal 事实；历史 routine fact 中的 exerciseId、section 和 prescription 可以作为新的 routine 或 plan 的事实来源。",
      "Input Source：payload.kind=plan 的 schedule 可由模型基于本轮用户目标、明确周期、训练日/休息日安排或保守默认生成；schedule 不要求来自动作库查询结果，但必须符合 schema 并通过服务端 validator。",
      "Output Meaning：accepted 表示 payload 已通过服务端 validator 并生成用户可见投影；rejected 表示结构或确定性事实校验失败。字段、section、prescription、schedule 和动作数据库事实都必须匹配当前 schema 与 validator 边界。",
      "Grounding Rules：本 tool 不查询动作库、不自动补全动作、不替模型生成 prescription、不保存计划、不写入用户数据；所选 exerciseItems[].exerciseId 来自模型可见受控动作事实，并满足当前 payload.kind、section 和 validator 边界时，可以提交结构化训练结果；如果提交 routine 或 plan，模型必须在 payload 中提供 prescription。",
      "Grounding Rules：当当前可见历史事实已经覆盖 plan 所需的动作、section 和 prescription 时，不需要为了重新确认同一批动作而再次查询动作库。",
      "Grounding Rules：payload.kind=exercise_selection 可以从当前候选事实中选择贴合目标的子集；不需要获取全部候选、不需要扩大候选数量、不需要把未选候选排除。",
      "accepted summary 会暴露已校验 payload 的 sectionSummary、availableSections、missingSections；这些字段只描述当前结构覆盖事实。",
      "accepted 表示结构已通过服务端 validator 并生成可渲染投影；rejected 只表示结构或确定性事实校验失败。",
    ].join("\n"),
    inputSchema: submitVisibleTrainingProposalInputSchema,
    outputSchema: submitVisibleTrainingProposalOutputSchema,
    runtimeActivity: {
      defaultSummary: "正在校验训练卡片内容",
    },
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
  const coverage = summarizeAcceptedVisibleOutputCoverage(output.visibleOutput);
  return {
    status: "accepted",
    outputType: output.visibleOutput.outputType,
    schemaVersion: output.visibleOutput.schemaVersion,
    ...(payloadKind === undefined ? {} : { payloadKind }),
    exerciseItemCount: countExerciseItems(output.visibleOutput.payload),
    ...(coverage === undefined ? {} : coverage),
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
  const coverage = summarizeAcceptedVisibleOutputCoverage(output.visibleOutput);
  return {
    status: "accepted",
    outputType: output.visibleOutput.outputType,
    schemaVersion: output.visibleOutput.schemaVersion,
    ...(payloadKind === undefined ? {} : { payloadKind }),
    exerciseItemCount: countExerciseItems(output.visibleOutput.payload),
    ...(coverage === undefined ? {} : coverage),
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

function summarizeAcceptedVisibleOutputCoverage(output: AcceptedVisibleTrainingProposalOutput) {
  const payload = output.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const exerciseItems = (payload as { exerciseItems?: unknown }).exerciseItems;
  if (!Array.isArray(exerciseItems)) {
    return undefined;
  }

  const sectionItems = exerciseItems.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const section = (item as { section?: unknown }).section;
    return isVisibleTrainingCompositionSection(section) ? [{ section }] : [];
  });

  return summarizeVisibleTrainingResourceCoverage({ exerciseItems: sectionItems });
}
