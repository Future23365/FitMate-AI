import "server-only";

import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  visibleTrainingProposalFactKind,
  visibleTrainingProposalFactSchemaVersion,
  visibleTrainingExerciseItemSchema,
  visibleTrainingProposalSchemaVersion,
  visibleTrainingScheduleSchema,
  type VisibleTrainingExerciseItem,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";
import {
  listRecentVisibleTrainingProposalSummaries,
  type VisibleTrainingProposalFactSummary,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import {
  summarizeVisibleTrainingResourceCoverage,
  summarizeVisibleTrainingSections,
} from "@/lib/server/visible-training-proposals/visible-training-resource-coverage";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

import { defineLangChainToolWrapper } from "../tool-wrapper";
import { toLangChainJsonValue } from "../utils";

const listRecentInputSchema = z.object({
  operation: z.literal("list_recent").describe("查询并导入当前 actor 和当前 conversation 可访问的最近 visibleTrainingProposal 业务事实；不需要内部引用字段。"),
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

/** inspectVisibleTrainingProposalsInputSchema 只允许模型读取最近已展示训练方案事实索引，不接受内部引用字段。 */
export const inspectVisibleTrainingProposalsInputSchema = listRecentInputSchema;

/** inspectVisibleTrainingProposalsOutputSchema 校验导入历史 visibleTrainingProposal 事实的压缩投影。 */
export const inspectVisibleTrainingProposalsOutputSchema = z.union([
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

type InspectVisibleTrainingProposalsOutput = z.infer<typeof inspectVisibleTrainingProposalsOutputSchema>;
type VisibleTrainingProposalBusinessFact = z.infer<typeof visibleTrainingProposalBusinessFactSchema>;

const factStoreListFailedCode = "fact_store_list_failed";

/** inspectVisibleTrainingProposalsLangChainTool 是当前会话 visibleTrainingProposal 事实的只读导入入口，不做语义分流。 */
export const inspectVisibleTrainingProposalsLangChainTool = defineLangChainToolWrapper<
  typeof inspectVisibleTrainingProposalsInputSchema,
  InspectVisibleTrainingProposalsOutput
>({
  name: "inspectVisibleTrainingProposals",
  description: [
    "只读查询并导入当前会话中用户已经看到的 visibleTrainingProposal 业务事实。",
    "operation = \"list_recent\" 返回受控压缩事实，可供模型复用、派生、保留、替换或调整；历史 routine fact 中的 exerciseItems、section 和 prescription 可以作为后续 routine 或 plan 的受控事实来源。",
    "不要传入内部引用、分页、limit、cursor、userId 或 conversationId；该 tool 只读取当前会话范围内的可见事实。",
    "本 tool 只读取历史事实，不生成最终新训练方案，不决定下一步 tool；最终新结构仍必须通过服务端 validator。",
  ].join("\n"),
  inputSchema: inspectVisibleTrainingProposalsInputSchema,
  outputSchema: inspectVisibleTrainingProposalsOutputSchema,
  runtimeActivity: {
    defaultSummary: "正在读取已有训练方案",
  },
  timeoutMs: agentRuntimeConfig.tools.inspectVisibleTrainingProposals.timeoutMs,
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
        conversationId: context.actor.conversationId,
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
  toModelVisibleSummary: (output) => {
    if (output.status === "failed") {
      return toLangChainJsonValue({
        status: output.status,
        operation: output.operation,
        factLevel: "diagnostic",
        code: output.code,
      });
    }

    const coverage = summarizeBusinessFactsCoverage(output.facts);

    return toLangChainJsonValue({
      status: output.status,
      operation: output.operation,
      factLevel: "visible_training_facts",
      currentRunImport: {
        imported: output.facts.length > 0,
        note: output.facts.length > 0
          ? "facts[] 是当前 run 可复用的历史训练方案业务事实来源。"
          : "facts[] 为空，只表示当前可见事实中没有历史 visibleTrainingProposal，可作为解释缺少引用对象、澄清或继续推理的事实依据。",
      },
      factCount: output.facts.length,
      facts: output.facts,
      derivationFacts: summarizeDerivationFacts(output.facts),
      sectionSummary: coverage.sectionSummary,
      availableSections: coverage.availableSections,
      missingSections: coverage.missingSections,
      hasSchedule: coverage.hasSchedule,
      outputBoundary: "该 tool 只读取和导入历史业务事实；不会生成新的训练卡片、routine、plan 或保存结果。",
      usageBoundary: "后续如何使用这些历史事实，由模型结合本轮用户目标和当前可见事实自行判断。",
    });
  },
  toUserProjection: (output) => {
    if (output.status === "failed") {
      return toLangChainJsonValue({
        status: output.status,
        operation: output.operation,
        code: output.code,
      });
    }

    return toLangChainJsonValue({
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
  toTraceSummary: (output) => {
    if (output.status === "failed") {
      return toLangChainJsonValue({
        status: output.status,
        operation: output.operation,
        code: output.code,
      });
    }

    return toLangChainJsonValue({
      status: output.status,
      operation: output.operation,
      factCount: output.facts.length,
      facts: output.facts.map((fact) => ({
        index: fact.index,
        proposalKind: fact.proposalKind,
        sectionSummary: fact.sectionSummary,
      })),
    });
  },
});

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

// summarizeDerivationFacts 只描述历史事实的可复用字段和派生缺口，不提供固定 workflow 或交付就绪判断。
function summarizeDerivationFacts(facts: readonly VisibleTrainingProposalBusinessFact[]) {
  return facts.map((fact) => ({
    index: fact.index,
    proposalKind: fact.proposalKind,
    reusableFields: summarizeReusableFields(fact),
    missingForPlan: summarizeMissingFieldsForPlan(fact),
    boundary: "仅表达该历史事实中已有和缺失的结构字段；是否派生成新结构由模型结合本轮用户目标、当前可见事实和 validator 边界判断。",
  }));
}

function summarizeReusableFields(fact: VisibleTrainingProposalBusinessFact) {
  const fields = ["exerciseItems"];

  if (fact.exerciseItems.some((item) => Boolean(item.section))) {
    fields.push("section");
  }

  if (fact.exerciseItems.some((item) => Boolean(item.prescription))) {
    fields.push("prescription");
  }

  if (fact.schedule) {
    fields.push("schedule");
  }

  return fields;
}

function summarizeMissingFieldsForPlan(fact: VisibleTrainingProposalBusinessFact) {
  const missingFields: string[] = [];

  if (fact.exerciseItems.length === 0) {
    missingFields.push("exerciseItems");
  }

  if (!fact.exerciseItems.some((item) => item.section === "training")) {
    missingFields.push("training section");
  }

  if (fact.exerciseItems.some((item) => !item.prescription)) {
    missingFields.push("prescription");
  }

  if (!fact.schedule) {
    missingFields.push("schedule");
  }

  return missingFields;
}

function summarizeSections(items: readonly Pick<VisibleTrainingExerciseItem, "section">[]): SectionSummary {
  return summarizeVisibleTrainingSections(items) satisfies SectionSummary;
}
