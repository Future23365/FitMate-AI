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
  factRef: factRefSchema.optional().describe("从当前上下文 recentExerciseRecommendationFacts 看到的 factRef。"),
  messageId: factRefSchema.optional().describe("上一轮 assistant 响应消息 id；仅在缺少 factRef 时使用。"),
}).strict().refine((input) => Boolean(input.factRef || input.messageId), {
  message: "factRef or messageId is required.",
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

/** readRecentExerciseRecommendationFactTool 把历史用户投影动作事实安全引入当前 Agent run。 */
export const readRecentExerciseRecommendationFactTool = defineTool<
  ReadRecentExerciseRecommendationFactInput,
  ReadRecentExerciseRecommendationFactOutput
>({
  name: "readRecentExerciseRecommendationFact",
  version: "0.1.0",
  description: "Read/import a recent exercise recommendation fact that was previously projected to the current user in this conversation. The successful result can be used in the current run to avoid repeating displayed exercise ids.",
  whenToUse: [
    "Use when recentExerciseRecommendationFacts in run metadata contains a relevant factRef or messageId and the user asks for another batch, a refresh, or no repeated exercises.",
    "After a successful read, use fact.displayedExerciseIds as searchExerciseResources.excludeExerciseIds when querying another batch under the same structured filters.",
    "This tool only reads facts for the current actor and current conversation; it also imports the fact into the current run as a consumable resource.",
  ].join(" "),
  whenNotToUse: [
    "Do not use for semantic routing, saving new facts, querying the exercise library, generating routines or plans, user memory, or cross-conversation references.",
    "Do not pass a userId or conversationId; the server derives both from the current actor and rejects inaccessible facts.",
    "Failed results cannot support a successful final_answer and should only be used to explain inability or ask for clarification.",
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
      description: "Read the fact reference restored into recentExerciseRecommendationFacts before refreshing exercise results.",
      input: { factRef: "cbf_previous_response" },
    },
  ],
  handler: async (input, context) => {
    const result = await readExerciseRecommendationFact({
      userId: context.actor.userId,
      conversationId: context.actor.sessionId,
      factRef: input.factRef,
      messageId: input.messageId,
    });

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
        displayedExerciseIds: output.fact.displayedExerciseIds,
        displayedExercises: output.fact.displayedExercises,
        query: output.fact.query,
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
