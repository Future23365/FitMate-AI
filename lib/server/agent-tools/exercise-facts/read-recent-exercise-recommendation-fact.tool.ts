import { z } from "zod";

import type { JsonValue } from "@/lib/server/agent-core/contracts";
import { defineTool } from "@/lib/server/agent-core/define-tool";
import {
  exerciseRecommendationFactKind,
  exerciseRecommendationFactResourceType,
  exerciseRecommendationFactSchemaVersion,
  readExerciseRecommendationFact,
} from "@/lib/server/exercise-recommendation-facts/exercise-recommendation-fact-store";

const factRefSchema = z.string().trim().min(1).max(160);

const readRecentExerciseRecommendationFactInputSchema = z.object({
  factRef: factRefSchema.optional().describe("只能从当前 run metadata.recentExerciseRecommendationFacts 中真实出现的 factRef 复制；没有真实值时不要编造。"),
  messageId: factRefSchema.optional().describe("只能从当前 run metadata.recentExerciseRecommendationFacts 中真实出现的上一轮 assistant messageId 复制；仅在缺少 factRef 时使用。"),
}).strict().refine((input) => Boolean(input.factRef || input.messageId), {
  message: "必须提供 factRef 或 messageId。",
});

const displayedExerciseSummarySchema = z.object({
  id: z.string(),
  nameZh: z.string(),
  nameEn: z.string(),
  equipmentZh: z.string().nullable().optional(),
  primaryMusclesZh: z.array(z.string()),
  allowedSections: z.array(z.string()),
  imageUrl: z.string().nullable().optional(),
}).strict();

const appliedFilterSchema = z.object({
  field: z.string(),
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
}).strict();

const querySummarySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  suitability: z.string().optional(),
  level: z.string().optional(),
  force: z.string().optional(),
  mechanic: z.string().optional(),
  equipment: z.string().optional(),
  homeRequirement: z.string().optional(),
  muscle: z.string().optional(),
  bodyRegions: z.array(z.string()).optional(),
  expandedMuscles: z.array(z.string()),
  goalTag: z.string().optional(),
  riskTag: z.string().optional(),
  excludeExerciseIds: z.array(z.string()).optional(),
  published: z.literal(true),
  sort: z.string(),
  appliedFilters: z.array(appliedFilterSchema),
  totalMatches: z.number().int().min(0),
  returnedCount: z.number().int().min(0),
  maxReturned: z.number().int().min(1),
  truncated: z.boolean(),
  excludedCount: z.number().int().min(0),
}).strict();

const readRecentExerciseRecommendationFactOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("succeeded"),
    fact: z.object({
      factRef: z.string(),
      messageId: z.string(),
      kind: z.literal(exerciseRecommendationFactKind),
      status: z.literal("active"),
      schemaVersion: z.literal(exerciseRecommendationFactSchemaVersion),
      createdAt: z.string(),
      displayedCount: z.number().int().min(0),
      displayedExerciseIds: z.array(z.string()),
      displayedExercises: z.array(displayedExerciseSummarySchema),
      query: querySummarySchema,
    }).strict(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    code: z.string(),
    message: z.string(),
  }).strict(),
]);

type ReadRecentExerciseRecommendationFactInput = z.infer<typeof readRecentExerciseRecommendationFactInputSchema>;
type ReadRecentExerciseRecommendationFactOutput = z.infer<typeof readRecentExerciseRecommendationFactOutputSchema>;

const factStoreReadFailedCode = "fact_store_read_failed";

/** readRecentExerciseRecommendationFactTool 把历史用户投影动作事实安全引入当前 Agent run。 */
export const readRecentExerciseRecommendationFactTool = defineTool<
  ReadRecentExerciseRecommendationFactInput,
  ReadRecentExerciseRecommendationFactOutput
>({
  name: "readRecentExerciseRecommendationFact",
  version: "0.1.0",
  description: "读取并引入当前 run metadata 中真实存在的上一轮用户可见动作推荐事实。成功结果只表示该 fact 已导入当前 run，可用于后续排除上一轮已展示动作或解释刷新边界。",
  whenToUse: [
    "只有当 Planner 判断当前目标确实需要复用 run metadata.recentExerciseRecommendationFacts 中的真实上一轮动作事实时，才考虑使用。",
    "必须从 run metadata.recentExerciseRecommendationFacts 精确复制 factRef/messageId；不要编造、猜测或复用 example 占位值。",
    "成功读取后，如果后续需要查询新动作，应把 displayedExerciseIds 作为 searchExerciseResources.excludeExerciseIds；也可以基于已有成功结果输出合法 final_answer 或 ask_user。",
    "该 tool 只读取当前 actor 和当前 conversation 的事实，并把该事实作为 consumable resource 引入当前 run。",
  ].join(" "),
  whenNotToUse: [
    "当 run metadata.recentExerciseRecommendationFacts 为空或不存在匹配的 factRef/messageId 时不要使用；应根据用户请求选择 final_answer、ask_user 或其他可见 tool。",
    "如果当前 run 的 observations 或 toolResults 已经成功读取并导入同一个 factRef/messageId，不要再次调用本 tool；应基于既有 toolResultId、displayedExerciseIds 或改变后的合法 tool input 继续。",
    "不要用它做语义路由、保存新事实、查询动作库、生成 routine 或 plan、读写用户记忆，或跨 conversation 引用。",
    "不要传入 userId 或 conversationId；服务端会从当前 actor 推导二者，并拒绝不可访问事实。",
    "失败结果不能支撑成功 final_answer，只能用于解释无法读取或向用户澄清。",
  ].join(" "),
  inputSchema: readRecentExerciseRecommendationFactInputSchema,
  outputSchema: readRecentExerciseRecommendationFactOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 1_000,
  },
  resourceContract: {
    produces: [
      {
        resourceType: exerciseRecommendationFactResourceType,
        role: "consumable",
        schemaVersion: String(exerciseRecommendationFactSchemaVersion),
      },
    ],
  },
  examples: [
    {
      description: "Planner 判断需要复用上一轮用户可见动作事实时，读取从 run metadata.recentExerciseRecommendationFacts 复制的真实 factRef。",
      input: { factRef: "fact_recent_01" },
    },
  ],
  handler: async (input, context) => {
    let result: Awaited<ReturnType<typeof readExerciseRecommendationFact>>;

    try {
      result = await readExerciseRecommendationFact({
        userId: context.actor.userId,
        conversationId: context.actor.sessionId,
        factRef: input.factRef,
        messageId: input.messageId,
      });
    } catch {
      return {
        status: "failed",
        code: factStoreReadFailedCode,
        message: "动作推荐事实存储读取失败。",
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
        displayedCount: result.fact.displayedCount,
        displayedExerciseIds: result.fact.displayedExerciseIds,
        displayedExercises: result.fact.displayedExercises,
        query: result.fact.query,
      },
    };
  },
  toFulfillment: (output) => output.status === "succeeded"
    ? {
        satisfied: true,
        summary: `已读取上一轮用户可见动作事实，包含 ${output.fact.displayedExerciseIds.length} 个已展示动作。`,
      }
    : {
        satisfied: false,
        summary: `读取上一轮用户可见动作事实失败：${output.code}。`,
      },
  toResources: (output) => output.status === "succeeded"
    ? [
        {
          resourceType: exerciseRecommendationFactResourceType,
          role: "consumable" as const,
          schemaVersion: String(exerciseRecommendationFactSchemaVersion),
          summary: {
            factRef: output.fact.factRef,
            messageId: output.fact.messageId,
            displayedCount: output.fact.displayedCount,
            displayedExerciseIds: output.fact.displayedExerciseIds,
            appliedFilters: output.fact.query.appliedFilters,
          },
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
          note: "该动作推荐事实已成功导入当前 run；后续不要再次调用同一 factRef/messageId 的 read/import tool。",
          nextSteps: [
            "需要新动作时，将 displayedExerciseIds 作为 searchExerciseResources.excludeExerciseIds。",
            "已有结果足够回答时，使用当前 observation 的 toolResultId 输出 final_answer 或 ask_user。",
            "需要不同事实时，只能提交改变后的合法 tool input。",
          ],
        },
        displayedExerciseIds: output.fact.displayedExerciseIds,
        filterSummary: {
          category: output.fact.query.category,
          suitability: output.fact.query.suitability,
          level: output.fact.query.level,
          force: output.fact.query.force,
          mechanic: output.fact.query.mechanic,
          equipment: output.fact.query.equipment,
          homeRequirement: output.fact.query.homeRequirement,
          muscle: output.fact.query.muscle,
          bodyRegions: output.fact.query.bodyRegions,
          expandedMuscles: output.fact.query.expandedMuscles,
          goalTag: output.fact.query.goalTag,
          riskTag: output.fact.query.riskTag,
          published: output.fact.query.published,
          sort: output.fact.query.sort,
          appliedFilters: output.fact.query.appliedFilters,
        },
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
        displayedCount: output.fact.displayedCount,
      })
    : toJsonValue({
        status: output.status,
        code: output.code,
      }),
});

export {
  readRecentExerciseRecommendationFactInputSchema,
  readRecentExerciseRecommendationFactOutputSchema,
};

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
