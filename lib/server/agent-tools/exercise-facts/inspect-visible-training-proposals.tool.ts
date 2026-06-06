import { z } from "zod";

import type { ToolHandlerContext } from "@/lib/server/agent-core/contracts";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import { agentRuntimeConfig } from "@/lib/server/config";
import {
  visibleTrainingProposalFactIndexResourceType,
  visibleTrainingProposalFactKind,
  visibleTrainingProposalFactResourceType,
  visibleTrainingProposalFactSchemaVersion,
  visibleTrainingProposalPayloadSchema,
  visibleTrainingProposalSchemaVersion,
  type VisibleTrainingExerciseItem,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";
import {
  summarizeVisibleTrainingResourceCoverage,
  summarizeVisibleTrainingSections,
} from "@/lib/server/visible-training-proposals/visible-training-resource-coverage";
import {
  listRecentVisibleTrainingProposalSummaries,
  readVisibleTrainingProposalFact,
  toJsonValue,
  type VisibleTrainingProposalFactSummary,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const factRefSchema = z.string().trim().min(1).max(160);
const readRecentOperationDescription = "读取本轮 list_recent 返回的具体可见训练方案事实，并导入当前 run。";
const readRecentRefSchema = z.object({
  type: z.enum(["fact_ref", "message_id"]).describe("引用类型；fact_ref 表示 ref.value 复制本轮 list_recent 返回的 factRef，message_id 表示 ref.value 复制本轮 list_recent 返回的 messageId。"),
  value: factRefSchema.describe("只能复制本轮 list_recent 返回的 factRef 或 messageId；没有真实返回值时先调用 list_recent，不要编造。"),
}).strict();

const listRecentInputSchema = z.object({
  operation: z.literal("list_recent").describe("查询当前 actor 和当前 conversation 可访问的最近 visibleTrainingProposal 轻量事实索引；不需要 ref。"),
}).strict();

const readRecentInputSchema = z.object({
  operation: z.literal("read_recent").describe(readRecentOperationDescription),
  ref: readRecentRefSchema.describe("统一读取引用槽；用 ref.type 区分 factRef 或 messageId，用 ref.value 复制本轮 list_recent 结果或 diagnostic index resource 中真实出现的引用值。"),
}).strict();

const inspectVisibleTrainingProposalsInputSchema = z.union([
  listRecentInputSchema,
  readRecentInputSchema,
]);

const visibleTrainingProposalReferenceSchema = z.object({
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

const sectionSummarySchema = z.object({
  warmup: z.number().int().min(0),
  training: z.number().int().min(0),
  stretch: z.number().int().min(0),
}).strict();
type SectionSummary = z.infer<typeof sectionSummarySchema>;

const reusableTrainingExerciseSchema = z.object({
  exerciseId: z.string(),
  order: z.number().int().min(1),
  section: z.literal("training"),
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
}).strict();

const visibleTrainingProposalFactIndexSchema = z.object({
  factRef: z.string(),
  messageId: z.string(),
  kind: z.literal(visibleTrainingProposalFactKind),
  status: z.literal("active"),
  createdAt: z.string(),
  proposalKind: z.enum(["exercise_selection", "routine", "plan"]),
  visibleOutputSchemaVersion: z.literal(visibleTrainingProposalSchemaVersion),
  factSchemaVersion: z.literal(visibleTrainingProposalFactSchemaVersion),
  sectionSummary: sectionSummarySchema,
  reusableTrainingExerciseCount: z.number().int().min(0),
  reusableTrainingExercises: z.array(reusableTrainingExerciseSchema),
}).strict();

const inspectVisibleTrainingProposalsOutputSchema = z.union([
  z.object({
    status: z.literal("succeeded"),
    operation: z.literal("list_recent"),
    facts: z.array(visibleTrainingProposalFactIndexSchema),
  }).strict(),
  z.object({
    status: z.literal("succeeded"),
    operation: z.literal("read_recent"),
    fact: z.object({
      factRef: z.string(),
      messageId: z.string(),
      kind: z.literal(visibleTrainingProposalFactKind),
      status: z.literal("active"),
      createdAt: z.string(),
      proposalKind: z.enum(["exercise_selection", "routine", "plan"]),
      visibleOutputSchemaVersion: z.literal(visibleTrainingProposalSchemaVersion),
      factSchemaVersion: z.literal(visibleTrainingProposalFactSchemaVersion),
      proposal: visibleTrainingProposalPayloadSchema,
      exerciseDetails: z.array(exerciseDetailSchema),
    }).strict(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    operation: z.enum(["list_recent", "read_recent"]),
    code: z.string(),
    message: z.string(),
  }).strict(),
]);

type InspectVisibleTrainingProposalsInput = z.infer<typeof inspectVisibleTrainingProposalsInputSchema>;
type InspectVisibleTrainingProposalsOutput = z.infer<typeof inspectVisibleTrainingProposalsOutputSchema>;
type ReadRecentInput = Extract<InspectVisibleTrainingProposalsInput, { operation: "read_recent" }>;
type VisibleTrainingProposalFactIndex = z.infer<typeof visibleTrainingProposalFactIndexSchema>;

const factStoreListFailedCode = "fact_store_list_failed";
const factStoreReadFailedCode = "fact_store_read_failed";
const factReferenceNotVisibleCode = "fact_reference_not_visible_in_run";

/** inspectVisibleTrainingProposalsTool 是当前会话可见训练方案事实的只读 inspect 入口，不做自然语言语义分流。 */
export const inspectVisibleTrainingProposalsTool = defineTool<
  InspectVisibleTrainingProposalsInput,
  InspectVisibleTrainingProposalsOutput
>({
  name: "inspectVisibleTrainingProposals",
  version: "0.6.0",
  description: "只读查询当前会话中用户已经看到的 visibleTrainingProposal。list_recent 列出最近可引用方案索引；read_recent 读取本轮索引中的具体方案，成功后导入 consumable visible_training_proposal_fact。",
  whenToUse: [
    "需要确认当前会话是否存在可操作的 visibleTrainingProposal 时，先用 operation = \"list_recent\"；该操作不需要 ref，只返回轻量索引。",
    "需要读取一个具体历史方案时，用 operation = \"read_recent\"；ref 必须来自本轮 list_recent 返回的 factRef 或 messageId。",
    "read_recent 成功后会把 visible_training_proposal_fact 作为当前 run 的 consumable resource 导入，可支撑复用、修改、派生或替换判断。",
    "factRef 和 messageId 只用于 read_recent.ref.value；final_answer.usedRefs.resource.id 必须来自当前 run producedResources 中的 resourceId。",
  ].join(" "),
  whenNotToUse: [
    "不要用本 tool 查询动作库、读取其他 conversation 的方案或跨用户引用历史事实。",
    "不要在 operation = \"list_recent\" 时传入 ref、factRef、messageId、分页、limit、cursor、userId 或 conversationId；服务端固定最近数量并从 actor 推导权限边界。",
    "不要在 operation = \"read_recent\" 时传入顶层 factRef 或 messageId；读取引用统一写入 ref: { type: \"fact_ref\" | \"message_id\", value: \"...\" }。",
    "不要从历史 assistant 消息、示例、trace 摘要或业务存储 id 猜测 ref.value；没有本轮 list_recent 索引时应先调用 operation = \"list_recent\"。",
    "不要在 operation = \"read_recent\" 时编造 ref.value；失败结果不能支撑成功训练方案生成。",
  ].join(" "),
  inputSchema: inspectVisibleTrainingProposalsInputSchema,
  outputSchema: inspectVisibleTrainingProposalsOutputSchema,
  // uiActivityStage 将训练事实读取类 tool 绑定到用户安全的读取进度阶段。
  uiActivityStage: "reading_artifacts",
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: agentRuntimeConfig.tools.inspectVisibleTrainingProposals.timeoutMs,
  },
  resourceContract: {
    produces: [
      {
        resourceType: visibleTrainingProposalFactIndexResourceType,
        role: "diagnostic",
        schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
      },
      {
        resourceType: visibleTrainingProposalFactResourceType,
        role: "consumable",
        schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
      },
    ],
  },
  examples: [
    {
      description: "查询当前会话最近是否有可引用的 visibleTrainingProposal 事实索引。",
      action: {
        type: "tool_call",
        toolName: "inspectVisibleTrainingProposals",
        input: { operation: "list_recent" },
      },
    },
    {
      description: "读取本轮 list_recent 返回的具体方案；ref.value 必须复制真实返回的 factRef。",
      action: {
        type: "tool_call",
        toolName: "inspectVisibleTrainingProposals",
        input: {
          operation: "read_recent",
          ref: {
            type: "fact_ref",
            value: "本轮 list_recent 返回的 factRef",
          },
        },
      },
    },
  ],
  handler: async (input, context) => {
    if (input.operation === "list_recent") {
      if (!context.actor.userId) {
        return {
          status: "failed",
          operation: "list_recent",
          code: "actor_missing",
          message: "当前 actor 缺少 userId，无法查询可见训练方案事实索引。",
        };
      }

      try {
        const facts = await listRecentVisibleTrainingProposalSummaries({
          userId: context.actor.userId,
          conversationId: context.actor.sessionId,
          limit: agentRuntimeConfig.tools.inspectVisibleTrainingProposals.recentFactListLimit,
        });

        return {
          status: "succeeded",
          operation: "list_recent",
          facts: facts.map(toFactIndex),
        };
      } catch {
        return {
          status: "failed",
          operation: "list_recent",
          code: factStoreListFailedCode,
          message: "可见训练方案事实索引读取失败。",
        };
      }
    }

    if (!isReferenceVisibleInCurrentRun(input, context)) {
      return {
        status: "failed",
        operation: "read_recent",
        code: factReferenceNotVisibleCode,
        message: "当前 run 可见事实索引中没有该 visibleTrainingProposal 引用。",
      };
    }

    try {
      const result = await readVisibleTrainingProposalFact({
        userId: context.actor.userId,
        conversationId: context.actor.sessionId,
        factRef: input.ref.type === "fact_ref" ? input.ref.value : undefined,
        messageId: input.ref.type === "message_id" ? input.ref.value : undefined,
      });

      if (!result.ok) {
        return {
          status: "failed",
          operation: "read_recent",
          code: result.code,
          message: result.message,
        };
      }

      return {
        status: "succeeded",
        operation: "read_recent",
        fact: {
          factRef: result.fact.factRef,
          messageId: result.fact.messageId,
          kind: result.fact.kind,
          status: result.fact.status,
          createdAt: result.fact.createdAt,
          proposalKind: result.fact.proposalKind,
          visibleOutputSchemaVersion: visibleTrainingProposalSchemaVersion,
          factSchemaVersion: result.fact.schemaVersion,
          proposal: result.fact.payload,
          exerciseDetails: result.fact.exerciseDetails,
        },
      };
    } catch {
      return {
        status: "failed",
        operation: "read_recent",
        code: factStoreReadFailedCode,
        message: "可见训练方案事实存储读取失败。",
      };
    }
  },
  toFulfillment: (output) => {
    if (output.status === "failed") {
      return {
        satisfied: false,
        summary: output.operation === "list_recent"
          ? `查询可见训练方案事实索引失败：${output.code}。`
          : `读取可见训练方案事实失败：${output.code}。`,
      };
    }

    if (output.operation === "list_recent") {
      return {
        satisfied: true,
        summary: `已查询当前会话最近可见训练方案事实索引，返回 ${output.facts.length} 条。`,
      };
    }

    return {
      satisfied: true,
      summary: `已读取并导入用户可见训练方案，包含 ${output.fact.proposal.exerciseItems.length} 个动作项。`,
    };
  },
  toResources: (output) => {
    if (output.status !== "succeeded") {
      return [];
    }

    if (output.operation === "list_recent") {
      return [
        {
          resourceType: visibleTrainingProposalFactIndexResourceType,
          role: "diagnostic" as const,
          schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
          summary: toJsonValue({
            operation: output.operation,
            facts: output.facts,
            boundary: "这是当前 run 的只读事实索引，只能帮助 Planner 判断是否需要 read_recent；不能作为 visibleTrainingProposal payload 或训练方案生成事实源。",
            refValueBoundary: "facts[].factRef/messageId 只可作为本轮 read_recent.ref.value，不是 final_answer.usedRefs.resource.id。",
          }),
        },
      ];
    }

    return [
      {
        resourceType: visibleTrainingProposalFactResourceType,
        role: "consumable" as const,
        schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
        summary: toJsonValue({
          resourceConsumption: buildReadRecentResourceConsumptionSummary(output),
          sourceReferenceBoundary: "源业务引用已用于导入事实；usedRefs.resource.id 必须使用当前 run 登记的 resourceId，不能使用源业务引用或 messageId。",
          proposalKind: output.fact.proposalKind,
          visibleOutputSchemaVersion: output.fact.visibleOutputSchemaVersion,
          factSchemaVersion: output.fact.factSchemaVersion,
          exerciseItems: output.fact.proposal.exerciseItems.map((item) => ({
            ...item,
            ...output.fact.exerciseDetails.find((exercise) => exercise.exerciseId === item.exerciseId),
          })),
          schedule: output.fact.proposal.schedule,
        }),
      },
    ];
  },
  toModelObservation: (output) => {
    if (output.status === "failed") {
      return toJsonValue({
        status: output.status,
        operation: output.operation,
        code: output.code,
      });
    }

    if (output.operation === "list_recent") {
      return toJsonValue({
        status: output.status,
        operation: output.operation,
        factCount: output.facts.length,
        facts: output.facts,
        indexBoundary: "list_recent 只提供当前会话可引用 visibleTrainingProposal 的轻量索引，不包含完整 payload、prescription、schedule 或未展示候选。",
        factsBoundary: "facts[] 是当前 actor 和当前 conversation 中当前可见、可引用的 visibleTrainingProposal 事实索引集合；facts=[] 只表示当前可见事实中没有这类引用对象。",
        readRecentRefBoundary: "facts[].factRef/messageId 只允许复制到本轮 read_recent.ref.value；不能把它们当作 final_answer.usedRefs.resource.id。",
        emptyFactsBoundary: "空 facts[] 可作为解释缺少引用对象或向用户澄清的事实依据；不能支撑成功训练方案刷新、替换、调整或新训练方案生成。",
        nextStepBoundary: "该结果只提供事实边界；若本轮目标依赖该引用对象，模型应结合本轮用户请求、最近对话和其他 observations/toolResults 自主决定解释缺少引用对象、追问或失败收口。",
        finalAnswerGrounding: "本次事实索引查询 ok=true，可用 usedRefs[] 中的 { type: \"tool_result\", id: 当前 toolResultId } 支撑当前是否有可引用方案的解释或澄清；不能支撑成功训练方案生成。",
        schemaVersionBoundary: "visibleOutputSchemaVersion 是 final_answer.visibleOutputs[].schemaVersion 可参考的字符串版本；factSchemaVersion 是服务端事实存储版本，不要复制到 visibleOutputs[].schemaVersion。",
      });
    }

    const resourceConsumption = buildReadRecentResourceConsumptionSummary(output);

    return toJsonValue({
      status: output.status,
      operation: output.operation,
      sourceReferenceBoundary: "本次读取使用的 factRef/messageId 是源业务引用；它们不是当前 run 登记的 resourceId，不能写入 final_answer.usedRefs.resource.id。",
      currentRunImport: {
          imported: true,
          resourceType: visibleTrainingProposalFactResourceType,
          role: "consumable",
          note: "该 visibleTrainingProposal 事实已导入当前 run，是当前 Planner 可正向消费的训练事实来源；不要重复读取同一引用。",
      },
      resourceConsumption,
      resourceOperationBoundary: "导入事实可以作为 reuse、derive、modify 的正向来源；只有模型基于用户目标判断为 replace、明确排除或避免重复时，才适合把其中 exerciseId 作为 excludeExerciseIds。read_recent 不替 Planner 判断当前请求属于哪类操作，也不默认生成排除列表。",
      refreshPlanningBoundary: "本 tool 只读取上一套用户可见训练方案事实，不生成新的 visibleTrainingProposal，不代表本轮最终训练结构已经完成；需要推送新方案时，最终结构仍必须由 final_answer.visibleOutputs[] 承载。",
      nextActionBoundary: "如果目标仍缺动作事实、section、prescription 或 schedule，Planner 应继续使用合法 action 获取事实、澄清或失败收口。",
      proposalKind: output.fact.proposalKind,
      visibleOutputSchemaVersion: output.fact.visibleOutputSchemaVersion,
      factSchemaVersion: output.fact.factSchemaVersion,
      factSchemaVersionBoundary: "factSchemaVersion 是服务端事实存储版本，不应复制到 final_answer.visibleOutputs[].schemaVersion；visible output envelope 的 schemaVersion 必须写字符串 \"1\"。",
      reusableExerciseItems: toReusableExerciseItems(output),
      trainingExerciseItems: output.fact.proposal.exerciseItems
        .filter((item) => item.section === "training")
        .map((item) => ({
          exerciseId: item.exerciseId,
          section: item.section,
          order: item.order,
          prescription: item.prescription,
        })),
      sectionSummary: resourceConsumption.sectionSummary,
      availableSections: resourceConsumption.availableSections,
      missingSectionsForRoutineOrPlan: resourceConsumption.missingSectionsForRoutineOrPlan,
      supportsOutputKinds: resourceConsumption.supportsOutputKinds,
      schedule: output.fact.proposal.schedule,
      finalAnswerGrounding: "read_recent 成功后可用 usedRefs[] 中的 { type: \"tool_result\", id: 当前 toolResultId } 引用本次 ok=true tool result；若改用 resource 引用，必须使用 { type: \"resource\", id: fulfillment.producedResources[].resourceId, resourceType }，不能使用 factRef、messageId 或历史消息 id。",
      finalAnswerBoundary: "需要继续推送训练方案时，最终事实必须写入 final_answer.visibleOutputs[] 的 visibleTrainingProposal payload，或通过 usedRefs 做 grounded terminal action；不要把正文当训练事实源。",
    });
  },
  toUserProjection: (output) => {
    if (output.status === "failed") {
      return toJsonValue({
        status: output.status,
        operation: output.operation,
        code: output.code,
      });
    }

    if (output.operation === "list_recent") {
      return toJsonValue({
        status: output.status,
        operation: output.operation,
        factCount: output.facts.length,
        facts: output.facts.map((fact) => ({
          factRef: fact.factRef,
          messageId: fact.messageId,
          proposalKind: fact.proposalKind,
          sectionSummary: fact.sectionSummary,
          reusableTrainingExerciseCount: fact.reusableTrainingExerciseCount,
        })),
      });
    }

    return toJsonValue({
      status: output.status,
      operation: output.operation,
      sourceReferenceBoundary: "源业务引用只用于本轮 read_recent 输入和服务端读取，不作为 final_answer.usedRefs.resource.id。",
      proposalKind: output.fact.proposalKind,
      exerciseItemCount: output.fact.proposal.exerciseItems.length,
    });
  },
});

export {
  inspectVisibleTrainingProposalsInputSchema,
  inspectVisibleTrainingProposalsOutputSchema,
};

function toFactIndex(fact: VisibleTrainingProposalFactSummary): VisibleTrainingProposalFactIndex {
  const trainingItems = fact.exerciseItems.filter((item) => item.section === "training");

  return {
    factRef: fact.factRef,
    messageId: fact.messageId,
    kind: fact.kind,
    status: fact.status,
    createdAt: fact.createdAt,
    proposalKind: fact.proposalKind,
    visibleOutputSchemaVersion: visibleTrainingProposalSchemaVersion,
    factSchemaVersion: fact.schemaVersion,
    sectionSummary: summarizeSections(fact.exerciseItems),
    reusableTrainingExerciseCount: trainingItems.length,
    reusableTrainingExercises: trainingItems.map((item) => ({
      exerciseId: item.exerciseId,
      order: item.order,
      section: "training",
      nameZh: item.nameZh,
      nameEn: item.nameEn,
    })),
  };
}

function summarizeSections(items: readonly Pick<VisibleTrainingExerciseItem, "section">[]): SectionSummary {
  return summarizeVisibleTrainingSections(items) satisfies SectionSummary;
}

function buildReadRecentResourceConsumptionSummary(
  output: Extract<InspectVisibleTrainingProposalsOutput, { status: "succeeded"; operation: "read_recent" }>,
) {
  return {
    ...summarizeVisibleTrainingResourceCoverage({
      exerciseItems: output.fact.proposal.exerciseItems,
      hasSchedule: Boolean(output.fact.proposal.schedule),
    }),
    positiveConsumptionBoundary: "这些 exerciseItems 是当前 run 可消费的正向训练事实来源，可用于保留、复用、派生或调整。",
    negativeConstraintBoundary: "只有替换、排除或避免重复目标才适合把这些 exerciseId 转成负向 excludeExerciseIds；不得把已导入动作默认排除。",
    outputBoundary: "supportsOutputKinds 只说明该事实当前可直接支撑的 visibleTrainingProposal 输出强度；最终新输出仍必须由 final_answer.visibleOutputs[] 承载并通过 validator。",
    recoveryBoundary: "如果目标需要 routine 或 plan 但缺少 section，可继续获取缺失 section、输出当前事实可支撑结构、澄清或失败收口；本 observation 不规定固定 tool 调用顺序。",
  };
}

function toReusableExerciseItems(
  output: Extract<InspectVisibleTrainingProposalsOutput, { status: "succeeded"; operation: "read_recent" }>,
) {
  return output.fact.proposal.exerciseItems.map((item) => {
    const detail = output.fact.exerciseDetails.find((exercise) => exercise.exerciseId === item.exerciseId);

    return {
      exerciseId: item.exerciseId,
      section: item.section,
      order: item.order,
      nameZh: detail?.nameZh,
      nameEn: detail?.nameEn,
      equipmentZh: detail?.equipmentZh,
      primaryMusclesZh: detail?.primaryMusclesZh ?? [],
      allowedSections: detail?.allowedSections ?? [],
    };
  });
}

function isReferenceVisibleInCurrentRun(input: ReadRecentInput, context: ToolHandlerContext) {
  return isReferenceListedInDiagnosticResources(input, context);
}

function isReferenceListedInDiagnosticResources(input: ReadRecentInput, context: ToolHandlerContext) {
  const resources = context.resources?.list({
    resourceType: visibleTrainingProposalFactIndexResourceType,
    role: "diagnostic",
  }) ?? [];

  return resources.some((resource) => {
    const parsed = z.object({
      facts: z.array(visibleTrainingProposalReferenceSchema),
    }).passthrough().safeParse(resource.summary);

    return parsed.success && parsed.data.facts.some((fact) => referenceMatches(input, fact));
  });
}

function referenceMatches(input: ReadRecentInput, reference: z.infer<typeof visibleTrainingProposalReferenceSchema>) {
  if (input.ref.type === "fact_ref") {
    return reference.factRef === input.ref.value;
  }

  return reference.messageId === input.ref.value;
}
