import { z } from "zod";

import type { JsonValue, ToolHandlerContext } from "@/lib/server/agent-core/contracts";
import { defineTool } from "@/lib/server/agent-core/define-tool";
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
  listRecentVisibleTrainingProposalSummaries,
  readVisibleTrainingProposalFact,
  toJsonValue,
  type VisibleTrainingProposalFactSummary,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const factRefSchema = z.string().trim().min(1).max(160);
const recentFactListLimit = 3;

const listRecentInputSchema = z.object({
  operation: z.literal("list_recent").describe("查询当前 actor 和当前 conversation 可访问的最近 visibleTrainingProposal 轻量事实索引；不需要 factRef 或 messageId。"),
}).strict();

const readRecentInputSchema = z.object({
  operation: z.literal("read_recent").describe("读取 list_recent 或当前受控上下文中真实出现的可见训练方案事实，并导入当前 run。"),
  factRef: factRefSchema.optional().describe("只能从 list_recent result、diagnostic index resource 或当前 run metadata.recentVisibleTrainingProposals 中真实出现的 factRef 复制；没有真实值时不要编造。"),
  messageId: factRefSchema.optional().describe("只能从 list_recent result、diagnostic index resource 或当前 run metadata.recentVisibleTrainingProposals 中真实出现的上一轮 assistant messageId 复制；仅在缺少 factRef 时使用。"),
}).strict();

const inspectVisibleTrainingProposalsInputSchema = z.discriminatedUnion("operation", [
  listRecentInputSchema,
  readRecentInputSchema,
]).superRefine((input, ctx) => {
  if (input.operation !== "read_recent") {
    return;
  }

  if (!input.factRef && !input.messageId) {
    ctx.addIssue({
      code: "custom",
      message: "operation = \"read_recent\" 时必须提供 factRef 或 messageId。",
      path: ["factRef"],
    });
  }
});

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
  version: "0.2.0",
  description: "只读查询当前会话中用户已经看到的 visibleTrainingProposal 事实。operation = \"list_recent\" 返回最近事实索引；operation = \"read_recent\" 读取具体事实并导入当前 run。",
  whenToUse: [
    "当 Planner 需要确认当前 actor 和 conversation 是否存在可引用的用户可见训练方案事实时，先调用 operation = \"list_recent\"。",
    "list_recent 只返回 factRef、messageId、proposalKind、section 摘要、可复用 training 动作数量、visibleOutputSchemaVersion 和 factSchemaVersion；它不导入完整 payload，也不产出 consumable 训练方案事实。",
    "当 Planner 已经从 list_recent result、diagnostic index resource 或当前受控 metadata 中看到真实 factRef/messageId，并且需要复用具体方案时，再调用 operation = \"read_recent\"。",
    "read_recent 成功后会把 visible_training_proposal_fact 作为当前 run 的 consumable resource 导入；后续应基于该结果继续规划，不要重复读取同一引用。",
    "省略表达、指代不明或上下文引用场景由模型基于上下文、list_recent result 和 read_recent result 自主判断下一步，可以读取事实、查询动作库、澄清或普通回复。",
  ].join(" "),
  whenNotToUse: [
    "不要把任意固定自然语言短语写成必须调用本 tool 的条件；服务端不会根据用户原文替模型选择 operation。",
    "不要用本 tool 查询动作库、生成 visibleTrainingProposal、保存 artifact、写用户记忆、执行候选集合或跨 conversation 引用。",
    "不要在 operation = \"list_recent\" 时传入 factRef、messageId、分页、limit、cursor、userId 或 conversationId；服务端固定最近数量并从 actor 推导权限边界。",
    "不要在 operation = \"read_recent\" 时编造 factRef/messageId；失败结果不能支撑成功训练方案生成。",
    "factSchemaVersion 是服务端事实存储版本，不应复制到 final_answer.visibleOutputs[].schemaVersion；visible output envelope 的 schemaVersion 必须写字符串 \"1\"。",
  ].join(" "),
  inputSchema: inspectVisibleTrainingProposalsInputSchema,
  outputSchema: inspectVisibleTrainingProposalsOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 1_000,
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
      description: "先查询当前会话最近是否有可引用的 visibleTrainingProposal 事实索引。",
      input: { operation: "list_recent" },
    },
    {
      description: "当 list_recent result 已经返回真实 factRef 或 messageId 后，补入该真实引用读取并导入具体事实；本示例不提供可复制引用值。",
      input: { operation: "read_recent" },
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
          limit: recentFactListLimit,
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
        factRef: input.factRef,
        messageId: input.messageId,
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
          factRef: output.fact.factRef,
          messageId: output.fact.messageId,
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
        finalAnswerGrounding: "本次事实索引查询若 fulfillment.satisfied=true，可用 usedToolResultIds 支撑“当前是否有可引用方案”的解释或澄清；不能支撑成功训练方案生成。",
        schemaVersionBoundary: "visibleOutputSchemaVersion 是 final_answer.visibleOutputs[].schemaVersion 可参考的字符串版本；factSchemaVersion 是服务端事实存储版本，不要复制到 visibleOutputs[].schemaVersion。",
      });
    }

    return toJsonValue({
      status: output.status,
      operation: output.operation,
      factRef: output.fact.factRef,
      messageId: output.fact.messageId,
      currentRunImport: {
        imported: true,
        resourceType: visibleTrainingProposalFactResourceType,
        note: "该 visibleTrainingProposal 事实已导入当前 run，不要重复读取同一引用。",
      },
      proposalKind: output.fact.proposalKind,
      visibleOutputSchemaVersion: output.fact.visibleOutputSchemaVersion,
      factSchemaVersion: output.fact.factSchemaVersion,
      factSchemaVersionBoundary: "factSchemaVersion 是服务端事实存储版本，不应复制到 final_answer.visibleOutputs[].schemaVersion；visible output envelope 的 schemaVersion 必须写字符串 \"1\"。",
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
      factRef: output.fact.factRef,
      messageId: output.fact.messageId,
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
  return {
    warmup: items.filter((item) => item.section === "warmup").length,
    training: items.filter((item) => item.section === "training").length,
    stretch: items.filter((item) => item.section === "stretch").length,
  } satisfies SectionSummary;
}

function isReferenceVisibleInCurrentRun(input: ReadRecentInput, context: ToolHandlerContext) {
  return isReferenceListedInRunMetadata(input, context.metadata)
    || isReferenceListedInDiagnosticResources(input, context);
}

function isReferenceListedInRunMetadata(
  input: ReadRecentInput,
  metadata: Record<string, JsonValue> | undefined,
) {
  const recentFacts = metadata?.recentVisibleTrainingProposals;
  if (!Array.isArray(recentFacts)) {
    return false;
  }

  return recentFacts.some((fact) => {
    const parsed = visibleTrainingProposalReferenceSchema.safeParse(fact);
    return parsed.success && referenceMatches(input, parsed.data);
  });
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
  if (input.factRef && reference.factRef !== input.factRef) {
    return false;
  }
  if (input.messageId && reference.messageId !== input.messageId) {
    return false;
  }
  return true;
}
