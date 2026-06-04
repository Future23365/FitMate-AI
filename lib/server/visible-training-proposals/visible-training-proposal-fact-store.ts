import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";

import type { AgentStreamEvent, JsonValue } from "@/lib/server/agent-core/contracts";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import { getExerciseRecordById } from "@/lib/server/exercises/exercise-repository";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

import {
  toJsonValue,
  visibleTrainingProposalFactKind,
  visibleTrainingProposalFactSchemaVersion,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  visibleTrainingProposalSchemaVersion,
  type VisibleTrainingProposalPayload,
} from "./visible-training-proposal-contract";

const activeFactStatus = "active";

const exerciseDetailSchema = z.object({
  exerciseId: z.string().trim().min(1),
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  equipmentZh: z.string().nullable().optional(),
  primaryMusclesZh: z.array(z.string()).default([]),
  allowedSections: z.array(exerciseAllowedSectionSchema).default([]),
  imageUrl: z.string().nullable().optional(),
}).strict();

const visibleTrainingProposalFactPayloadSchema = z.object({
  proposal: visibleTrainingProposalPayloadSchema,
  exerciseDetails: z.array(exerciseDetailSchema).default([]),
  visibilitySource: z.literal("response_renderer_visible_output"),
  outputType: z.literal(visibleTrainingProposalOutputType),
  schemaVersion: z.literal(visibleTrainingProposalSchemaVersion),
}).strict();

const visibleOutputEventSchema = z.object({
  type: z.literal("visible_output"),
  outputType: z.literal(visibleTrainingProposalOutputType),
  schemaVersion: z.literal(visibleTrainingProposalSchemaVersion),
  payload: visibleTrainingProposalPayloadSchema,
  content: z.unknown().optional(),
}).strict();

type VisibleTrainingProposalFactPayload = z.infer<typeof visibleTrainingProposalFactPayloadSchema>;
type ExerciseDetail = z.infer<typeof exerciseDetailSchema>;

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

export type VisibleTrainingProposalFactSummary = {
  factRef: string;
  messageId: string;
  kind: typeof visibleTrainingProposalFactKind;
  status: typeof activeFactStatus;
  schemaVersion: typeof visibleTrainingProposalFactSchemaVersion;
  createdAt: string;
  proposalKind: VisibleTrainingProposalPayload["kind"];
  exerciseItems: Array<VisibleTrainingProposalPayload["exerciseItems"][number] & Partial<ExerciseDetail>>;
  schedule?: VisibleTrainingProposalPayload["schedule"];
};

export type VisibleTrainingProposalFactReadSuccess = {
  ok: true;
  fact: VisibleTrainingProposalFactSummary & {
    userId: string;
    conversationId: string;
    payload: VisibleTrainingProposalPayload;
    exerciseDetails: ExerciseDetail[];
  };
};

export type VisibleTrainingProposalFactReadFailure = {
  ok: false;
  code:
    | "actor_missing"
    | "not_found"
    | "not_unique"
    | "status_not_readable"
    | "schema_version_unsupported"
    | "payload_invalid"
    | "exercise_missing"
    | "database_unconfigured";
  message: string;
};

export type PersistVisibleTrainingProposalFactsResult =
  | { ok: true; savedCount: number; skippedReason?: "missing_conversation_or_message" | "database_unconfigured" | "no_visible_training_proposal" }
  | { ok: false; code: "persist_failed"; message: string; savedCount: number };

/** persistVisibleTrainingProposalFactsFromEvents 只在用户可见 visible_output 边界保存训练方案事实。 */
export async function persistVisibleTrainingProposalFactsFromEvents(input: {
  userId: string;
  conversationId?: string;
  messageId?: string;
  events: AgentStreamEvent[];
  client?: ConversationBusinessFactClient;
}): Promise<PersistVisibleTrainingProposalFactsResult> {
  if (!input.conversationId || !input.messageId) {
    return { ok: true, savedCount: 0, skippedReason: "missing_conversation_or_message" };
  }

  const client = input.client ?? getOptionalFactClient();
  if (!client) {
    return { ok: true, savedCount: 0, skippedReason: "database_unconfigured" };
  }

  const payloads = input.events.flatMap((event) => createFactPayloadFromEvent(event));
  if (payloads.length === 0) {
    return { ok: true, savedCount: 0, skippedReason: "no_visible_training_proposal" };
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
            kind: visibleTrainingProposalFactKind,
            schemaVersion: visibleTrainingProposalFactSchemaVersion,
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
          kind: visibleTrainingProposalFactKind,
          status: activeFactStatus,
          schemaVersion: visibleTrainingProposalFactSchemaVersion,
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

/** listRecentVisibleTrainingProposalSummaries 恢复模型可见轻量事实摘要，不读取旧动作推荐事实。 */
export async function listRecentVisibleTrainingProposalSummaries(input: {
  userId: string;
  conversationId?: string;
  limit?: number;
  client?: ConversationBusinessFactClient;
}): Promise<VisibleTrainingProposalFactSummary[]> {
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
      kind: visibleTrainingProposalFactKind,
      status: activeFactStatus,
      schemaVersion: visibleTrainingProposalFactSchemaVersion,
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(input.limit ?? 3, 5)),
  });

  return rows.flatMap((row) => {
    const parsed = parseFactPayload(row);
    return parsed ? [toFactSummary(row, parsed)] : [];
  });
}

/** readVisibleTrainingProposalFact 读取当前用户和会话可访问的可见训练方案事实。 */
export async function readVisibleTrainingProposalFact(input: {
  userId?: string;
  conversationId?: string;
  factRef?: string;
  messageId?: string;
  client?: ConversationBusinessFactClient;
}): Promise<VisibleTrainingProposalFactReadSuccess | VisibleTrainingProposalFactReadFailure> {
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
      kind: visibleTrainingProposalFactKind,
      schemaVersion: visibleTrainingProposalFactSchemaVersion,
      ...(input.factRef ? { id: input.factRef } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  if (rows.length === 0) {
    return { ok: false, code: "not_found", message: "No accessible visible training proposal fact was found." };
  }
  if (rows.length > 1) {
    return { ok: false, code: "not_unique", message: "Visible training proposal fact reference is not unique." };
  }

  const [row] = rows;
  if (row.status !== activeFactStatus) {
    return { ok: false, code: "status_not_readable", message: "Visible training proposal fact is not active." };
  }
  if (row.schemaVersion !== visibleTrainingProposalFactSchemaVersion) {
    return { ok: false, code: "schema_version_unsupported", message: "Visible training proposal fact schema version is unsupported." };
  }

  const payload = parseFactPayload(row);
  if (!payload) {
    return { ok: false, code: "payload_invalid", message: "Visible training proposal fact payload is invalid." };
  }

  const exerciseDetails = await loadExerciseDetails(payload.proposal);
  if (!exerciseDetails) {
    return { ok: false, code: "exercise_missing", message: "Visible training proposal fact references an exercise that no longer exists." };
  }

  return {
    ok: true,
    fact: {
      ...toFactSummary(row, {
        ...payload,
        exerciseDetails,
      }),
      userId: row.userId,
      conversationId: row.conversationId,
      payload: payload.proposal,
      exerciseDetails,
    },
  };
}

function createFactPayloadFromEvent(event: AgentStreamEvent): VisibleTrainingProposalFactPayload[] {
  const parsed = visibleOutputEventSchema.safeParse(event);
  if (!parsed.success) {
    return [];
  }

  return [{
    proposal: parsed.data.payload,
    exerciseDetails: extractExerciseDetailsFromVisibleOutputContent(parsed.data.content),
    visibilitySource: "response_renderer_visible_output",
    outputType: visibleTrainingProposalOutputType,
    schemaVersion: visibleTrainingProposalSchemaVersion,
  }];
}

function extractExerciseDetailsFromVisibleOutputContent(content: unknown): ExerciseDetail[] {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return [];
  }

  const sections = (content as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) {
    return [];
  }

  const details = new Map<string, ExerciseDetail>();
  for (const section of sections) {
    const items = section && typeof section === "object" && !Array.isArray(section)
      ? (section as { items?: unknown }).items
      : undefined;
    if (!Array.isArray(items)) {
      continue;
    }

    for (const item of items) {
      const exercise = item && typeof item === "object" && !Array.isArray(item)
        ? (item as { exercise?: unknown }).exercise
        : undefined;
      const parsed = exerciseDetailSchema.safeParse(exercise);
      if (parsed.success) {
        details.set(parsed.data.exerciseId, parsed.data);
      }
    }
  }

  return [...details.values()];
}

function toFactSummary(
  row: ConversationBusinessFactRow,
  payload: VisibleTrainingProposalFactPayload,
): VisibleTrainingProposalFactSummary {
  const details = new Map(payload.exerciseDetails.map((exercise) => [exercise.exerciseId, exercise]));

  return {
    factRef: row.id,
    messageId: row.messageId,
    kind: visibleTrainingProposalFactKind,
    status: activeFactStatus,
    schemaVersion: visibleTrainingProposalFactSchemaVersion,
    createdAt: row.createdAt.toISOString(),
    proposalKind: payload.proposal.kind,
    exerciseItems: payload.proposal.exerciseItems.map((item) => ({
      ...item,
      ...details.get(item.exerciseId),
    })),
    schedule: payload.proposal.schedule,
  };
}

function parseFactPayload(row: ConversationBusinessFactRow) {
  const parsed = visibleTrainingProposalFactPayloadSchema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

async function loadExerciseDetails(proposal: VisibleTrainingProposalPayload): Promise<ExerciseDetail[] | null> {
  const ids = [...new Set(proposal.exerciseItems.map((item) => item.exerciseId))];
  const records = await Promise.all(ids.map((id) => getExerciseRecordById(id)));

  if (records.some((record) => !record)) {
    return null;
  }

  return records.flatMap((record) => record
    ? [{
        exerciseId: record.id,
        nameZh: record.nameZh,
        nameEn: record.nameEn,
        equipmentZh: record.equipmentZh,
        primaryMusclesZh: record.primaryMusclesZh,
        allowedSections: record.allowedSections,
        imageUrl: record.imageUrls[0] ?? null,
      }]
    : []);
}

function getOptionalFactClient(): ConversationBusinessFactClient | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  return getPrismaClient() as unknown as ConversationBusinessFactClient;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export { toJsonValue };
