import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";

import type { AgentStreamEvent, JsonValue } from "@/lib/server/agent-core/contracts";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";

export const exerciseRecommendationFactKind = "exercise_recommendation_displayed";
export const exerciseRecommendationFactResourceType = "exercise_recommendation_fact";
export const exerciseRecommendationFactSchemaVersion = 1;

const activeFactStatus = "active";

const appliedFilterSchema = z.object({
  field: z.string().trim().min(1),
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
  expandedMuscles: z.array(z.string()).default([]),
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
  excludedCount: z.number().int().min(0).default(0),
}).strict();

const displayedExerciseSummarySchema = z.object({
  id: z.string().trim().min(1),
  nameZh: z.string(),
  nameEn: z.string(),
  equipmentZh: z.string().nullable().optional(),
  primaryMusclesZh: z.array(z.string()).default([]),
  allowedSections: z.array(z.string()).default([]),
  imageUrl: z.string().nullable().optional(),
}).strict();

const searchExerciseResourcesUserProjectionSchema = z.object({
  status: z.literal("succeeded"),
  totalMatches: z.number().int().min(0),
  returnedCount: z.number().int().min(0),
  maxReturned: z.number().int().min(1).optional(),
  truncated: z.boolean(),
  excludedCount: z.number().int().min(0).default(0),
  bodyRegions: z.array(z.string()).default([]),
  expandedMuscles: z.array(z.string()).default([]),
  appliedFilters: z.array(appliedFilterSchema),
  exercises: z.array(displayedExerciseSummarySchema),
}).strict();

const exerciseRecommendationFactPayloadSchema = z.object({
  query: querySummarySchema,
  displayedExerciseIds: z.array(z.string().trim().min(1)),
  displayedExercises: z.array(displayedExerciseSummarySchema),
  visibilitySource: z.literal("response_renderer_tool_result"),
  toolName: z.literal("searchExerciseResources"),
  toolResultId: z.string().trim().min(1),
}).strict();

type ExerciseRecommendationFactPayload = z.infer<typeof exerciseRecommendationFactPayloadSchema>;
type DisplayedExerciseSummary = z.infer<typeof displayedExerciseSummarySchema>;

type ConversationBusinessFactRow = {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  kind: string;
  status: string;
  schemaVersion: number;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ConversationBusinessFactDelegate = {
  upsert(args: unknown): Promise<ConversationBusinessFactRow>;
  findMany(args: unknown): Promise<ConversationBusinessFactRow[]>;
};

type ConversationBusinessFactClient = {
  conversationBusinessFact: ConversationBusinessFactDelegate;
};

export type ExerciseRecommendationFactSummary = {
  factRef: string;
  messageId: string;
  kind: typeof exerciseRecommendationFactKind;
  status: typeof activeFactStatus;
  schemaVersion: typeof exerciseRecommendationFactSchemaVersion;
  createdAt: string;
  displayedCount: number;
  displayedExercises: DisplayedExerciseSummary[];
  query: Pick<ExerciseRecommendationFactPayload["query"], "appliedFilters" | "bodyRegions" | "expandedMuscles" | "totalMatches" | "returnedCount" | "excludedCount" | "truncated">;
};

export type ExerciseRecommendationFactReadSuccess = {
  ok: true;
  fact: ExerciseRecommendationFactSummary & {
    userId: string;
    conversationId: string;
    displayedExerciseIds: string[];
    query: ExerciseRecommendationFactPayload["query"];
  };
};

export type ExerciseRecommendationFactReadFailure = {
  ok: false;
  code: "actor_missing" | "not_found" | "not_unique" | "status_not_readable" | "schema_version_unsupported" | "payload_invalid" | "database_unconfigured";
  message: string;
};

export type PersistExerciseRecommendationFactsResult =
  | { ok: true; savedCount: number; skippedReason?: "missing_conversation_or_message" | "database_unconfigured" | "no_visible_exercise_fact" }
  | { ok: false; code: "persist_failed"; message: string; savedCount: number };

/** persistExerciseRecommendationFactsFromEvents 在用户投影边界保存动作 fact，失败只返回诊断不影响响应。 */
export async function persistExerciseRecommendationFactsFromEvents(input: {
  userId: string;
  conversationId?: string;
  messageId?: string;
  events: AgentStreamEvent[];
  client?: ConversationBusinessFactClient;
}): Promise<PersistExerciseRecommendationFactsResult> {
  if (!input.conversationId || !input.messageId) {
    return { ok: true, savedCount: 0, skippedReason: "missing_conversation_or_message" };
  }

  const client = input.client ?? getOptionalFactClient();
  if (!client) {
    return { ok: true, savedCount: 0, skippedReason: "database_unconfigured" };
  }

  const payloads = input.events.flatMap((event) => createFactPayloadFromEvent(event));
  if (payloads.length === 0) {
    return { ok: true, savedCount: 0, skippedReason: "no_visible_exercise_fact" };
  }

  let savedCount = 0;
  try {
    for (const payload of payloads) {
      await client.conversationBusinessFact.upsert({
        where: {
          conversationBusinessFactIdentity: {
            userId: input.userId,
            conversationId: input.conversationId,
            messageId: input.messageId,
            kind: exerciseRecommendationFactKind,
            schemaVersion: exerciseRecommendationFactSchemaVersion,
          },
        },
        update: {
          status: activeFactStatus,
          payload: toInputJson(payload),
        },
        create: {
          userId: input.userId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          kind: exerciseRecommendationFactKind,
          status: activeFactStatus,
          schemaVersion: exerciseRecommendationFactSchemaVersion,
          payload: toInputJson(payload),
        },
      });
      savedCount += 1;
    }
  } catch (error) {
    return {
      ok: false,
      code: "persist_failed",
      message: error instanceof Error ? error.message : "Unknown fact persistence failure.",
      savedCount,
    };
  }

  return { ok: true, savedCount };
}

/** listRecentExerciseRecommendationFactSummaries 只恢复轻量索引，完整 payload 必须经 read/import tool 读取。 */
export async function listRecentExerciseRecommendationFactSummaries(input: {
  userId: string;
  conversationId?: string;
  limit?: number;
  client?: ConversationBusinessFactClient;
}): Promise<ExerciseRecommendationFactSummary[]> {
  if (!input.conversationId) {
    return [];
  }

  const client = input.client ?? getOptionalFactClient();
  if (!client) {
    return [];
  }

  const rows = await client.conversationBusinessFact.findMany({
    where: {
      userId: input.userId,
      conversationId: input.conversationId,
      kind: exerciseRecommendationFactKind,
      status: activeFactStatus,
      schemaVersion: exerciseRecommendationFactSchemaVersion,
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(input.limit ?? 3, 5)),
  });

  return rows.flatMap((row) => {
    const parsed = parseFactPayload(row);
    return parsed ? [toFactSummary(row, parsed)] : [];
  });
}

/** readExerciseRecommendationFact 读取并校验当前用户和会话可访问的历史动作 fact。 */
export async function readExerciseRecommendationFact(input: {
  userId?: string;
  conversationId?: string;
  factRef?: string;
  messageId?: string;
  client?: ConversationBusinessFactClient;
}): Promise<ExerciseRecommendationFactReadSuccess | ExerciseRecommendationFactReadFailure> {
  if (!input.userId || !input.conversationId) {
    return { ok: false, code: "actor_missing", message: "Current actor or conversation is missing." };
  }

  const client = input.client ?? getOptionalFactClient();
  if (!client) {
    return { ok: false, code: "database_unconfigured", message: "Business fact store is not configured." };
  }

  const rows = await client.conversationBusinessFact.findMany({
    where: {
      userId: input.userId,
      conversationId: input.conversationId,
      kind: exerciseRecommendationFactKind,
      schemaVersion: exerciseRecommendationFactSchemaVersion,
      ...(input.factRef ? { id: input.factRef } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  if (rows.length === 0) {
    return { ok: false, code: "not_found", message: "No accessible exercise recommendation fact was found." };
  }
  if (rows.length > 1) {
    return { ok: false, code: "not_unique", message: "Exercise recommendation fact reference is not unique." };
  }

  const [row] = rows;
  if (row.status !== activeFactStatus) {
    return { ok: false, code: "status_not_readable", message: "Exercise recommendation fact is not active." };
  }
  if (row.schemaVersion !== exerciseRecommendationFactSchemaVersion) {
    return { ok: false, code: "schema_version_unsupported", message: "Exercise recommendation fact schema version is unsupported." };
  }

  const payload = parseFactPayload(row);
  if (!payload) {
    return { ok: false, code: "payload_invalid", message: "Exercise recommendation fact payload is invalid." };
  }

  return {
    ok: true,
    fact: {
      ...toFactSummary(row, payload),
      userId: row.userId,
      conversationId: row.conversationId,
      displayedExerciseIds: payload.displayedExerciseIds,
      query: payload.query,
    },
  };
}

function createFactPayloadFromEvent(event: AgentStreamEvent): ExerciseRecommendationFactPayload[] {
  if (event.type !== "tool_result" || event.toolName !== "searchExerciseResources") {
    return [];
  }

  const parsed = searchExerciseResourcesUserProjectionSchema.safeParse(event.content);
  if (!parsed.success || parsed.data.exercises.length === 0) {
    return [];
  }

  const displayedExercises = parsed.data.exercises;
  const displayedExerciseIds = [...new Set(displayedExercises.map((exercise) => exercise.id))];

  return [{
    query: {
      published: true,
      sort: "name_asc",
      appliedFilters: parsed.data.appliedFilters,
      ...queryFieldsFromAppliedFilters(parsed.data.appliedFilters),
      bodyRegions: parsed.data.bodyRegions,
      expandedMuscles: parsed.data.expandedMuscles,
      totalMatches: parsed.data.totalMatches,
      returnedCount: parsed.data.returnedCount,
      maxReturned: parsed.data.maxReturned ?? parsed.data.returnedCount,
      truncated: parsed.data.truncated,
      excludedCount: parsed.data.excludedCount,
    },
    displayedExerciseIds,
    displayedExercises,
    visibilitySource: "response_renderer_tool_result",
    toolName: "searchExerciseResources",
    toolResultId: event.toolResultId,
  }];
}

function queryFieldsFromAppliedFilters(filters: Array<z.infer<typeof appliedFilterSchema>>) {
  return {
    q: readStringFilter(filters, "q"),
    category: readStringFilter(filters, "category"),
    suitability: readStringFilter(filters, "suitability"),
    level: readStringFilter(filters, "level"),
    force: readStringFilter(filters, "force"),
    mechanic: readStringFilter(filters, "mechanic"),
    equipment: readStringFilter(filters, "equipment"),
    homeRequirement: readStringFilter(filters, "homeRequirement"),
    muscle: readStringFilter(filters, "muscle"),
    goalTag: readStringFilter(filters, "goalTag"),
    riskTag: readStringFilter(filters, "riskTag"),
    excludeExerciseIds: readStringArrayFilter(filters, "excludeExerciseIds"),
  };
}

function readStringFilter(filters: Array<z.infer<typeof appliedFilterSchema>>, field: string) {
  const value = filters.find((filter) => filter.field === field)?.value;
  return typeof value === "string" ? value : undefined;
}

function readStringArrayFilter(filters: Array<z.infer<typeof appliedFilterSchema>>, field: string) {
  const value = filters.find((filter) => filter.field === field)?.value;
  return Array.isArray(value) ? value : undefined;
}

function toFactSummary(
  row: ConversationBusinessFactRow,
  payload: ExerciseRecommendationFactPayload,
): ExerciseRecommendationFactSummary {
  return {
    factRef: row.id,
    messageId: row.messageId,
    kind: exerciseRecommendationFactKind,
    status: activeFactStatus,
    schemaVersion: exerciseRecommendationFactSchemaVersion,
    createdAt: row.createdAt.toISOString(),
    displayedCount: payload.displayedExerciseIds.length,
    displayedExercises: payload.displayedExercises.slice(0, 3),
    query: {
      appliedFilters: payload.query.appliedFilters,
      bodyRegions: payload.query.bodyRegions,
      expandedMuscles: payload.query.expandedMuscles,
      totalMatches: payload.query.totalMatches,
      returnedCount: payload.query.returnedCount,
      excludedCount: payload.query.excludedCount,
      truncated: payload.query.truncated,
    },
  };
}

function parseFactPayload(row: ConversationBusinessFactRow) {
  const parsed = exerciseRecommendationFactPayloadSchema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

function getOptionalFactClient(): ConversationBusinessFactClient | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  return getPrismaClient() as unknown as ConversationBusinessFactClient;
}

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
