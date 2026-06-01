import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import type { CurrentUser } from "@/lib/server/users/current-user";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
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
import type { ReferenceArtifactCandidate } from "@/lib/shared/reference-resolver/schema";
import {
  buildEmbeddingText,
  cosineSimilarity,
  createSearchEmbedding,
  parseSearchEmbedding,
  scoreHybridTextMatch,
  uniqueStrings,
  type HybridSearchScore,
} from "@/lib/shared/search/hybrid-search";

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
  muscles: string[];
  equipment: string[];
  sessionMinutes?: number;
  weeklyFrequency?: number;
  trainingDayCount?: number;
  updatedAt: string;
};

type ArtifactSearchScope = "current_session" | "current_user";

export type SearchArtifactsInput = {
  userId: string;
  sessionId?: string;
  sessionScope?: ArtifactSearchScope;
  kind?: ConversationArtifactKind;
  query?: string;
  limit?: number;
};

export type ListRecentArtifactsInput = {
  userId: string;
  sessionId: string;
  sessionScope?: ArtifactSearchScope;
  kind?: ConversationArtifactKind;
  limit?: number;
};

export type ArtifactSearchDiagnostics = {
  query?: string;
  filters: {
    userId: string;
    sessionId?: string;
    sessionScope: ArtifactSearchScope;
    kind?: ConversationArtifactKind;
    status: ConversationArtifactStatus;
  };
  recalledCount: number;
  filteredCount: number;
  rerank: Array<{
    artifactId: string;
    score: HybridSearchScore;
  }>;
  finalCandidateIds: string[];
  failureReasons: string[];
};

export type GetArtifactPayloadInput = {
  userId: string;
  artifactId: string;
};

export type ArtifactPayloadSuccess = {
  ok: true;
  artifactId: string;
  kind: ConversationArtifactKind;
  payload: ConversationArtifactPayload;
};

export type ArtifactPayloadFailure = {
  ok: false;
  code: "not_found" | "invalid_payload";
  message: string;
  detail?: unknown;
};

type ActiveArtifactPayloadSuccess = ArtifactPayloadSuccess & {
  requestedArtifactId: string;
  revisionResolution: {
    status: "direct" | "resolved_to_active";
    requestedArtifactId: string;
    activeArtifactId: string;
  };
};

type ArtifactPayloadRecord = {
  id: string;
  kind: ConversationArtifactKind;
  payloadSchemaVersion: number;
  payload: unknown;
};

type ArtifactIndexRow = {
  artifactId: string;
  sessionId: string;
  kind: ConversationArtifactKind;
  scope: ConversationArtifactScope;
  status: ConversationArtifactStatus;
  title: string;
  summary: string | null;
  exerciseIds: string[];
  goals: string[];
  muscles: string[];
  equipment: string[];
  sessionMinutes: number | null;
  weeklyFrequency: number | null;
  trainingDayCount: number | null;
  embeddingText: string | null;
  embedding: unknown;
  updatedAt: Date;
};

type CreateConversationArtifactInput = {
  userId: string;
  sessionId: string;
  messageId?: string;
  kind: ConversationArtifactKind;
  scope?: ConversationArtifactScope;
  payload: unknown;
};

type CreateArtifactRevisionInput = {
  userId: string;
  sourceArtifactId: string;
  messageId?: string;
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

// PatchEngine 通过来源 artifact 创建新 revision，保持旧 payload 可读并同步轻量索引状态。
export async function createConversationArtifactRevision(
  input: CreateArtifactRevisionInput,
  client: ArtifactWritableClient = getPrismaClient(),
) {
  return runArtifactWrite(client, async (tx) => {
    const source = await tx.conversationArtifact.findFirst({
      where: {
        id: input.sourceArtifactId,
        userId: input.userId,
        status: "active",
      },
      select: {
        id: true,
        userId: true,
        sessionId: true,
        kind: true,
        scope: true,
        revision: true,
        payloadSchemaVersion: true,
        payload: true,
      },
    });

    if (!source) {
      return {
        ok: false as const,
        code: "not_found" as const,
        message: "Source artifact not found or not accessible.",
      };
    }

    const payload = parseConversationArtifactPayload(
      source.kind,
      conversationArtifactPayloadSchemaVersion,
      input.payload,
    );

    await tx.conversationArtifact.update({
      where: { id: source.id },
      data: { status: "superseded" },
    });
    await tx.artifactIndex.updateMany({
      where: { artifactId: source.id, userId: input.userId },
      data: { status: "superseded" },
    });

    const artifact = await tx.conversationArtifact.create({
      data: {
        userId: source.userId,
        sessionId: source.sessionId,
        messageId: input.messageId,
        kind: source.kind,
        scope: source.scope,
        payloadSchemaVersion: conversationArtifactPayloadSchemaVersion,
        payload: toJsonPayload(payload),
        status: "active",
        revision: source.revision + 1,
        revisionOfArtifactId: source.id,
      },
    });

    await upsertArtifactIndex(tx, {
      artifactId: artifact.id,
      userId: source.userId,
      sessionId: source.sessionId,
      kind: source.kind,
      scope: source.scope,
      status: "active",
      sourceMessageId: input.messageId,
      payload,
    });

    return {
      ok: true as const,
      artifact,
      payload,
    };
  });
}

// 当前用户读取 recent artifact summaries，只暴露轻量索引，避免把完整 payload 注入模型上下文。
export async function listRecentArtifactSummariesForCurrentUser(
  sessionId: string | undefined,
  limit = 6,
  currentUser?: CurrentUser,
): Promise<RecentArtifactSummary[]> {
  if (!sessionId) {
    return [];
  }

  const user = await getCurrentUser(currentUser);
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

  return indexes.map((index) => artifactIndexRowToRecentSummary(index as ArtifactIndexRow));
}

// Agent recent artifact tool 使用显式 userId/sessionId 读取轻量索引，避免从 summary 重建训练事实。
export async function listRecentArtifacts(
  input: ListRecentArtifactsInput,
  client: Pick<PrismaClient, "artifactIndex"> = getPrismaClient(),
): Promise<RecentArtifactSummary[]> {
  const limit = clampLimit(input.limit);
  const sessionScope = input.sessionScope ?? "current_session";
  const rows = await client.artifactIndex.findMany({
    where: {
      userId: input.userId,
      status: "active",
      ...(input.kind ? { kind: input.kind } : {}),
      ...(sessionScope === "current_session" ? { sessionId: input.sessionId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return rows.map(artifactIndexRowToRecentSummary);
}

// 语义检索工具只返回轻量候选摘要，完整 payload 读取必须走 getArtifactPayload。
export async function searchArtifacts(
  input: SearchArtifactsInput,
  client: Pick<PrismaClient, "artifactIndex"> = getPrismaClient(),
): Promise<ReferenceArtifactCandidate[]> {
  const result = await searchArtifactsDetailed(input, client);

  return result.candidates;
}

// Hybrid search 先执行 userId/status/kind/session 硬过滤，再在候选内做全文、向量和业务排序。
export async function searchArtifactsDetailed(
  input: SearchArtifactsInput,
  client: Pick<PrismaClient, "artifactIndex"> = getPrismaClient(),
): Promise<{
  candidates: ReferenceArtifactCandidate[];
  diagnostics: ArtifactSearchDiagnostics;
}> {
  const limit = clampLimit(input.limit);
  const sessionScope = input.sessionScope ?? "current_session";
  const query = input.query?.trim();
  const take = query ? Math.max(limit * 8, 24) : limit;
  const rows = await client.artifactIndex.findMany({
    where: {
      userId: input.userId,
      status: "active",
      ...(input.kind ? { kind: input.kind } : {}),
      ...(sessionScope === "current_session" && input.sessionId
        ? { sessionId: input.sessionId }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  const rankedRows = rows
    .map((row) => ({
      row: row as ArtifactIndexRow,
      score: scoreArtifactIndex(row as ArtifactIndexRow, query, input.sessionId),
    }))
    .filter(({ score }) => !query || score.totalScore > 0)
    .sort((left, right) => {
      if (right.score.totalScore !== left.score.totalScore) {
        return right.score.totalScore - left.score.totalScore;
      }

      return right.row.updatedAt.getTime() - left.row.updatedAt.getTime();
    })
    .slice(0, limit);

  const candidates = rankedRows.map(({ row }) => artifactIndexRowToCandidate(row));
  const diagnostics: ArtifactSearchDiagnostics = {
    query,
    filters: {
      userId: input.userId,
      sessionId: input.sessionId,
      sessionScope,
      kind: input.kind,
      status: "active",
    },
    recalledCount: rows.length,
    filteredCount: Math.max(rows.length - rankedRows.length, 0),
    rerank: rankedRows.map(({ row, score }) => ({
      artifactId: row.artifactId,
      score,
    })),
    finalCandidateIds: candidates.map((candidate) => candidate.artifactId),
    failureReasons: candidates.length > 0 ? [] : [query ? "no_hybrid_match" : "no_accessible_artifact"],
  };

  return { candidates, diagnostics };
}

// 当前用户检索包装用于 /api/chat 编排，避免调用方重复处理用户隔离。
export async function searchArtifactsForCurrentUser(
  input: Omit<SearchArtifactsInput, "userId">,
  client: Pick<PrismaClient, "artifactIndex"> = getPrismaClient(),
  currentUser?: CurrentUser,
) {
  const user = await getCurrentUser(currentUser);

  return searchArtifacts({ ...input, userId: user.id }, client);
}

export async function searchArtifactsForCurrentUserDetailed(
  input: Omit<SearchArtifactsInput, "userId">,
  client: Pick<PrismaClient, "artifactIndex"> = getPrismaClient(),
  currentUser?: CurrentUser,
) {
  const user = await getCurrentUser(currentUser);

  return searchArtifactsDetailed({ ...input, userId: user.id }, client);
}

// 完整 payload 读取工具集中处理 userId、status 和 kind/version 校验。
export async function getArtifactPayload(
  input: GetArtifactPayloadInput,
  client: Pick<PrismaClient, "conversationArtifact"> = getPrismaClient(),
): Promise<ArtifactPayloadSuccess | ArtifactPayloadFailure> {
  const artifact = await client.conversationArtifact.findFirst({
    where: {
      id: input.artifactId,
      userId: input.userId,
      status: "active",
    },
    select: {
      id: true,
      kind: true,
      payloadSchemaVersion: true,
      payload: true,
    },
  });

  if (!artifact) {
    return {
      ok: false,
      code: "not_found",
      message: "Artifact not found or not accessible.",
    };
  }

  return parseArtifactPayloadRecord(artifact);
}

export async function getArtifactPayloadForCurrentUser(
  input: Omit<GetArtifactPayloadInput, "userId">,
  client: Pick<PrismaClient, "conversationArtifact"> = getPrismaClient(),
  currentUser?: CurrentUser,
) {
  const user = await getCurrentUser(currentUser);

  return getArtifactPayload({ ...input, userId: user.id }, client);
}

// 长期计划等跨请求流程使用这个读取入口，把同一 revision 链路上的旧 id 收敛到当前 active artifact。
export async function getActiveArtifactPayload(
  input: GetArtifactPayloadInput,
  client: Pick<PrismaClient, "conversationArtifact"> = getPrismaClient(),
): Promise<ActiveArtifactPayloadSuccess | ArtifactPayloadFailure> {
  const requestedArtifact = await client.conversationArtifact.findFirst({
    where: {
      id: input.artifactId,
      userId: input.userId,
    },
    select: {
      id: true,
      userId: true,
      sessionId: true,
      kind: true,
      status: true,
      revisionOfArtifactId: true,
      payloadSchemaVersion: true,
      payload: true,
    },
  });

  if (!requestedArtifact || requestedArtifact.status === "archived") {
    return {
      ok: false,
      code: "not_found",
      message: "Artifact not found or not accessible.",
    };
  }

  if (requestedArtifact.status === "active") {
    const parsed = parseArtifactPayloadRecord(requestedArtifact);

    if (!parsed.ok) {
      return parsed;
    }

    return {
      ...parsed,
      requestedArtifactId: input.artifactId,
      revisionResolution: {
        status: "direct",
        requestedArtifactId: input.artifactId,
        activeArtifactId: parsed.artifactId,
      },
    };
  }

  const lineageArtifacts = await client.conversationArtifact.findMany({
    where: {
      userId: input.userId,
      sessionId: requestedArtifact.sessionId,
      kind: requestedArtifact.kind,
    },
    select: {
      id: true,
      status: true,
      revision: true,
      revisionOfArtifactId: true,
      kind: true,
      payloadSchemaVersion: true,
      payload: true,
    },
  });
  const lineageById = new Map(lineageArtifacts.map((artifact) => [artifact.id, artifact]));
  const activeArtifact = lineageArtifacts
    .filter((artifact) => artifact.status === "active")
    .filter((artifact) => isDescendantRevision(artifact.id, requestedArtifact.id, lineageById))
    .sort((left, right) => right.revision - left.revision)[0];

  if (!activeArtifact) {
    return {
      ok: false,
      code: "not_found",
      message: "Active artifact revision not found or not accessible.",
      detail: {
        requestedArtifactId: input.artifactId,
        requestedStatus: requestedArtifact.status,
      },
    };
  }

  const parsed = parseArtifactPayloadRecord(activeArtifact);

  if (!parsed.ok) {
    return parsed;
  }

  return {
    ...parsed,
    requestedArtifactId: input.artifactId,
    revisionResolution: {
      status: "resolved_to_active",
      requestedArtifactId: input.artifactId,
      activeArtifactId: parsed.artifactId,
    },
  };
}

export async function getActiveArtifactPayloadForCurrentUser(
  input: Omit<GetArtifactPayloadInput, "userId">,
  client: Pick<PrismaClient, "conversationArtifact"> = getPrismaClient(),
  currentUser?: CurrentUser,
) {
  const user = await getCurrentUser(currentUser);

  return getActiveArtifactPayload({ ...input, userId: user.id }, client);
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
      embeddingText: index.embeddingText,
      embedding: index.embedding,
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
    const baseIndex = {
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

    return withArtifactEmbedding(baseIndex);
  }

  if (input.kind === "routine") {
    const payload = workoutRoutineDraftSchema.parse(input.payload);
    const baseIndex = {
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
      muscles: unique(payload.sections.flatMap((section) => section.items.map((item) => item.notes))),
      equipment: [],
      sessionMinutes: payload.estimatedSessionMinutes,
      sourceMessageId: input.sourceMessageId,
    };

    return withArtifactEmbedding(baseIndex);
  }

  const payload = workoutPlanDraftSchema.parse(input.payload);
  const baseIndex = {
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
    muscles: unique(payload.days.map((day) => day.focus)),
    equipment: [],
    sessionMinutes: payload.estimatedSessionMinutes,
    weeklyFrequency: payload.weeklyFrequency,
    trainingDayCount: payload.trainingDayCount,
    sourceMessageId: input.sourceMessageId,
  };

  return withArtifactEmbedding(baseIndex);
}

function stableJsonEquals(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseArtifactPayloadRecord(
  artifact: ArtifactPayloadRecord,
): ArtifactPayloadSuccess | ArtifactPayloadFailure {
  try {
    return {
      ok: true,
      artifactId: artifact.id,
      kind: artifact.kind,
      payload: parseConversationArtifactPayload(
        artifact.kind,
        artifact.payloadSchemaVersion,
        artifact.payload,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_payload",
      message: "Artifact payload validation failed.",
      detail: error,
    };
  }
}

function isDescendantRevision(
  artifactId: string,
  ancestorArtifactId: string,
  lineageById: Map<string, { id: string; revisionOfArtifactId: string | null }>,
) {
  const visited = new Set<string>();
  let currentId: string | null | undefined = artifactId;

  while (currentId) {
    if (currentId === ancestorArtifactId) {
      return true;
    }

    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);
    currentId = lineageById.get(currentId)?.revisionOfArtifactId;
  }

  return false;
}

function toJsonPayload(payload: ConversationArtifactPayload) {
  return JSON.parse(JSON.stringify(payload));
}

function unique(values: Array<string | undefined>) {
  return uniqueStrings(values);
}

function artifactIndexRowToCandidate(row: ArtifactIndexRow): ReferenceArtifactCandidate {
  return {
    artifactId: row.artifactId,
    kind: row.kind,
    title: row.title,
    summary: row.summary ?? undefined,
    exerciseIds: row.exerciseIds,
    goals: row.goals,
    muscles: row.muscles,
    equipment: row.equipment,
    sessionMinutes: row.sessionMinutes ?? undefined,
    weeklyFrequency: row.weeklyFrequency ?? undefined,
    trainingDayCount: row.trainingDayCount ?? undefined,
    updatedAt: toUtcISOString(row.updatedAt),
  };
}

function artifactIndexRowToRecentSummary(row: ArtifactIndexRow): RecentArtifactSummary {
  return {
    artifactId: row.artifactId,
    kind: row.kind,
    title: row.title,
    summary: row.summary ?? undefined,
    exerciseIds: row.exerciseIds,
    goals: row.goals,
    muscles: row.muscles,
    equipment: row.equipment,
    sessionMinutes: row.sessionMinutes ?? undefined,
    weeklyFrequency: row.weeklyFrequency ?? undefined,
    trainingDayCount: row.trainingDayCount ?? undefined,
    updatedAt: toUtcISOString(row.updatedAt),
  };
}

function clampLimit(limit = 6) {
  return Math.min(Math.max(Math.trunc(limit), 1), 12);
}

function scoreArtifactIndex(
  row: ArtifactIndexRow,
  query: string | undefined,
  sessionId: string | undefined,
): HybridSearchScore {
  const reasons: string[] = [];
  const text = [
    row.kind,
    row.title,
    row.summary ?? "",
    ...row.goals,
    ...row.muscles,
    ...row.equipment,
    row.embeddingText ?? "",
  ].join(" ");
  const textMatch = scoreHybridTextMatch(query, text);
  const queryEmbedding = query ? createSearchEmbedding(query) : undefined;
  const rowEmbedding = parseSearchEmbedding(row.embedding) ?? (row.embeddingText ? createSearchEmbedding(row.embeddingText) : undefined);
  const vectorScore = queryEmbedding ? Math.max(0, cosineSimilarity(queryEmbedding, rowEmbedding)) * 35 : 0;
  const recencyScore = sessionId && row.sessionId === sessionId ? 12 : 0;
  const businessScore = recencyScore + (row.kind === "routine" ? 2 : 0);

  if (textMatch.matchedTerms.length > 0) {
    reasons.push(`全文匹配 ${textMatch.matchedTerms.join("、")}`);
  }

  if (vectorScore > 0) {
    reasons.push(`向量相似度 ${vectorScore.toFixed(2)}`);
  }

  if (recencyScore > 0) {
    reasons.push("当前会话优先");
  }

  const totalScore =
    query && textMatch.score === 0 && vectorScore < 18
      ? 0
      : textMatch.score + vectorScore + businessScore;

  return {
    textScore: textMatch.score,
    vectorScore,
    businessScore,
    totalScore,
    reasons,
  };
}

// Artifact embeddingText 只包含安全轻量索引字段，避免把完整 payload 或私密长文本推进向量层。
function withArtifactEmbedding(index: Omit<ArtifactIndex, "embeddingText" | "embedding">): ArtifactIndex {
  const embeddingText = buildEmbeddingText([
    index.kind,
    index.title,
    index.summary,
    index.goals,
    index.muscles,
    index.equipment,
    index.exerciseIds,
    index.sessionMinutes,
    index.weeklyFrequency,
    index.trainingDayCount,
  ]);

  return {
    ...index,
    embeddingText,
    embedding: createSearchEmbedding(embeddingText),
  };
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
