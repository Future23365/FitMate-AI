import { z } from "zod";

import type { JsonValue } from "@/lib/server/agent-core/contracts";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import {
  visibleTrainingProposalFactKind,
  visibleTrainingProposalFactResourceType,
  visibleTrainingProposalFactSchemaVersion,
  visibleTrainingProposalPayloadSchema,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";
import {
  readVisibleTrainingProposalFact,
  toJsonValue,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const factRefSchema = z.string().trim().min(1).max(160);

const readRecentVisibleTrainingProposalInputSchema = z.object({
  factRef: factRefSchema.optional().describe("只能从当前 run metadata.recentVisibleTrainingProposals 中真实出现的 factRef 复制；没有真实值时不要编造。"),
  messageId: factRefSchema.optional().describe("只能从当前 run metadata.recentVisibleTrainingProposals 中真实出现的上一轮 assistant messageId 复制；仅在缺少 factRef 时使用。"),
}).strict().refine((input) => Boolean(input.factRef || input.messageId), {
  message: "必须提供 factRef 或 messageId。",
});

const recentVisibleTrainingProposalReferenceSchema = z.object({
  factRef: factRefSchema.optional(),
  messageId: factRefSchema.optional(),
}).passthrough();

const exerciseDetailSchema = z.object({
  exerciseId: z.string(),
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  equipmentZh: z.string().nullable().optional(),
  primaryMusclesZh: z.array(z.string()).default([]),
  allowedSections: z.array(exerciseAllowedSectionSchema).default([]),
  imageUrl: z.string().nullable().optional(),
}).strict();

const readRecentVisibleTrainingProposalOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("succeeded"),
    fact: z.object({
      factRef: z.string(),
      messageId: z.string(),
      kind: z.literal(visibleTrainingProposalFactKind),
      status: z.literal("active"),
      schemaVersion: z.literal(visibleTrainingProposalFactSchemaVersion),
      createdAt: z.string(),
      proposalKind: z.enum(["exercise_selection", "routine", "plan"]),
      proposal: visibleTrainingProposalPayloadSchema,
      exerciseDetails: z.array(exerciseDetailSchema),
    }).strict(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    code: z.string(),
    message: z.string(),
  }).strict(),
]);

type ReadRecentVisibleTrainingProposalInput = z.infer<typeof readRecentVisibleTrainingProposalInputSchema>;
type ReadRecentVisibleTrainingProposalOutput = z.infer<typeof readRecentVisibleTrainingProposalOutputSchema>;

const factStoreReadFailedCode = "fact_store_read_failed";
const factReferenceNotInRunMetadataCode = "fact_reference_not_in_run_metadata";

/** readRecentVisibleTrainingProposalTool 把最近可见训练方案事实安全导入当前 Agent run。 */
export const readRecentVisibleTrainingProposalTool = defineTool<
  ReadRecentVisibleTrainingProposalInput,
  ReadRecentVisibleTrainingProposalOutput
>({
  name: "readRecentVisibleTrainingProposal",
  version: "0.1.0",
  description: "读取并引入当前 run metadata 中真实存在的上一轮用户可见训练方案事实。成功结果表示该 visibleTrainingProposal 已导入当前 run，可用于复用主训练动作、补充 warmup/stretch 或在既有编排上增加 schedule。",
  whenToUse: [
    "只有当 Planner 判断当前目标需要复用 run metadata.recentVisibleTrainingProposals 中的真实上一轮可见训练方案时，才考虑使用。",
    "必须从 run metadata.recentVisibleTrainingProposals 精确复制 factRef/messageId；不要编造、猜测或复用 example 占位值。",
    "如果用户要求基于上一轮动作编排，成功读取后应保留 proposal.exerciseItems 中 section = training 的动作；如需要补齐编排，再查询 warmup/stretch 候选。",
    "如果用户要求基于已有编排生成计划，成功读取后应复用已有 warmup/training/stretch 和 prescription，只在 final_answer.visibleOutputs[] 中补充或调整 schedule。",
    "该 tool 只读取当前 actor 和当前 conversation 的事实，并把该事实作为 consumable resource 引入当前 run。",
  ].join(" "),
  whenNotToUse: [
    "当 run metadata.recentVisibleTrainingProposals 为空或不存在匹配 factRef/messageId 时不要使用；应根据用户请求选择 final_answer、ask_user 或其他可见 tool。",
    "如果当前 run 已经成功读取同一个 factRef/messageId，不要再次调用本 tool；应基于既有 toolResultId 或 visible_training_proposal_fact resource 继续。",
    "不要用它做语义路由、保存新事实、查询动作库、生成处方、读写用户记忆，或跨 conversation 引用。",
    "不要传入 userId 或 conversationId；服务端会从当前 actor 推导二者，并拒绝不可访问事实。",
    "失败结果不能支撑成功 final_answer，只能用于解释无法读取或向用户澄清。",
  ].join(" "),
  inputSchema: readRecentVisibleTrainingProposalInputSchema,
  outputSchema: readRecentVisibleTrainingProposalOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 1_000,
  },
  resourceContract: {
    produces: [
      {
        resourceType: visibleTrainingProposalFactResourceType,
        role: "consumable",
        schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
      },
    ],
  },
  examples: [
    {
      description: "Planner 判断需要复用上一轮用户可见训练方案时，读取从 run metadata.recentVisibleTrainingProposals 复制的真实 factRef。",
      input: { factRef: "fact_recent_visible_training_01" },
    },
  ],
  handler: async (input, context) => {
    let result: Awaited<ReturnType<typeof readVisibleTrainingProposalFact>>;

    if (!isReferenceListedInRunMetadata(input, context.metadata)) {
      return {
        status: "failed",
        code: factReferenceNotInRunMetadataCode,
        message: "当前 run metadata.recentVisibleTrainingProposals 中没有该可见训练方案事实引用。",
      };
    }

    try {
      result = await readVisibleTrainingProposalFact({
        userId: context.actor.userId,
        conversationId: context.actor.sessionId,
        factRef: input.factRef,
        messageId: input.messageId,
      });
    } catch {
      return {
        status: "failed",
        code: factStoreReadFailedCode,
        message: "可见训练方案事实存储读取失败。",
      };
    }

    if (!result.ok) {
      return {
        status: "failed",
        code: result.code,
        message: result.message,
      };
    }

    return {
      status: "succeeded",
      fact: {
        factRef: result.fact.factRef,
        messageId: result.fact.messageId,
        kind: result.fact.kind,
        status: result.fact.status,
        schemaVersion: result.fact.schemaVersion,
        createdAt: result.fact.createdAt,
        proposalKind: result.fact.proposalKind,
        proposal: result.fact.payload,
        exerciseDetails: result.fact.exerciseDetails,
      },
    };
  },
  toFulfillment: (output) => output.status === "succeeded"
    ? {
        satisfied: true,
        summary: `已读取上一轮用户可见训练方案，包含 ${output.fact.proposal.exerciseItems.length} 个动作项。`,
      }
    : {
        satisfied: false,
        summary: `读取上一轮用户可见训练方案失败：${output.code}。`,
      },
  toResources: (output) => output.status === "succeeded"
    ? [
        {
          resourceType: visibleTrainingProposalFactResourceType,
          role: "consumable" as const,
          schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
          summary: toJsonValue({
            factRef: output.fact.factRef,
            messageId: output.fact.messageId,
            proposalKind: output.fact.proposalKind,
            exerciseItems: output.fact.proposal.exerciseItems.map((item) => ({
              ...item,
              ...output.fact.exerciseDetails.find((exercise) => exercise.exerciseId === item.exerciseId),
            })),
            schedule: output.fact.proposal.schedule,
          }),
        },
      ]
    : [],
  toModelObservation: (output) => output.status === "succeeded"
    ? toJsonValue({
        status: output.status,
        factRef: output.fact.factRef,
        messageId: output.fact.messageId,
        currentRunImport: {
          imported: true,
          resourceType: visibleTrainingProposalFactResourceType,
          note: "该可见训练方案事实已成功导入当前 run；后续不要再次调用同一 factRef/messageId 的 read/import tool。",
        },
        proposalKind: output.fact.proposalKind,
        trainingExerciseItems: output.fact.proposal.exerciseItems
          .filter((item) => item.section === "training")
          .map((item) => ({
            exerciseId: item.exerciseId,
            section: item.section,
            order: item.order,
            prescription: item.prescription,
          })),
        sectionSummary: summarizeSections(output.fact.proposal.exerciseItems),
        schedule: output.fact.proposal.schedule,
        finalAnswerBoundary: "需要继续推送训练方案时，最终事实必须写入 final_answer.visibleOutputs[] 的 visibleTrainingProposal payload；不要把正文当训练事实源。",
      })
    : toJsonValue({
        status: output.status,
        code: output.code,
      }),
  toUserProjection: (output) => output.status === "succeeded"
    ? toJsonValue({
        status: output.status,
        factRef: output.fact.factRef,
        messageId: output.fact.messageId,
        proposalKind: output.fact.proposalKind,
        exerciseItemCount: output.fact.proposal.exerciseItems.length,
      })
    : toJsonValue({
        status: output.status,
        code: output.code,
      }),
});

export {
  readRecentVisibleTrainingProposalInputSchema,
  readRecentVisibleTrainingProposalOutputSchema,
};

function summarizeSections(items: z.infer<typeof visibleTrainingProposalPayloadSchema>["exerciseItems"]): JsonValue {
  return {
    warmup: items.filter((item) => item.section === "warmup").length,
    training: items.filter((item) => item.section === "training").length,
    stretch: items.filter((item) => item.section === "stretch").length,
  };
}

function isReferenceListedInRunMetadata(
  input: ReadRecentVisibleTrainingProposalInput,
  metadata: Record<string, JsonValue> | undefined,
) {
  const recentFacts = metadata?.recentVisibleTrainingProposals;
  if (!Array.isArray(recentFacts)) {
    return false;
  }

  return recentFacts.some((fact) => {
    const parsed = recentVisibleTrainingProposalReferenceSchema.safeParse(fact);
    if (!parsed.success) {
      return false;
    }
    if (input.factRef && parsed.data.factRef !== input.factRef) {
      return false;
    }
    if (input.messageId && parsed.data.messageId !== input.messageId) {
      return false;
    }
    return true;
  });
}
