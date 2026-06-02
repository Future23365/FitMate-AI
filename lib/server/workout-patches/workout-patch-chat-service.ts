import "server-only";

import { getArtifactPayload } from "@/lib/server/conversation-artifacts/artifact-service";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import {
  summarizeWorkoutPatchForTrace,
  summarizeWorkoutPatchResultForTrace,
} from "@/lib/server/dev/ai-run-trace";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import {
  getCandidateExerciseIds,
  selectExerciseCandidates,
  sortReplacementCandidates,
} from "@/lib/server/workout-plans/exercise-candidate-service";
import { applyWorkoutPatch } from "@/lib/server/workout-patches/workout-patch-engine";
import { normalizeExerciseMetadata, isExerciseAllowedInSection } from "@/lib/shared/exercises/metadata";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { ResolvedActionKind } from "@/lib/shared/chat/resolved-intent";
import type { PendingReplacementSelection } from "@/lib/shared/chat/fitness-conversation-context";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
import type { ConversationMemoryState } from "@/lib/shared/user-feedback-memory/schema";
import type { AssistantSuggestion } from "@/lib/shared/chat/assistant-suggestions";
import type {
  WorkoutPlanDraft,
  WorkoutPlanItemDraft,
  WorkoutPlanIntent,
  WorkoutRoutineDraft,
  WorkoutRoutineDraftItem,
  WorkoutRoutineSection,
} from "@/lib/shared/workout-plans/draft-schema";
import type { WorkoutPatch, WorkoutPatchResult } from "@/lib/shared/workout-patches/schema";

type BuildAndApplyWorkoutPatchInput = {
  userId: string;
  latestUserMessage: string;
  actionKind: ResolvedActionKind;
  referenceResolution: Extract<ReferenceResolution, { status: "resolved" }>;
  responseMessageId?: string;
  memoryState?: ConversationMemoryState;
  pendingReplacementSelection?: PendingReplacementSelection;
  now?: Date;
  trace?: AiTraceLogger;
};

type PatchableItem = {
  exerciseId: string;
  section: "warmup" | "training" | "stretch";
  cycleDayIndex?: number;
};

type ReplacementCandidate = {
  exercise: Exercise;
};

export type WorkoutPatchChatResult =
  | {
      handled: true;
      result: WorkoutPatchResult;
    }
  | {
      handled: false;
      reason: "not_patch_intent" | "unsupported_artifact" | "target_not_found";
    };

// 聊天 Patch 编排把自然语言局部修改转成受控 Patch，LLM 不直接接触 artifact payload 写入。
export async function buildAndApplyWorkoutPatchFromChat(
  input: BuildAndApplyWorkoutPatchInput,
): Promise<WorkoutPatchChatResult> {
  if (
    !shouldAttemptWorkoutPatch(input.latestUserMessage, input.referenceResolution, input.actionKind) &&
    !isPendingReplacementSelectionMessage(input)
  ) {
    input.trace?.addStep({
      name: "Patch 意图检查未命中",
      type: "patch_proposal",
      output: { handled: false, reason: "not_patch_intent" },
      metadata: {
        artifactId: input.referenceResolution.artifactId,
        artifactKind: input.referenceResolution.artifactKind,
      },
    });
    return { handled: false, reason: "not_patch_intent" };
  }

  const payloadStartedAt = toUtcISOString(new Date());
  const artifact = await getArtifactPayload({
    userId: input.userId,
    artifactId: input.referenceResolution.artifactId,
  });
  input.trace?.addStep({
    name: "getArtifactPayload 受控工具调用",
    type: "tool_call",
    status: artifact.ok ? "success" : "failed",
    input: {
      toolName: "getArtifactPayload",
      artifactId: input.referenceResolution.artifactId,
      userId: input.userId,
    },
    output: artifact.ok
      ? {
          ok: true,
          artifactId: artifact.artifactId,
          kind: artifact.kind,
          payloadKind: isWorkoutDraftPayload(artifact.payload) ? artifact.payload.kind : "unsupported",
          title: isWorkoutDraftPayload(artifact.payload) ? artifact.payload.title : undefined,
        }
      : artifact,
    metadata: {
      startedAt: payloadStartedAt,
      toolName: "getArtifactPayload",
      status: artifact.ok ? "success" : artifact.code,
    },
  });

  if (!artifact.ok || (artifact.kind !== "routine" && artifact.kind !== "plan") || !isWorkoutDraftPayload(artifact.payload)) {
    input.trace?.addStep({
      name: "Patch 目标 artifact 不支持",
      type: "patch_proposal",
      status: "failed",
      output: { handled: false, reason: "unsupported_artifact" },
      metadata: {
        artifactId: input.referenceResolution.artifactId,
        artifactKind: input.referenceResolution.artifactKind,
      },
    });
    return { handled: false, reason: "unsupported_artifact" };
  }

  const exercises = await listAllExercises();
  const target = resolvePatchTarget(input.latestUserMessage, artifact.payload, exercises) ??
    resolvePendingPatchTarget({
      message: input.latestUserMessage,
      payload: artifact.payload,
      exercises,
      pending: input.pendingReplacementSelection,
      artifactId: artifact.artifactId,
      artifactKind: artifact.kind,
      now: input.now ?? new Date(),
    });
  if (!target) {
    input.trace?.addStep({
      name: "Patch 目标定位失败",
      type: "patch_proposal",
      status: "failed",
      input: {
        artifactId: artifact.artifactId,
        artifactKind: artifact.kind,
        latestUserMessage: input.latestUserMessage,
      },
      output: {
        status: "ambiguous",
        failureReasons: ["patch_target_not_found"],
      },
      metadata: {
        code: "patch_target_not_found",
      },
    });
    return {
      handled: true,
      result: {
        status: "ambiguous",
        message: "我找到了这张训练卡片，但没能安全定位你想修改的动作。请直接说动作名，例如“把俯卧撑换掉”。",
        sourceArtifactId: artifact.artifactId,
        artifactKind: artifact.kind,
        diff: [],
        suggestedReplies: ["把俯卧撑换掉", "降低平板支撑难度"],
        failureReasons: ["patch_target_not_found"],
      },
    };
  }

  const operationType = inferPatchOperation(input.latestUserMessage);
  const replacementCandidates = operationType === "replace_exercise"
    ? selectReplacementCandidatesForTarget({
        payload: artifact.payload,
        target,
        exercises,
        memoryState: input.memoryState,
        latestUserMessage: input.latestUserMessage,
        trace: input.trace,
      })
    : [];
  const replacementExercise = operationType === "replace_exercise"
    ? resolveReplacementCandidateFromMessage(input.latestUserMessage, replacementCandidates, input.pendingReplacementSelection)
    : null;

  if (operationType === "replace_exercise" && !replacementExercise) {
    if (replacementCandidates.length === 0) {
      return {
        handled: true,
        result: {
          status: "validation_failed",
          message: "我已定位到要替换的动作，但当前动作库里没有找到满足阶段、器械和难度边界的替代动作。",
          sourceArtifactId: artifact.artifactId,
          artifactKind: artifact.kind,
          diff: [],
          suggestedReplies: ["换一个动作试试", "说明想要更简单还是同类型替代"],
          failureReasons: ["replacement_candidate_insufficient"],
        },
      };
    }

    const pending = createPendingReplacementSelection({
      artifactId: artifact.artifactId,
      artifactKind: artifact.kind,
      sourceExerciseId: target.exerciseId,
      sourceExerciseName: getExerciseDisplayName(exercises, target.exerciseId),
      candidates: replacementCandidates,
      now: input.now ?? new Date(),
    });
    const assistantSuggestions = buildReplacementCandidateSuggestions(pending);
    const result: WorkoutPatchResult = {
      status: "ambiguous",
      message: `我已定位到 ${pending.sourceExerciseName}。请选择一个替代动作，我会只替换这个动作并保留组数、目标和休息。`,
      sourceArtifactId: artifact.artifactId,
      artifactKind: artifact.kind,
      diff: [],
      assistantSuggestions,
      pendingReplacementSelection: pending,
      suggestedReplies: assistantSuggestions.map((suggestion) => suggestion.message),
      failureReasons: ["replacement_selection_required"],
    };

    input.trace?.addStep({
      name: "替换候选 pending selection",
      type: "patch_proposal",
      output: {
        pendingReplacementSelection: pending,
        assistantSuggestions,
      },
      metadata: {
        candidateCount: pending.candidateExerciseIds.length,
        sourceExerciseId: pending.sourceExerciseId,
        source: "pending_replacement_selection",
      },
    });

    return {
      handled: true,
      result,
    };
  }

  const patch: WorkoutPatch = {
    scope: "artifact_only",
    target: {
      artifactId: artifact.artifactId,
      artifactKind: artifact.kind,
    },
    operations: [
      {
        operation: operationType,
        target: {
          artifactId: artifact.artifactId,
          artifactKind: artifact.kind,
          section: target.section,
          cycleDayIndex: target.cycleDayIndex,
          exerciseId: target.exerciseId,
        },
        reason: input.latestUserMessage,
        ...(replacementExercise ? { replacementExerciseId: replacementExercise.id } : {}),
        ...(operationType === "remove_exercise"
          ? { replacementRequired: true }
          : {}),
      } as WorkoutPatch["operations"][number],
    ],
    reason: input.latestUserMessage,
  };
  input.trace?.addStep({
    name: "WorkoutPatch 提出",
    type: "patch_proposal",
    input: {
      latestUserMessage: input.latestUserMessage,
      referenceResolution: input.referenceResolution,
    },
    output: summarizeWorkoutPatchForTrace(patch),
    metadata: {
      scope: patch.scope,
      operation: patch.operations[0]?.operation,
      targetArtifactId: patch.target.artifactId,
      targetArtifactKind: patch.target.artifactKind,
    },
  });

  const result = await applyWorkoutPatch({
    userId: input.userId,
    rawPatch: patch,
    responseMessageId: input.responseMessageId,
    exercises,
    memoryState: input.memoryState,
    trace: input.trace,
  });
  input.trace?.addStep({
    name: "WorkoutPatch 应用结果",
    type: "patch_proposal",
    status: result.status === "applied" ? "success" : "failed",
    output: summarizeWorkoutPatchResultForTrace(result),
    metadata: {
      resultStatus: result.status,
      code: result.failureReasons[0],
    },
  });

  return {
    handled: true,
    result,
  };
}

function isPendingReplacementSelectionMessage(input: BuildAndApplyWorkoutPatchInput) {
  if (!input.pendingReplacementSelection || input.actionKind !== "exercise_replacement") {
    return false;
  }

  const now = input.now ?? new Date();
  return input.referenceResolution.artifactId === input.pendingReplacementSelection.artifactId &&
    input.referenceResolution.artifactKind === input.pendingReplacementSelection.artifactKind &&
    Date.parse(input.pendingReplacementSelection.expiresAt) > now.getTime() &&
    input.pendingReplacementSelection.candidateExerciseNames.some((name) =>
      normalizeText(input.latestUserMessage).includes(normalizeText(name)),
    );
}

export function shouldAttemptWorkoutPatch(
  message: string,
  resolution: ReferenceResolution | null,
  actionKind: ResolvedActionKind,
) {
  if (actionKind !== "workout_patch" && actionKind !== "exercise_replacement") {
    return false;
  }

  if (resolution?.status !== "resolved") {
    return false;
  }

  if (resolution.artifactKind !== "routine" && resolution.artifactKind !== "plan") {
    return false;
  }

  return /换掉|换成|替换|改成|太难|简单点|容易点|降低|删掉|删除|移除|去掉|不要/.test(message);
}

export function formatWorkoutPatchReply(result: WorkoutPatchResult) {
  if (result.failureReasons.includes("replacement_selection_required")) {
    return result.message;
  }

  if (result.status === "applied") {
    return `${result.message}\n\n我已经生成了新的训练卡片 revision，原卡片仍可追溯读取。`;
  }

  if (result.status === "ambiguous") {
    return result.message;
  }

  if (result.status === "blocked") {
    return result.message;
  }

  if (result.status === "confirmation_required") {
    return result.confirmation
      ? `${result.message}\n\n${result.confirmation.question}\n${result.confirmation.impactSummary}\n${result.confirmation.diffSummary}`
      : result.message;
  }

  return `${result.message} 你可以换个动作名，或说明要改哪一个训练日/阶段。`;
}

function resolvePatchTarget(
  message: string,
  payload: WorkoutRoutineDraft | WorkoutPlanDraft,
  exercises: Exercise[],
): PatchableItem | null {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const items = collectPatchableItems(payload);
  const normalizedMessage = normalizeText(message);

  return items.find((item) => {
    const exercise = exerciseById.get(item.exerciseId);
    if (!exercise) {
      return normalizedMessage.includes(normalizeText(item.exerciseId));
    }

    return [
      exercise.id,
      exercise.nameZh,
      exercise.nameEn,
      ...exercise.primaryMusclesZh,
    ].some((name) => normalizedMessage.includes(normalizeText(name)));
  }) ?? null;
}

function resolvePendingPatchTarget(input: {
  message: string;
  payload: WorkoutRoutineDraft | WorkoutPlanDraft;
  exercises: Exercise[];
  pending?: PendingReplacementSelection;
  artifactId: string;
  artifactKind: "routine" | "plan";
  now: Date;
}): PatchableItem | null {
  if (
    !input.pending ||
    input.pending.artifactId !== input.artifactId ||
    input.pending.artifactKind !== input.artifactKind ||
    Date.parse(input.pending.expiresAt) <= input.now.getTime()
  ) {
    return null;
  }

  const normalizedMessage = normalizeText(input.message);
  const candidateMatched = input.pending.candidateExerciseIds.some((candidateId, index) => {
    const exercise = input.exercises.find((item) => item.id === candidateId);
    const displayName = input.pending?.candidateExerciseNames[index];
    return [candidateId, displayName, exercise?.nameZh, exercise?.nameEn]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizedMessage.includes(normalizeText(value)));
  });

  if (!candidateMatched) {
    return null;
  }

  return collectPatchableItems(input.payload).find((item) => item.exerciseId === input.pending?.sourceExerciseId) ?? null;
}

function collectPatchableItems(payload: WorkoutRoutineDraft | WorkoutPlanDraft): PatchableItem[] {
  if (payload.kind === "routine") {
    return payload.sections.flatMap((section) =>
      section.items.map((item: WorkoutRoutineDraftItem) => ({
        exerciseId: item.exerciseId,
        section: section.section,
      })),
    );
  }

  return payload.days.flatMap((day) =>
    day.sections.flatMap((section) =>
      section.items.map((item: WorkoutPlanItemDraft) => ({
        exerciseId: item.exerciseId,
        section: section.section,
        cycleDayIndex: day.cycleDayIndex,
      })),
    ),
  );
}

function inferPatchOperation(message: string): "replace_exercise" | "adjust_load" | "remove_exercise" {
  if (/删掉|删除|移除|去掉|不要/.test(message)) {
    return "remove_exercise";
  }

  if (/太难|降低|简单点|容易点/.test(message) && !/换|替换|换成|改成/.test(message)) {
    return "adjust_load";
  }

  return "replace_exercise";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function selectReplacementCandidatesForTarget(input: {
  payload: WorkoutRoutineDraft | WorkoutPlanDraft;
  target: PatchableItem;
  exercises: Exercise[];
  memoryState?: ConversationMemoryState;
  latestUserMessage: string;
  trace?: AiTraceLogger;
}): ReplacementCandidate[] {
  const originalExercise = input.exercises.find((exercise) => exercise.id === input.target.exerciseId);
  if (!originalExercise) {
    return [];
  }

  const requireEasier = /简单|容易|轻松|太难|降低|难度/i.test(input.latestUserMessage);
  const candidates = selectExerciseCandidates(buildPatchCandidateIntent(input.payload, input.exercises), input.exercises, {
    originalExerciseId: originalExercise.id,
    replacementDirection: requireEasier ? "regression" : "substitution",
    memoryState: input.memoryState,
  });
  const candidateIds = new Set(getCandidateExerciseIds(candidates));
  const sorted = sortReplacementCandidates([
    ...candidates.primaryCandidates,
    ...candidates.supplementaryCandidates,
  ], {
    originalExercise,
    direction: requireEasier ? "regression" : "substitution",
  });
  const replacements = sorted
    .filter((candidate) => candidate.exercise.id !== originalExercise.id)
    .filter((candidate) => validateReplacementCandidate({
      replacement: candidate.exercise,
      original: originalExercise,
      section: input.target.section,
      candidateIds,
      requireEasier,
    }))
    .slice(0, 3)
    .map((candidate) => ({ exercise: candidate.exercise }));

  input.trace?.addStep({
    name: "替换候选建议生成",
    type: "candidate_selection",
    input: {
      originalExerciseId: originalExercise.id,
      section: input.target.section,
      requireEasier,
    },
    output: {
      visibleCandidateIds: replacements.map((candidate) => candidate.exercise.id),
      recommendationTrace: candidates.recommendationTrace,
    },
    metadata: {
      finalCount: replacements.length,
      source: "pending_replacement_selection",
    },
  });

  return replacements;
}

function validateReplacementCandidate(input: {
  replacement: Exercise;
  original: Exercise;
  section: WorkoutRoutineSection;
  candidateIds: Set<string>;
  requireEasier: boolean;
}) {
  if (!input.candidateIds.has(input.replacement.id)) {
    return false;
  }

  if (!isExerciseAllowedInSection(input.replacement, input.section)) {
    return false;
  }

  if (!matchesOriginalEquipment(input.original, input.replacement)) {
    return false;
  }

  if (levelRank(input.replacement) > levelRank(input.original)) {
    return false;
  }

  return !input.requireEasier || levelRank(input.replacement) < levelRank(input.original);
}

function resolveReplacementCandidateFromMessage(
  message: string,
  candidates: ReplacementCandidate[],
  pending?: PendingReplacementSelection,
) {
  const allowedIds = new Set(pending?.candidateExerciseIds ?? candidates.map((candidate) => candidate.exercise.id));
  const normalizedMessage = normalizeText(message);
  const matches = candidates
    .map((candidate) => candidate.exercise)
    .filter((exercise) => allowedIds.has(exercise.id))
    .filter((exercise) =>
      [exercise.id, exercise.nameZh, exercise.nameEn]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizedMessage.includes(normalizeText(value))),
    );

  return matches.length === 1 ? matches[0] : null;
}

function createPendingReplacementSelection(input: {
  artifactId: string;
  artifactKind: "routine" | "plan";
  sourceExerciseId: string;
  sourceExerciseName: string;
  candidates: ReplacementCandidate[];
  now: Date;
}): PendingReplacementSelection {
  const expiresAt = new Date(input.now.getTime() + 10 * 60 * 1000);
  const visibleCandidates = input.candidates.slice(0, 3);

  return {
    artifactId: input.artifactId,
    artifactKind: input.artifactKind,
    sourceExerciseId: input.sourceExerciseId,
    sourceExerciseName: input.sourceExerciseName,
    candidateExerciseIds: visibleCandidates.map((candidate) => candidate.exercise.id),
    candidateExerciseNames: visibleCandidates.map((candidate) => getExerciseDisplayName([candidate.exercise], candidate.exercise.id)),
    createdAt: toUtcISOString(input.now),
    expiresAt: toUtcISOString(expiresAt),
  };
}

function buildReplacementCandidateSuggestions(selection: PendingReplacementSelection): AssistantSuggestion[] {
  return selection.candidateExerciseIds.map((candidateId, index) => {
    const replacementName = selection.candidateExerciseNames[index] ?? candidateId;
    return {
      label: replacementName,
      message: `把${selection.sourceExerciseName}换成${replacementName}`,
      kind: "confirmation",
      blocking: true,
      source: "workout_patch",
    };
  });
}

function getExerciseDisplayName(exercises: Exercise[], exerciseId: string) {
  const exercise = exercises.find((item) => item.id === exerciseId);
  return exercise?.nameZh || exercise?.nameEn || exerciseId;
}

function buildPatchCandidateIntent(
  payload: WorkoutRoutineDraft | WorkoutPlanDraft,
  exercises: Exercise[],
): WorkoutPlanIntent {
  return {
    intentType: payload.kind,
    goal: payload.goal,
    experience: "beginner",
    sessionMinutes: payload.estimatedSessionMinutes,
    weeklyFrequency: payload.kind === "plan" ? payload.weeklyFrequency ?? 1 : 1,
    equipment: inferPayloadEquipment(payload, exercises),
    injuryLimitations: [],
    preferences: [],
    avoidances: [],
  };
}

function inferPayloadEquipment(payload: WorkoutRoutineDraft | WorkoutPlanDraft, exercises: Exercise[]) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const ids = payload.kind === "routine"
    ? payload.sections.flatMap((section) => section.items.map((item) => item.exerciseId))
    : payload.days.flatMap((day) =>
        day.sections.flatMap((section) => section.items.map((item) => item.exerciseId)),
      );

  return [
    ...new Set(
      ids
        .map((id) => exerciseById.get(id)?.equipmentZh ?? exerciseById.get(id)?.equipment)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function matchesOriginalEquipment(original: Exercise, replacement: Exercise) {
  const originalEquipment = original.equipmentZh ?? original.equipment;
  const replacementEquipment = replacement.equipmentZh ?? replacement.equipment;

  if (!originalEquipment || originalEquipment === "其他") {
    return true;
  }

  return originalEquipment === replacementEquipment;
}

function levelRank(exercise: Exercise) {
  const difficulty = normalizeExerciseMetadata(exercise).difficulty;
  const ranks: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  return ranks[difficulty ?? ""] ?? 2;
}

function isWorkoutDraftPayload(payload: unknown): payload is WorkoutRoutineDraft | WorkoutPlanDraft {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "kind" in payload &&
      ((payload as { kind?: unknown }).kind === "routine" || (payload as { kind?: unknown }).kind === "plan"),
  );
}
