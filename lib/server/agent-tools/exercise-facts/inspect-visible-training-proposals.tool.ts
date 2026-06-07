import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { agentRuntimeConfig } from "@/lib/server/config";
import {
  visibleTrainingProposalFactKind,
  visibleTrainingProposalFactResourceType,
  visibleTrainingProposalFactSchemaVersion,
  visibleTrainingExerciseItemSchema,
  visibleTrainingScheduleSchema,
  visibleTrainingProposalSchemaVersion,
  type VisibleTrainingExerciseItem,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";
import {
  summarizeVisibleTrainingResourceCoverage,
  summarizeVisibleTrainingSections,
} from "@/lib/server/visible-training-proposals/visible-training-resource-coverage";
import {
  listRecentVisibleTrainingProposalSummaries,
  toJsonValue,
  type VisibleTrainingProposalFactSummary,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const listRecentInputSchema = z.object({
  operation: z.literal("list_recent").describe("查询并导入当前 actor 和当前 conversation 可访问的最近 visibleTrainingProposal 业务事实；不需要内部引用字段。"),
}).strict();

const inspectVisibleTrainingProposalsInputSchema = listRecentInputSchema;

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

const visibleTrainingProposalBusinessFactSchema = z.object({
  index: z.number().int().min(1),
  displayLabel: z.string(),
  kind: z.literal(visibleTrainingProposalFactKind),
  status: z.literal("active"),
  createdAt: z.string(),
  proposalKind: z.enum(["exercise_selection", "routine", "plan"]),
  visibleOutputSchemaVersion: z.literal(visibleTrainingProposalSchemaVersion),
  factSchemaVersion: z.literal(visibleTrainingProposalFactSchemaVersion),
  sectionSummary: sectionSummarySchema,
  exerciseItems: z.array(visibleTrainingExerciseItemSchema.extend({
    nameZh: z.string().optional(),
    nameEn: z.string().optional(),
    equipmentZh: z.string().nullable().optional(),
    primaryMusclesZh: z.array(z.string()).default([]),
    allowedSections: z.array(exerciseAllowedSectionSchema).default([]),
    imageUrl: z.string().nullable().optional(),
  }).strict()),
  schedule: visibleTrainingScheduleSchema.optional(),
  reusableTrainingExerciseCount: z.number().int().min(0),
  reusableTrainingExercises: z.array(reusableTrainingExerciseSchema),
}).strict();

const inspectVisibleTrainingProposalsOutputSchema = z.union([
  z.object({
    status: z.literal("succeeded"),
    operation: z.literal("list_recent"),
    facts: z.array(visibleTrainingProposalBusinessFactSchema),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    operation: z.literal("list_recent"),
    code: z.string(),
    message: z.string(),
  }).strict(),
]);

type InspectVisibleTrainingProposalsInput = z.infer<typeof inspectVisibleTrainingProposalsInputSchema>;
type InspectVisibleTrainingProposalsOutput = z.infer<typeof inspectVisibleTrainingProposalsOutputSchema>;
type VisibleTrainingProposalBusinessFact = z.infer<typeof visibleTrainingProposalBusinessFactSchema>;

const factStoreListFailedCode = "fact_store_list_failed";

/** inspectVisibleTrainingProposalsTool 是当前会话可见训练方案事实的只读 inspect 入口，不做自然语言语义分流。 */
export const inspectVisibleTrainingProposalsTool = defineTool<
  InspectVisibleTrainingProposalsInput,
  InspectVisibleTrainingProposalsOutput
>({
  name: "inspectVisibleTrainingProposals",
  version: "0.7.0",
  description: "只读查询并导入当前会话中用户已经看到的 visibleTrainingProposal 业务事实。operation = \"list_recent\" 会由服务端读取、校验并返回受控压缩事实，可供 Planner 复用、派生、保留、替换或调整。",
  whenToUse: [
    "当本轮目标需要了解当前会话上一套用户已见 visibleTrainingProposal 的 exerciseItems、section 摘要、处方或计划结构时使用。",
    "读取成功后，facts[] 是当前 actor 和 conversation 可访问的历史训练方案业务事实，并会作为后续可用于本轮推理的事实由服务端内部登记。",
    "该 tool 只读取历史事实，不生成最终新训练方案；最终新结构仍必须由合法 final_answer.visibleOutputs[] 承载并通过 validator。",
  ].join(" "),
  whenNotToUse: [
    "不要用本 tool 查询动作库、读取其他 conversation 的方案或跨用户引用历史事实。",
    "不要传入内部引用、分页、limit、cursor、userId 或 conversationId；服务端固定读取范围并从 actor 推导权限边界。",
    "不要把本 tool 当作动作库搜索、训练方案生成、保存或渲染工具；它只提供历史已展示方案事实。",
    "不要把空 facts[] 伪装成已导入历史方案；空结果只能说明当前可见事实中没有这类历史训练方案对象。",
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
        resourceType: visibleTrainingProposalFactResourceType,
        role: "consumable",
        schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
        required: false,
      },
    ],
  },
  examples: [
    {
      description: "查询并导入当前会话最近已展示的 visibleTrainingProposal 业务事实。",
      action: {
        type: "tool_call",
        toolName: "inspectVisibleTrainingProposals",
        input: { operation: "list_recent" },
      },
    },
  ],
  handler: async (input, context) => {
    if (!context.actor.userId) {
      return {
        status: "failed",
        operation: "list_recent",
        code: "actor_missing",
        message: "当前 actor 缺少 userId，无法查询可见训练方案事实。",
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
        operation: input.operation,
        facts: facts.map(toBusinessFact),
      };
    } catch {
      return {
        status: "failed",
        operation: "list_recent",
        code: factStoreListFailedCode,
        message: "可见训练方案事实读取失败。",
      };
    }
  },
  toFulfillment: (output) => {
    if (output.status === "failed") {
        return {
          satisfied: false,
          summary: `查询可见训练方案事实失败：${output.code}。`,
        };
      }

      return {
        satisfied: true,
        summary: `已查询并导入当前会话最近可见训练方案业务事实，返回 ${output.facts.length} 条。`,
      };
  },
  toResources: (output) => {
    if (output.status !== "succeeded" || output.facts.length === 0) {
      return [];
    }

    return [
      {
        resourceType: visibleTrainingProposalFactResourceType,
        role: "consumable" as const,
        schemaVersion: String(visibleTrainingProposalFactSchemaVersion),
        summary: toJsonValue({
          operation: output.operation,
          factCount: output.facts.length,
          facts: output.facts,
          boundary: "这些 facts 是当前 run 已由服务端读取和校验的历史 visibleTrainingProposal 业务事实，可用于复用、派生、保留、替换或调整；内部来源引用不进入模型 action。",
        }),
      },
    ];
  },
  toModelObservation: (output) => {
    if (output.status === "failed") {
      return toJsonValue({
        status: output.status,
        operation: output.operation,
        factLevel: "diagnostic",
        fulfillment: {
          satisfied: false,
        },
        code: output.code,
      });
    }

    const coverage = summarizeBusinessFactsCoverage(output.facts);

    return toJsonValue({
      status: output.status,
      operation: output.operation,
      factLevel: output.facts.length > 0 ? "consumable" : "diagnostic",
      fulfillment: {
        satisfied: true,
      },
      currentRunImport: {
        imported: output.facts.length > 0,
        note: output.facts.length > 0
          ? "facts[] 已由服务端读取和校验，可作为当前 run 的历史训练方案业务事实来源。"
          : "facts[] 为空，只表示当前可见事实中没有历史 visibleTrainingProposal，不能支撑历史方案复用、替换或调整。",
      },
      factCount: output.facts.length,
      facts: output.facts,
      sectionSummary: coverage.sectionSummary,
      availableSections: coverage.availableSections,
      missingSections: coverage.missingSections,
      hasSchedule: coverage.hasSchedule,
      outputBoundary: "该 tool 只读取和导入历史业务事实；最终新训练结构仍必须写入 final_answer.visibleOutputs[] 并通过 visibleTrainingProposal validator。",
      decisionBoundary: "是否复用、派生、保留、替换、继续查询、追问或失败收口，由 Planner 结合本轮用户目标和当前事实自行决定。",
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

    return toJsonValue({
      status: output.status,
      operation: output.operation,
      factCount: output.facts.length,
      facts: output.facts.map((fact) => ({
        index: fact.index,
        displayLabel: fact.displayLabel,
        proposalKind: fact.proposalKind,
        sectionSummary: fact.sectionSummary,
        reusableTrainingExerciseCount: fact.reusableTrainingExerciseCount,
      })),
    });
  },
});

export {
  inspectVisibleTrainingProposalsInputSchema,
  inspectVisibleTrainingProposalsOutputSchema,
};

function toBusinessFact(fact: VisibleTrainingProposalFactSummary, index: number): VisibleTrainingProposalBusinessFact {
  const trainingItems = fact.exerciseItems.filter((item) => item.section === "training");

  return {
    index: index + 1,
    displayLabel: `最近第 ${index + 1} 条已展示训练方案`,
    kind: fact.kind,
    status: fact.status,
    createdAt: fact.createdAt,
    proposalKind: fact.proposalKind,
    visibleOutputSchemaVersion: visibleTrainingProposalSchemaVersion,
    factSchemaVersion: fact.schemaVersion,
    sectionSummary: summarizeSections(fact.exerciseItems),
    exerciseItems: fact.exerciseItems.map(toCompressedExerciseItem),
    schedule: fact.schedule,
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

function toCompressedExerciseItem(item: VisibleTrainingProposalFactSummary["exerciseItems"][number]) {
  return {
    exerciseId: item.exerciseId,
    section: item.section,
    order: item.order,
    prescription: item.prescription,
    nameZh: item.nameZh,
    nameEn: item.nameEn,
    equipmentZh: item.equipmentZh,
    primaryMusclesZh: item.primaryMusclesZh ?? [],
    allowedSections: item.allowedSections ?? [],
    imageUrl: item.imageUrl,
  };
}

function summarizeBusinessFactsCoverage(facts: readonly VisibleTrainingProposalBusinessFact[]) {
  const coverage = summarizeVisibleTrainingResourceCoverage({
    exerciseItems: facts.flatMap((fact) => fact.exerciseItems),
  });

  return {
    ...coverage,
    hasSchedule: facts.some((fact) => Boolean(fact.schedule)),
  };
}

function summarizeSections(items: readonly Pick<VisibleTrainingExerciseItem, "section">[]): SectionSummary {
  return summarizeVisibleTrainingSections(items) satisfies SectionSummary;
}
