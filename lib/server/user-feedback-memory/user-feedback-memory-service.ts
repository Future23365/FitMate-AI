import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/server/db/prisma";
import { evaluateUserMemoryPolicy } from "@/lib/server/policy-confirmation/policy-engine";
import type { Exercise } from "@/lib/shared/exercises/types";
import {
  conversationMemoryStateSchema,
  userExerciseFeedbackInputSchema,
  userMemoryInputSchema,
  workoutCompletionFeedbackSchema,
  type ConversationMemoryState,
  type UserExerciseFeedbackInput,
  type UserMemoryInput,
  type WorkoutCompletionFeedback,
} from "@/lib/shared/user-feedback-memory/schema";
import type { WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";

type UserFeedbackMemoryClient = Pick<
  PrismaClient,
  "userMemory" | "userExerciseFeedback" | "workoutSessionResult" | "userProfile"
>;

type FeedbackSignalBundle = {
  memories: UserMemoryInput[];
  exerciseFeedback: UserExerciseFeedbackInput[];
};

const feedbackIntentPattern =
  /不喜欢|讨厌|不想做|别安排|不要安排|太难|太轻松|做不了|吃力|今天不想|今天不要|这次不想|肩|膝|腰|手腕|脚踝|疼|痛|不舒服|不适|拉伤|扭伤|以后都不要|再也不要/;

const bodyPartLabels = ["腿", "胸", "背", "肩", "核心", "手臂", "臀", "膝", "腰", "手腕", "脚踝"];

// 用户反馈写入入口，只处理明确表达的偏好、临时约束和健康信号。
export async function recordUserFeedbackFromChat(input: {
  userId: string;
  latestUserMessage: string;
  exercises: Exercise[];
  client?: UserFeedbackMemoryClient;
  now?: Date;
}) {
  if (!feedbackIntentPattern.test(input.latestUserMessage)) {
    return { memories: 0, exerciseFeedback: 0 };
  }

  const client = input.client ?? getPrismaClient();
  const signals = extractUserFeedbackSignals({
    latestUserMessage: input.latestUserMessage,
    exercises: input.exercises,
    now: input.now ?? new Date(),
  });
  const memoryPolicy = evaluateUserMemoryPolicy(signals.memories);

  if (memoryPolicy.requiresConfirmation) {
    applyMemoryConfirmationPolicy(signals, memoryPolicy.reasons.map((item) => item.code));
  }

  for (const memory of signals.memories) {
    await upsertUserMemory(client, input.userId, memory);
  }

  for (const feedback of signals.exerciseFeedback) {
    await upsertUserExerciseFeedback(client, input.userId, feedback);
  }

  return {
    memories: signals.memories.length,
    exerciseFeedback: signals.exerciseFeedback.length,
  };
}

// Conversation State Builder 汇总当前消息、显式画像、近期反馈和训练结果，供候选与计划服务读取。
export async function buildConversationMemoryState(input: {
  userId: string;
  latestUserMessage: string;
  exercises?: Exercise[];
  client?: UserFeedbackMemoryClient;
  now?: Date;
}): Promise<ConversationMemoryState> {
  const client = input.client ?? getPrismaClient();
  const now = input.now ?? new Date();
  const exercises = input.exercises ?? [];
  const currentSignals = extractCurrentMessageSignals(input.latestUserMessage, exercises, now);
  const [profile, memories, exerciseFeedback, workoutResults] = await Promise.all([
    client.userProfile.findUnique({ where: { userId: input.userId } }),
    client.userMemory.findMany({
      where: {
        userId: input.userId,
        status: { in: ["active", "pending_confirmation"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ requiresConfirmation: "asc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    client.userExerciseFeedback.findMany({
      where: {
        userId: input.userId,
        status: { in: ["active", "pending_confirmation"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ requiresConfirmation: "asc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    client.workoutSessionResult.findMany({
      where: { userId: input.userId },
      orderBy: { endedAt: "desc" },
      take: 5,
    }),
  ]);

  const profileMemories: UserMemoryInput[] = [
    ...(profile?.preferences ?? []).map((preference) => createProfileMemory("explicit_preference", preference)),
    ...(profile?.avoidances ?? []).map((avoidance) => createProfileMemory("constraint", avoidance)),
    ...(profile?.injuryLimitations ?? []).map((limitation) =>
      createProfileMemory("injury_or_pain_signal", limitation, "health"),
    ),
  ];

  return conversationMemoryStateSchema.parse({
    currentMessage: currentSignals,
    activeExerciseFeedback: exerciseFeedback.map((feedback) => ({
      exerciseId: feedback.exerciseId,
      kind: feedback.kind,
      confidence: feedback.confidence,
      requiresConfirmation: feedback.requiresConfirmation,
      status: feedback.status,
    })),
    activeMemories: [
      ...profileMemories.map((memory) => ({
        kind: memory.kind,
        subjectType: memory.subjectType,
        subjectId: memory.subjectId,
        subjectLabel: memory.subjectLabel,
        confidence: memory.confidence,
        requiresConfirmation: memory.requiresConfirmation,
        status: memory.status,
      })),
      ...memories.map((memory) => ({
        kind: memory.kind,
        subjectType: memory.subjectType,
        subjectId: memory.subjectId ?? undefined,
        subjectLabel: memory.subjectLabel ?? undefined,
        confidence: memory.confidence,
        requiresConfirmation: memory.requiresConfirmation,
        status: memory.status,
      })),
    ],
    recentWorkoutFeedback: workoutResults
      .map((result) => parseWorkoutResultFeedback(result.feedback, {
        completedExerciseCount: result.completedExerciseCount,
        totalExerciseCount: result.totalExerciseCount,
        durationSeconds: result.durationSeconds,
      }))
      .filter(Boolean),
  });
}

// 将记忆合并进训练意图时只补历史信息，当前消息已解析出的字段保持最高优先级。
export function mergeMemoryStateIntoWorkoutIntent(
  intent: WorkoutPlanIntent,
  memoryState: ConversationMemoryState | null,
): WorkoutPlanIntent {
  if (!memoryState) {
    return intent;
  }

  const currentText = `${intent.goal} ${intent.preferences.join(" ")} ${intent.avoidances.join(" ")}`;
  const avoidances = new Set(intent.avoidances);
  const preferences = new Set(intent.preferences);
  const injuryLimitations = new Set(intent.injuryLimitations);

  for (const label of memoryState.currentMessage.temporaryAvoidanceLabels) {
    if (!currentText.includes(label)) {
      avoidances.add(label);
    }
  }

  for (const memory of memoryState.activeMemories) {
    if (memory.status !== "active" || memory.requiresConfirmation) {
      continue;
    }

    const label = memory.subjectLabel?.trim();
    if (!label || currentText.includes(label)) {
      continue;
    }

    if (memory.kind === "explicit_preference") {
      preferences.add(label);
    } else if (memory.kind === "injury_or_pain_signal") {
      injuryLimitations.add(label);
    } else if (memory.kind === "constraint" || memory.kind === "temporary_context") {
      avoidances.add(label);
    }
  }

  return {
    ...intent,
    preferences: [...preferences],
    avoidances: [...avoidances],
    injuryLimitations: [...injuryLimitations],
  };
}

export function shouldUseConservativeProgression(memoryState?: ConversationMemoryState | null) {
  if (!memoryState) {
    return false;
  }

  return memoryState.recentWorkoutFeedback.some(
    (feedback) => feedback.completionRate < 0.7 || (feedback.subjectiveFatigue ?? 0) >= 8,
  );
}

export function formatMemoryStateForPrompt(memoryState: ConversationMemoryState | null) {
  if (!memoryState) {
    return "";
  }

  const activeMemories = memoryState.activeMemories
    .filter((memory) => memory.status === "active" && !memory.requiresConfirmation)
    .slice(0, 12)
    .map((memory) => `${memory.kind}:${memory.subjectLabel ?? memory.subjectId ?? memory.subjectType}`);
  const pendingMemories = memoryState.activeMemories
    .filter((memory) => memory.status === "pending_confirmation" || memory.requiresConfirmation)
    .slice(0, 8)
    .map((memory) => `${memory.kind}:${memory.subjectLabel ?? memory.subjectId ?? memory.subjectType}`);

  return [
    "serverUserMemory:",
    JSON.stringify(
      {
        priority: "currentMessage > currentArtifact > explicitProfile > recentFeedback > workoutResults > defaults",
        currentMessage: memoryState.currentMessage,
        activeMemories,
        pendingConfirmation: pendingMemories,
        recentWorkoutFeedback: memoryState.recentWorkoutFeedback,
      },
      null,
      2,
    ),
  ].join("\n");
}

export async function confirmUserMemory(input: {
  userId: string;
  memoryId: string;
  client?: UserFeedbackMemoryClient;
}) {
  const client = input.client ?? getPrismaClient();

  await client.userMemory.updateMany({
    where: { id: input.memoryId, userId: input.userId, status: "pending_confirmation" },
    data: { status: "active", requiresConfirmation: false },
  });
}

export function extractUserFeedbackSignals(input: {
  latestUserMessage: string;
  exercises: Exercise[];
  now: Date;
}): FeedbackSignalBundle {
  const text = input.latestUserMessage.trim();
  const matchedExercises = findMentionedExercises(text, input.exercises);
  const dislikedExercises = matchedExercises.filter((exercise) =>
    isExerciseMentionInContext(text, exercise, /不喜欢|讨厌|不想做|不要安排|别安排|以后都不要|再也不要/),
  );
  const tooHardExercises = matchedExercises.filter((exercise) =>
    isExerciseMentionInContext(text, exercise, /太难|做不了|吃力|困难/),
  );
  const isStrongLongTermConstraint = /以后|再也|永远|长期|都不要|永远不要/.test(text);
  const signals: FeedbackSignalBundle = { memories: [], exerciseFeedback: [] };

  if (/不喜欢|讨厌|不想做|不要安排|别安排|以后都不要|再也不要/.test(text)) {
    for (const exercise of dislikedExercises) {
      const requiresConfirmation = isStrongLongTermConstraint;
      signals.exerciseFeedback.push({
        exerciseId: exercise.id,
        kind: "dislike",
        value: { label: exercise.nameZh, rawText: text },
        confidence: 0.9,
        source: "chat",
        requiresConfirmation,
        status: requiresConfirmation ? "pending_confirmation" : "active",
      });
      signals.memories.push({
        kind: "exercise_feedback",
        subjectType: "exercise",
        subjectId: exercise.id,
        subjectLabel: exercise.nameZh,
        value: { feedback: "dislike", rawText: text },
        confidence: 0.9,
        source: "chat",
        requiresConfirmation,
        status: requiresConfirmation ? "pending_confirmation" : "active",
      });
    }
  }

  if (/太难|做不了|吃力|困难/.test(text)) {
    for (const exercise of tooHardExercises) {
      signals.exerciseFeedback.push({
        exerciseId: exercise.id,
        kind: "too_hard",
        value: { label: exercise.nameZh, rawText: text },
        confidence: 0.85,
        source: "chat",
      });
      signals.memories.push({
        kind: "exercise_feedback",
        subjectType: "exercise",
        subjectId: exercise.id,
        subjectLabel: exercise.nameZh,
        value: { feedback: "too_hard", rawText: text },
        confidence: 0.85,
        source: "chat",
      });
    }
  }

  const temporaryAvoidanceLabels = extractTemporaryAvoidanceLabels(text);
  for (const label of temporaryAvoidanceLabels) {
    signals.memories.push({
      kind: "temporary_context",
      subjectType: "body_part",
      subjectLabel: label,
      value: { avoidance: label, rawText: text },
      confidence: 0.8,
      source: "chat",
      expiresAt: addHours(input.now, 36),
    });
  }

  const healthSignalLabels = extractHealthSignalLabels(text);
  for (const label of healthSignalLabels) {
    signals.memories.push({
      kind: "injury_or_pain_signal",
      subjectType: "health",
      subjectLabel: label,
      value: { signal: label, rawText: text },
      confidence: 0.75,
      source: "chat",
      requiresConfirmation: true,
      status: "pending_confirmation",
    });
  }

  return signals;
}

function applyMemoryConfirmationPolicy(signals: FeedbackSignalBundle, reasonCodes: string[]) {
  const shouldConfirmHealthSignals = reasonCodes.includes("health_signal_requires_confirmation");
  const shouldConfirmLongTermSignals = reasonCodes.includes("long_term_memory_requires_confirmation");

  signals.memories = signals.memories.map((memory) => {
    if (
      (memory.kind === "injury_or_pain_signal" && shouldConfirmHealthSignals) ||
      (memory.requiresConfirmation && shouldConfirmLongTermSignals)
    ) {
      return {
        ...memory,
        requiresConfirmation: true,
        status: "pending_confirmation",
      };
    }

    return memory;
  });
  signals.exerciseFeedback = signals.exerciseFeedback.map((feedback) => {
    if (feedback.requiresConfirmation && shouldConfirmLongTermSignals) {
      return {
        ...feedback,
        requiresConfirmation: true,
        status: "pending_confirmation",
      };
    }

    return feedback;
  });
}

function extractCurrentMessageSignals(text: string, exercises: Exercise[], now: Date) {
  const signals = extractUserFeedbackSignals({ latestUserMessage: text, exercises, now });
  const requestedExerciseIds = findMentionedExercises(text, exercises)
    .filter(() => /想试|试试|安排|推荐|做|练/.test(text) && !/不喜欢|不要|别|太难/.test(text))
    .map((exercise) => exercise.id);

  return {
    requestedExerciseIds,
    dislikedExerciseIds: signals.exerciseFeedback
      .filter((feedback) => feedback.kind === "dislike")
      .map((feedback) => feedback.exerciseId),
    tooHardExerciseIds: signals.exerciseFeedback
      .filter((feedback) => feedback.kind === "too_hard")
      .map((feedback) => feedback.exerciseId),
    temporaryAvoidanceLabels: signals.memories
      .filter((memory) => memory.kind === "temporary_context")
      .map((memory) => memory.subjectLabel)
      .filter(Boolean),
    healthSignalLabels: signals.memories
      .filter((memory) => memory.kind === "injury_or_pain_signal")
      .map((memory) => memory.subjectLabel)
      .filter(Boolean),
  };
}

async function upsertUserMemory(
  client: UserFeedbackMemoryClient,
  userId: string,
  rawMemory: UserMemoryInput,
) {
  const memory = userMemoryInputSchema.parse(rawMemory);
  const existing = await client.userMemory.findFirst({
    where: {
      userId,
      kind: memory.kind,
      subjectType: memory.subjectType,
      subjectId: memory.subjectId ?? null,
      subjectLabel: memory.subjectLabel ?? null,
      status: { in: ["active", "pending_confirmation"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const data = {
    kind: memory.kind,
    subjectType: memory.subjectType,
    subjectId: memory.subjectId,
    subjectLabel: memory.subjectLabel,
    value: toInputJson(memory.value),
    confidence: memory.confidence,
    source: memory.source,
    expiresAt: memory.expiresAt,
    requiresConfirmation: memory.requiresConfirmation,
    status: memory.status,
  };

  if (existing) {
    return client.userMemory.update({ where: { id: existing.id }, data });
  }

  return client.userMemory.create({ data: { ...data, userId } });
}

async function upsertUserExerciseFeedback(
  client: UserFeedbackMemoryClient,
  userId: string,
  rawFeedback: UserExerciseFeedbackInput,
) {
  const feedback = userExerciseFeedbackInputSchema.parse(rawFeedback);
  const existing = await client.userExerciseFeedback.findFirst({
    where: {
      userId,
      exerciseId: feedback.exerciseId,
      kind: feedback.kind,
      status: { in: ["active", "pending_confirmation"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const data = {
    exerciseId: feedback.exerciseId,
    kind: feedback.kind,
    value: toInputJson(feedback.value),
    confidence: feedback.confidence,
    source: feedback.source,
    expiresAt: feedback.expiresAt,
    requiresConfirmation: feedback.requiresConfirmation,
    status: feedback.status,
  };

  if (existing) {
    return client.userExerciseFeedback.update({ where: { id: existing.id }, data });
  }

  return client.userExerciseFeedback.create({ data: { ...data, userId } });
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonObject;
}

function findMentionedExercises(text: string, exercises: Exercise[]) {
  const normalizedText = normalizeText(text);

  return exercises.filter((exercise) => {
    const names = [exercise.nameZh, exercise.nameEn, exercise.id].map(normalizeText).filter(Boolean);

    return names.some((name) => name.length >= 2 && normalizedText.includes(name));
  });
}

function isExerciseMentionInContext(text: string, exercise: Exercise, pattern: RegExp) {
  const clauses = text.split(/[，,。；;！!？?\n]/).map(normalizeText).filter(Boolean);
  const names = [exercise.nameZh, exercise.nameEn, exercise.id].map(normalizeText).filter(Boolean);

  return clauses.some((clause) =>
    names.some((name) => name.length >= 2 && clause.includes(name)) && pattern.test(clause),
  );
}

function extractTemporaryAvoidanceLabels(text: string) {
  const temporaryClauses = text
    .split(/[，,。；;！!？?\n]/)
    .filter((clause) => /(今天|今晚|这次|本次|现在).*(不想|不要|别)/.test(clause));
  if (temporaryClauses.length === 0) {
    return [];
  }

  return bodyPartLabels.filter((label) => temporaryClauses.some((clause) => clause.includes(label)));
}

function extractHealthSignalLabels(text: string) {
  const healthClauses = text
    .split(/[，,。；;！!？?\n]/)
    .filter((clause) => /疼|痛|不舒服|不适|拉伤|扭伤|伤/.test(clause));
  if (healthClauses.length === 0) {
    return [];
  }

  const labels = bodyPartLabels.filter((label) => healthClauses.some((clause) => clause.includes(label)));

  return labels.length ? labels : ["身体不适"];
}

function createProfileMemory(
  kind: UserMemoryInput["kind"],
  label: string,
  subjectType: UserMemoryInput["subjectType"] = "general",
): UserMemoryInput {
  return {
    kind,
    subjectType,
    subjectLabel: label,
    value: { label },
    confidence: 1,
    source: "profile",
  };
}

function parseWorkoutResultFeedback(
  rawFeedback: unknown,
  fallback: {
    completedExerciseCount: number;
    totalExerciseCount: number;
    durationSeconds: number;
  },
): WorkoutCompletionFeedback | null {
  const parsed = workoutCompletionFeedbackSchema.safeParse(rawFeedback);

  if (parsed.success) {
    return parsed.data;
  }

  if (fallback.totalExerciseCount <= 0) {
    return null;
  }

  return workoutCompletionFeedbackSchema.parse({
    completionRate: fallback.completedExerciseCount / fallback.totalExerciseCount,
    skippedExerciseIds: [],
    actualDurationSeconds: fallback.durationSeconds,
  });
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
