import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import { exerciseRecommendationCardSchema } from "@/lib/shared/exercise-recommendations/schema";
import {
  conversationArtifactPayloadSchemaVersion,
  parseConversationArtifactPayload,
  type ArtifactIndex,
  type ConversationArtifactKind,
  type ConversationArtifactPayload,
  type ConversationArtifactScope,
  type ConversationArtifactSourceEntityKind,
  type ConversationArtifactStatus,
} from "@/lib/shared/conversation-artifacts/schema";
import {
  workoutPlanDraftSchema,
  workoutRoutineDraftSchema,
} from "@/lib/shared/workout-plans/draft-schema";

type ArtifactClient = Pick<
  PrismaClient,
  "artifactIndex" | "conversationArtifact" | "$transaction"
>;

type ArtifactTransactionClient = Pick<PrismaClient, "artifactIndex" | "conversationArtifact">;
type ArtifactWritableClient = ArtifactClient | ArtifactTransactionClient;

export type RecentArtifactSummary = {
  artifactId: string;
  kind: ConversationArtifactKind;
  title: string;
  summary?: string;
  exerciseIds: string[];
  goals: string[];
  sessionMinutes?: number;
  weeklyFrequency?: number;
  trainingDayCount?: number;
  updatedAt: string;
};

type CreateConversationArtifactInput = {
  userId: string;
  sessionId: string;
  messageId?: string;
  kind: ConversationArtifactKind;
  scope?: ConversationArtifactScope;
  payload: unknown;
};

type LinkSourceEntityInput = {
  userId: string;
  messageId: string;
  kind?: ConversationArtifactKind;
  sourceEntityKind: ConversationArtifactSourceEntityKind;
  sourceEntityId: string;
};

// Artifact Service 是聊天卡片事实源的唯一写入口，负责 payload 校验、版本和索引同步。
export async function createOrUpdateConversationArtifact(
  input: CreateConversationArtifactInput,
  client: ArtifactWritableClient = getPrismaClient(),
) {
  const payload = parseConversationArtifactPayload(
    input.kind,
    conversationArtifactPayloadSchemaVersion,
    input.payload,
  );
  const scope = input.scope ?? "chat";

  return runArtifactWrite(client, async (tx) => {
    const existing = input.messageId
      ? await tx.conversationArtifact.findFirst({
          where: {
            userId: input.userId,
            sessionId: input.sessionId,
            kind: input.kind,
            status: "active",
            OR: [
              { messageId: input.messageId },
              { index: { sourceMessageId: input.messageId } },
            ],
          },
          orderBy: { revision: "desc" },
        })
      : null;

    if (existing && stableJsonEquals(existing.payload, payload)) {
      if (input.messageId && existing.messageId !== input.messageId) {
        await tx.conversationArtifact.update({
          where: { id: existing.id },
          data: { messageId: input.messageId },
        });
      }
      await upsertArtifactIndex(tx, {
        artifactId: existing.id,
        userId: input.userId,
        sessionId: input.sessionId,
        kind: input.kind,
        scope,
        status: "active",
        sourceMessageId: input.messageId,
        payload,
      });
      return existing;
    }

    if (existing) {
      await tx.conversationArtifact.update({
        where: { id: existing.id },
        data: { status: "superseded" },
      });
      await tx.artifactIndex.updateMany({
        where: { artifactId: existing.id, userId: input.userId },
        data: { status: "superseded" },
      });
    }

    const artifact = await tx.conversationArtifact.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        messageId: input.messageId,
        kind: input.kind,
        scope,
        payloadSchemaVersion: conversationArtifactPayloadSchemaVersion,
        payload: toJsonPayload(payload),
        status: "active",
        revision: existing ? existing.revision + 1 : 1,
        revisionOfArtifactId: existing?.id,
      },
    });

    await upsertArtifactIndex(tx, {
      artifactId: artifact.id,
      userId: input.userId,
      sessionId: input.sessionId,
      kind: input.kind,
      scope,
      status: "active",
      sourceMessageId: input.messageId,
      payload,
    });

    return artifact;
  });
}

// 当前用户读取 recent artifact summaries，只暴露轻量索引，避免把完整 payload 注入模型上下文。
export async function listRecentArtifactSummariesForCurrentUser(
  sessionId: string | undefined,
  limit = 6,
): Promise<RecentArtifactSummary[]> {
  if (!sessionId) {
    return [];
  }

  const user = await getCurrentUser();
  const prisma = getPrismaClient();
  const indexes = await prisma.artifactIndex.findMany({
    where: {
      userId: user.id,
      sessionId,
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return indexes.map((index) => ({
    artifactId: index.artifactId,
    kind: index.kind,
    title: index.title,
    summary: index.summary ?? undefined,
    exerciseIds: index.exerciseIds,
    goals: index.goals,
    sessionMinutes: index.sessionMinutes ?? undefined,
    weeklyFrequency: index.weeklyFrequency ?? undefined,
    trainingDayCount: index.trainingDayCount ?? undefined,
    updatedAt: index.updatedAt.toISOString(),
  }));
}

// 保存 routine/schedule 后通过来源消息回写 artifact，不要求客户端持有 artifact id。
export async function linkArtifactSourceEntityFromMessage(
  input: LinkSourceEntityInput,
  client: ArtifactWritableClient = getPrismaClient(),
) {
  const artifact = await client.conversationArtifact.findFirst({
    where: {
      userId: input.userId,
      messageId: input.messageId,
      kind: input.kind,
      status: "active",
    },
    orderBy: { revision: "desc" },
    select: { id: true },
  });

  if (!artifact) {
    return null;
  }

  return client.conversationArtifact.update({
    where: { id: artifact.id },
    data: {
      sourceEntityKind: input.sourceEntityKind,
      sourceEntityId: input.sourceEntityId,
    },
  });
}

export function formatRecentArtifactSummariesForPrompt(summaries: RecentArtifactSummary[]) {
  if (summaries.length === 0) {
    return [
      "recentConversationArtifacts:",
      "[]",
      "",
      "完整训练卡片只能从 ConversationArtifact 读取；没有 artifact 时不要从 conversationSummary 反向重建 payload。",
    ].join("\n");
  }

  return [
    "recentConversationArtifacts:",
    JSON.stringify(summaries, null, 2),
    "",
    "这些是服务端已保存的聊天结构化卡片索引；conversationSummary 仍只是自然语言摘要，不能当作完整训练 payload。",
  ].join("\n");
}

function upsertArtifactIndex(
  client: ArtifactTransactionClient,
  input: {
    artifactId: string;
    userId: string;
    sessionId: string;
    kind: ConversationArtifactKind;
    scope: ConversationArtifactScope;
    status: ConversationArtifactStatus;
    sourceMessageId?: string;
    payload: ConversationArtifactPayload;
  },
) {
  const index = buildArtifactIndex(input);

  return client.artifactIndex.upsert({
    where: { artifactId: input.artifactId },
    update: {
      kind: index.kind,
      scope: index.scope,
      status: index.status,
      title: index.title,
      summary: index.summary,
      exerciseIds: index.exerciseIds,
      goals: index.goals,
      muscles: index.muscles,
      equipment: index.equipment,
      sessionMinutes: index.sessionMinutes,
      weeklyFrequency: index.weeklyFrequency,
      trainingDayCount: index.trainingDayCount,
      sourceMessageId: index.sourceMessageId,
    },
    create: index,
  });
}

// 索引生成器只提取检索需要的轻量字段，完整训练结构保留在 artifact payload 中。
export function buildArtifactIndex(input: {
  artifactId: string;
  userId: string;
  sessionId: string;
  kind: ConversationArtifactKind;
  scope: ConversationArtifactScope;
  status: ConversationArtifactStatus;
  sourceMessageId?: string;
  payload: ConversationArtifactPayload;
}): ArtifactIndex {
  if (input.kind === "exercise_recommendation") {
    const payload = exerciseRecommendationCardSchema.parse(input.payload);

    return {
      artifactId: input.artifactId,
      userId: input.userId,
      sessionId: input.sessionId,
      kind: input.kind,
      scope: input.scope,
      status: input.status,
      title: payload.title,
      summary: payload.summary,
      exerciseIds: unique(payload.items.map((item) => item.exerciseId)),
      goals: [payload.goal],
      muscles: unique(payload.items.flatMap((item) => [...item.primaryMusclesZh, ...item.secondaryMusclesZh])),
      equipment: unique(payload.items.map((item) => item.equipmentZh)),
      sourceMessageId: input.sourceMessageId,
    };
  }

  if (input.kind === "routine") {
    const payload = workoutRoutineDraftSchema.parse(input.payload);

    return {
      artifactId: input.artifactId,
      userId: input.userId,
      sessionId: input.sessionId,
      kind: input.kind,
      scope: input.scope,
      status: input.status,
      title: payload.title,
      summary: payload.summary,
      exerciseIds: unique(payload.sections.flatMap((section) => section.items.map((item) => item.exerciseId))),
      goals: [payload.goal],
      muscles: [],
      equipment: [],
      sessionMinutes: payload.estimatedSessionMinutes,
      sourceMessageId: input.sourceMessageId,
    };
  }

  const payload = workoutPlanDraftSchema.parse(input.payload);

  return {
    artifactId: input.artifactId,
    userId: input.userId,
    sessionId: input.sessionId,
    kind: input.kind,
    scope: input.scope,
    status: input.status,
    title: payload.title,
    summary: payload.summary,
    exerciseIds: unique(
      payload.days.flatMap((day) =>
        day.sections.flatMap((section) => section.items.map((item) => item.exerciseId)),
      ),
    ),
    goals: unique([payload.goal, ...payload.days.map((day) => day.focus)]),
    muscles: [],
    equipment: [],
    sessionMinutes: payload.estimatedSessionMinutes,
    weeklyFrequency: payload.weeklyFrequency,
    trainingDayCount: payload.trainingDayCount,
    sourceMessageId: input.sourceMessageId,
  };
}

function stableJsonEquals(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toJsonPayload(payload: ConversationArtifactPayload) {
  return JSON.parse(JSON.stringify(payload));
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function runArtifactWrite<T>(
  client: ArtifactWritableClient,
  writer: (tx: ArtifactTransactionClient) => Promise<T>,
) {
  if ("$transaction" in client) {
    return client.$transaction(writer);
  }

  return writer(client);
}
