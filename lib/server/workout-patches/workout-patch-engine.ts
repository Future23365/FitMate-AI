import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  createConversationArtifactRevision,
  getArtifactPayload,
} from "@/lib/server/conversation-artifacts/artifact-service";
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
import type { ConversationArtifactPayload } from "@/lib/shared/conversation-artifacts/schema";
import {
  isExerciseAllowedInSection,
  normalizeExerciseMetadata,
} from "@/lib/shared/exercises/metadata";
import type { Exercise } from "@/lib/shared/exercises/types";
import {
  type ExerciseLocator,
  type WorkoutPatch,
  type WorkoutPatchDiffEntry,
  type WorkoutPatchOperation,
  type WorkoutPatchResult,
  workoutPatchSchema,
} from "@/lib/shared/workout-patches/schema";
import type {
  WorkoutPlanDraft,
  WorkoutPlanIntent,
  WorkoutPlanItemDraft,
  WorkoutRoutineDraft,
  WorkoutRoutineDraftItem,
  WorkoutRoutineSection,
} from "@/lib/shared/workout-plans/draft-schema";

type WorkoutPatchClient = Pick<
  PrismaClient,
  "artifactIndex" | "conversationArtifact" | "$transaction"
>;

type ApplyWorkoutPatchInput = {
  userId: string;
  rawPatch: unknown;
  responseMessageId?: string;
  client?: WorkoutPatchClient;
  exercises?: Exercise[];
  trace?: AiTraceLogger;
};

type LocatedDraftItem = {
  locator: ExerciseLocator;
  item: WorkoutRoutineDraftItem | WorkoutPlanItemDraft;
  sectionTitle: string;
  itemIndex: number;
  replaceItem(nextItem: WorkoutRoutineDraftItem | WorkoutPlanItemDraft): void;
  removeItem(): void;
  sectionItemCount(): number;
};

type ReplacementContext = {
  originalItem: WorkoutRoutineDraftItem | WorkoutPlanItemDraft;
  section: WorkoutRoutineSection;
  payload: WorkoutRoutineDraft | WorkoutPlanDraft;
  exercises: Exercise[];
  requestedReplacementId?: string;
  requireEasier?: boolean;
};

// PatchEngine 是训练草稿局部修改入口，负责读 artifact、应用单点修改、校验边界并写入新 revision。
export async function applyWorkoutPatch(input: ApplyWorkoutPatchInput): Promise<WorkoutPatchResult> {
  const parsedPatch = workoutPatchSchema.safeParse(input.rawPatch);

  if (!parsedPatch.success) {
    const result = failure("validation_failed", "Patch 输入缺少必要字段或格式不正确。", [
      JSON.stringify(parsedPatch.error.flatten()),
    ]);
    input.trace?.addStep({
      name: "Patch 输入结构校验失败",
      type: "validation",
      status: "failed",
      input: input.rawPatch,
      output: summarizeWorkoutPatchResultForTrace(result),
      error: parsedPatch.error.flatten(),
      metadata: { code: "patch_schema_invalid" },
    });
    return result;
  }

  const patch = parsedPatch.data;
  input.trace?.addStep({
    name: "Patch 输入结构校验通过",
    type: "validation",
    input: summarizeWorkoutPatchForTrace(patch),
    output: { valid: true },
  });
  const scopeBlock = validatePatchScope(patch);
  if (scopeBlock) {
    input.trace?.addStep({
      name: "Patch scope 被阻断",
      type: "validation",
      status: "failed",
      input: summarizeWorkoutPatchForTrace(patch),
      output: summarizeWorkoutPatchResultForTrace(scopeBlock),
      metadata: { code: scopeBlock.failureReasons[0] },
    });
    return scopeBlock;
  }

  const operation = patch.operations[0];
  if (
    patch.target.artifactId !== operation.target.artifactId ||
    patch.target.artifactKind !== operation.target.artifactKind
  ) {
    const result = failure("validation_failed", "Patch target 与 operation target 不一致。", [
      "target_mismatch",
    ]);
    input.trace?.addStep({
      name: "Patch target 校验失败",
      type: "validation",
      status: "failed",
      input: summarizeWorkoutPatchForTrace(patch),
      output: summarizeWorkoutPatchResultForTrace(result),
      metadata: { code: "target_mismatch" },
    });
    return result;
  }

  const payloadStartedAt = new Date().toISOString();
  const artifact = await getArtifactPayload({
    userId: input.userId,
    artifactId: patch.target.artifactId,
  }, input.client);
  input.trace?.addStep({
    name: "getArtifactPayload 受控工具调用",
    type: "tool_call",
    status: artifact.ok ? "success" : "failed",
    input: {
      toolName: "getArtifactPayload",
      artifactId: patch.target.artifactId,
      userId: input.userId,
    },
    output: artifact.ok
      ? {
          ok: true,
          artifactId: artifact.artifactId,
          kind: artifact.kind,
          payloadKind: isPatchablePayload(artifact.payload) ? artifact.payload.kind : "unsupported",
        }
      : artifact,
    metadata: {
      startedAt: payloadStartedAt,
      toolName: "getArtifactPayload",
      status: artifact.ok ? "success" : artifact.code,
    },
  });

  if (!artifact.ok) {
    const result = failure("validation_failed", artifact.message, [artifact.code]);
    input.trace?.addStep({
      name: "Patch artifact 权限或读取校验失败",
      type: "validation",
      status: "failed",
      output: summarizeWorkoutPatchResultForTrace(result),
      metadata: { code: artifact.code },
    });
    return result;
  }

  if (artifact.kind !== patch.target.artifactKind || !isPatchablePayload(artifact.payload)) {
    const result = failure("validation_failed", "Patch 目标 artifact 类型与 payload 不匹配。", [
      "artifact_kind_mismatch",
    ]);
    input.trace?.addStep({
      name: "Patch artifact 类型校验失败",
      type: "validation",
      status: "failed",
      output: summarizeWorkoutPatchResultForTrace(result),
      metadata: { code: "artifact_kind_mismatch" },
    });
    return result;
  }

  const exercises = input.exercises ?? await listAllExercises();
  const sourcePayload = artifact.payload;
  const nextPayload = clonePayload(sourcePayload);
  const located = locateDraftItem(nextPayload, operation.target);

  if (located.status !== "found") {
    input.trace?.addStep({
      name: "Patch 目标定位校验失败",
      type: "validation",
      status: "failed",
      output: summarizeWorkoutPatchResultForTrace(located),
      metadata: { code: located.failureReasons[0] },
    });
    return located;
  }

  const operationResult = applyPatchOperation({
    operation,
    located: located.item,
    payload: nextPayload,
    exercises,
  });

  if (operationResult.status !== "applied") {
    input.trace?.addStep({
      name: "Patch operation 校验失败",
      type: "validation",
      status: "failed",
      output: summarizeWorkoutPatchResultForTrace(operationResult),
      metadata: { code: operationResult.failureReasons[0] },
    });
    return operationResult;
  }

  const boundaryValidation = validatePatchBoundaries(sourcePayload, nextPayload, located.item.locator);
  if (boundaryValidation) {
    input.trace?.addStep({
      name: "Patch 边界校验失败",
      type: "validation",
      status: "failed",
      output: summarizeWorkoutPatchResultForTrace(boundaryValidation),
      metadata: { code: boundaryValidation.failureReasons[0] },
    });
    return boundaryValidation;
  }
  input.trace?.addStep({
    name: "Patch 边界校验通过",
    type: "validation",
    output: {
      valid: true,
      target: located.item.locator,
      diff: operationResult.diff,
    },
  });

  const revision = await createConversationArtifactRevision({
    userId: input.userId,
    sourceArtifactId: artifact.artifactId,
    messageId: input.responseMessageId,
    payload: nextPayload,
  }, input.client);

  if (!revision.ok) {
    const result = failure("validation_failed", revision.message, [revision.code]);
    input.trace?.addStep({
      name: "Patch revision 持久化失败",
      type: "persistence",
      status: "failed",
      output: summarizeWorkoutPatchResultForTrace(result),
      metadata: { code: revision.code },
    });
    return result;
  }
  input.trace?.addStep({
    name: "Patch revision 持久化成功",
    type: "persistence",
    output: {
      sourceArtifactId: artifact.artifactId,
      artifactId: revision.artifact.id,
      artifactKind: artifact.kind,
      revision: revision.artifact.revision,
    },
  });

  return {
    status: "applied",
    message: buildSuccessMessage(operationResult.diff[0], exercises),
    sourceArtifactId: artifact.artifactId,
    artifactId: revision.artifact.id,
    artifactKind: artifact.kind,
    payload: nextPayload,
    diff: operationResult.diff,
    suggestedReplies: [],
    failureReasons: [],
  };
}

function validatePatchScope(patch: WorkoutPatch): WorkoutPatchResult | null {
  if (patch.scope === "artifact_only") {
    return null;
  }

  return {
    status: "blocked",
    message: "这次修改需要覆盖已保存训练或日程，本版本先不直接写入，避免误改你的历史和未来安排。",
    sourceArtifactId: patch.target.artifactId,
    artifactKind: patch.target.artifactKind,
    diff: [],
    suggestedReplies: ["只修改当前聊天卡片", "先告诉我具体要改哪一次训练"],
    failureReasons: ["non_artifact_scope_requires_confirmation"],
  };
}

function applyPatchOperation(input: {
  operation: WorkoutPatchOperation;
  located: LocatedDraftItem;
  payload: WorkoutRoutineDraft | WorkoutPlanDraft;
  exercises: Exercise[];
}): WorkoutPatchResult {
  const { operation, located, payload, exercises } = input;
  const originalItem = cloneItem(located.item);

  if (operation.operation === "adjust_load") {
    const nextItem = cloneItem(located.item);
    if (operation.direction === "easier") {
      nextItem.target = Math.max(1, Math.floor(nextItem.target * 0.8));
      nextItem.sets = Math.max(1, nextItem.sets - 1);
    } else {
      nextItem.target = Math.min(600, Math.ceil(nextItem.target * 1.2));
      nextItem.sets = Math.min(8, nextItem.sets + 1);
    }
    located.replaceItem(nextItem);

    return appliedResult(payload, [{
      operation: "adjust_load",
      target: located.locator,
      originalExerciseId: originalItem.exerciseId,
      preservedFields: ["section", "order", "rest", "exerciseId"],
      changedFields: ["target", "sets"],
      reason: operation.reason || (operation.direction === "easier" ? "降低单个动作难度。" : "提高单个动作负荷。"),
    }]);
  }

  if (operation.operation === "remove_exercise" && !operation.replacementRequired) {
    if (located.sectionItemCount() <= 1) {
      return failure("validation_failed", "该阶段只有一个动作，不能在没有替代动作时直接移除。", [
        "section_would_be_empty",
      ]);
    }

    located.removeItem();
    return appliedResult(payload, [{
      operation: "remove_exercise",
      target: located.locator,
      originalExerciseId: originalItem.exerciseId,
      preservedFields: ["section", "order", "rest"],
      changedFields: ["exercise_removed"],
      reason: operation.reason || "移除单个动作。",
    }]);
  }

  const replacement = resolveReplacementExercise({
    originalItem,
    section: located.locator.section,
    payload,
    exercises,
    requestedReplacementId: operation.replacementExerciseId,
    requireEasier: operation.operation === "remove_exercise" || /简单|容易|轻松|太难|降低|难度/i.test(operation.reason ?? ""),
  });

  if (!replacement.ok) {
    return failure("validation_failed", replacement.message, replacement.reasons);
  }

  located.replaceItem({
    ...located.item,
    exerciseId: replacement.exercise.id,
  });

  return appliedResult(payload, [{
    operation: operation.operation,
    target: located.locator,
    originalExerciseId: originalItem.exerciseId,
    replacementExerciseId: replacement.exercise.id,
    preservedFields: ["section", "order", "sets", "target", "duration", "rest"],
    changedFields: ["exerciseId"],
    reason: operation.reason || "替换单个动作并保留执行参数。",
  }]);
}

function resolveReplacementExercise(context: ReplacementContext):
  | { ok: true; exercise: Exercise }
  | { ok: false; message: string; reasons: string[] } {
  const originalExercise = findExercise(context.exercises, context.originalItem.exerciseId);
  if (!originalExercise) {
    return {
      ok: false,
      message: "目标动作不在动作库中，无法安全选择替代动作。",
      reasons: ["original_exercise_not_found"],
    };
  }

  const intent = buildPatchCandidateIntent(context.payload, context.exercises);
  const candidates = selectExerciseCandidates(intent, context.exercises, {
    originalExerciseId: originalExercise.id,
    replacementDirection: context.requireEasier ? "regression" : "substitution",
  });
  const candidateIds = new Set(getCandidateExerciseIds(candidates));
  const requested = context.requestedReplacementId
    ? findExercise(context.exercises, context.requestedReplacementId)
    : undefined;

  if (context.requestedReplacementId) {
    if (!requested) {
      return {
        ok: false,
        message: "指定的替代动作不存在，不能写入训练草稿。",
        reasons: ["replacement_exercise_not_found"],
      };
    }

    const requestedValidation = validateReplacementExercise({
      replacement: requested,
      original: originalExercise,
      section: context.section,
      candidateIds,
      requireEasier: context.requireEasier,
    });

    if (requestedValidation.length > 0) {
      return {
        ok: false,
        message: "指定的替代动作不满足当前训练边界。",
        reasons: requestedValidation,
      };
    }

    return { ok: true, exercise: requested };
  }

  const allCandidates = sortReplacementCandidates([
    ...candidates.primaryCandidates,
    ...candidates.supplementaryCandidates,
  ], {
    originalExercise,
    direction: context.requireEasier ? "regression" : "substitution",
  });
  const replacement = allCandidates.find((candidate) => {
    if (candidate.exercise.id === originalExercise.id) {
      return false;
    }

    return validateReplacementExercise({
      replacement: candidate.exercise,
      original: originalExercise,
      section: context.section,
      candidateIds,
      requireEasier: context.requireEasier,
    }).length === 0;
  });

  if (!replacement) {
    return {
      ok: false,
      message: "没有找到满足阶段、器械和难度约束的替代动作。",
      reasons: ["replacement_candidate_insufficient"],
    };
  }

  return { ok: true, exercise: replacement.exercise };
}

function validateReplacementExercise(input: {
  replacement: Exercise;
  original: Exercise;
  section: WorkoutRoutineSection;
  candidateIds: Set<string>;
  requireEasier?: boolean;
}) {
  const reasons: string[] = [];

  if (!input.candidateIds.has(input.replacement.id)) {
    reasons.push("replacement_outside_candidate_set");
  }

  if (!isExerciseAllowedInSection(input.replacement, input.section)) {
    reasons.push("replacement_section_mismatch");
  }

  if (!matchesOriginalEquipment(input.original, input.replacement)) {
    reasons.push("replacement_equipment_mismatch");
  }

  if (levelRank(input.replacement) > levelRank(input.original)) {
    reasons.push("replacement_difficulty_too_high");
  }

  if (input.requireEasier && levelRank(input.replacement) >= levelRank(input.original)) {
    reasons.push("replacement_not_easier");
  }

  if (input.replacement.riskTags.some((tag) => /high|高风险|高冲击/.test(tag))) {
    reasons.push("replacement_risk_too_high");
  }

  return reasons;
}

function locateDraftItem(
  payload: WorkoutRoutineDraft | WorkoutPlanDraft,
  target: ExerciseLocator,
): WorkoutPatchResult | { status: "found"; item: LocatedDraftItem } {
  const matches: LocatedDraftItem[] = [];

  if (payload.kind === "routine") {
    payload.sections.forEach((section, sectionIndex) => {
      if (section.section !== target.section) {
        return;
      }

      section.items.forEach((item, itemIndex) => {
        if (item.exerciseId !== target.exerciseId) {
          return;
        }

        matches.push({
          locator: {
            ...target,
            occurrenceIndex: matches.length + 1,
          },
          item,
          sectionTitle: section.title,
          itemIndex,
          replaceItem(nextItem) {
            payload.sections[sectionIndex].items[itemIndex] = nextItem;
          },
          removeItem() {
            payload.sections[sectionIndex].items.splice(itemIndex, 1);
          },
          sectionItemCount() {
            return payload.sections[sectionIndex].items.length;
          },
        });
      });
    });
  } else {
    payload.days.forEach((day, dayIndex) => {
      if (target.cycleDayIndex && day.cycleDayIndex !== target.cycleDayIndex) {
        return;
      }

      day.sections.forEach((section, sectionIndex) => {
        if (section.section !== target.section) {
          return;
        }

        section.items.forEach((item, itemIndex) => {
          if (item.exerciseId !== target.exerciseId) {
            return;
          }

          matches.push({
            locator: {
              ...target,
              cycleDayIndex: day.cycleDayIndex,
              occurrenceIndex: matches.length + 1,
            },
            item,
            sectionTitle: section.title,
            itemIndex,
            replaceItem(nextItem) {
              payload.days[dayIndex].sections[sectionIndex].items[itemIndex] = nextItem;
            },
            removeItem() {
              payload.days[dayIndex].sections[sectionIndex].items.splice(itemIndex, 1);
            },
            sectionItemCount() {
              return payload.days[dayIndex].sections[sectionIndex].items.length;
            },
          });
        });
      });
    });
  }

  if (matches.length === 0) {
    return failure("validation_failed", "没有在目标 artifact 中找到要修改的动作。", [
      "target_exercise_not_found",
    ]);
  }

  if (!target.occurrenceIndex && matches.length > 1) {
    return {
      status: "ambiguous",
      message: "这个动作在训练内容中出现了多次，需要先确认要修改哪一次。",
      sourceArtifactId: target.artifactId,
      artifactKind: target.artifactKind,
      diff: [],
      suggestedReplies: matches.slice(0, 3).map((match) => `修改第 ${match.locator.occurrenceIndex} 个：${match.sectionTitle}`),
      failureReasons: ["target_occurrence_ambiguous"],
    };
  }

  const selected = target.occurrenceIndex
    ? matches[target.occurrenceIndex - 1]
    : matches[0];

  if (!selected) {
    return failure("validation_failed", "指定的 occurrenceIndex 超出目标动作出现次数。", [
      "occurrence_index_out_of_range",
    ]);
  }

  return { status: "found", item: selected };
}

function validatePatchBoundaries(
  sourcePayload: WorkoutRoutineDraft | WorkoutPlanDraft,
  nextPayload: WorkoutRoutineDraft | WorkoutPlanDraft,
  target: ExerciseLocator,
): WorkoutPatchResult | null {
  if (sourcePayload.kind !== nextPayload.kind) {
    return failure("validation_failed", "Patch 后训练草稿 kind 发生变化。", ["draft_kind_changed"]);
  }

  if (Math.abs(getEstimatedMinutes(sourcePayload) - getEstimatedMinutes(nextPayload)) > 5) {
    return failure("validation_failed", "Patch 后预估时长明显偏离原训练目标。", [
      "estimated_minutes_deviation",
    ]);
  }

  const targetPath = findTargetPath(sourcePayload, target);
  if (!targetPath) {
    return failure("validation_failed", "Patch 后无法校验目标动作位置。", [
      "target_path_not_found",
    ]);
  }

  const sourceComparable = stripTargetItemByPath(sourcePayload, targetPath);
  const nextComparable = stripTargetItemByPath(nextPayload, targetPath);
  if (JSON.stringify(sourceComparable) !== JSON.stringify(nextComparable)) {
    return failure("validation_failed", "Patch 修改了未点名的训练内容。", [
      "untargeted_content_changed",
    ]);
  }

  return null;
}

type TargetPath =
  | { kind: "routine"; sectionIndex: number; itemIndex: number }
  | { kind: "plan"; dayIndex: number; sectionIndex: number; itemIndex: number };

function findTargetPath(payload: WorkoutRoutineDraft | WorkoutPlanDraft, target: ExerciseLocator): TargetPath | null {
  let occurrence = 0;

  if (payload.kind === "routine") {
    for (const [sectionIndex, section] of payload.sections.entries()) {
      if (section.section !== target.section) {
        continue;
      }

      for (const [itemIndex, item] of section.items.entries()) {
        if (item.exerciseId !== target.exerciseId) {
          continue;
        }

        occurrence += 1;
        if ((target.occurrenceIndex ?? 1) === occurrence) {
          return { kind: "routine", sectionIndex, itemIndex };
        }
      }
    }

    return null;
  }

  for (const [dayIndex, day] of payload.days.entries()) {
    if (target.cycleDayIndex && day.cycleDayIndex !== target.cycleDayIndex) {
      continue;
    }

    for (const [sectionIndex, section] of day.sections.entries()) {
      if (section.section !== target.section) {
        continue;
      }

      for (const [itemIndex, item] of section.items.entries()) {
        if (item.exerciseId !== target.exerciseId) {
          continue;
        }

        occurrence += 1;
        if ((target.occurrenceIndex ?? 1) === occurrence) {
          return { kind: "plan", dayIndex, sectionIndex, itemIndex };
        }
      }
    }
  }

  return null;
}

function stripTargetItemByPath(payload: WorkoutRoutineDraft | WorkoutPlanDraft, path: TargetPath) {
  const copy = clonePayload(payload);

  if (path.kind === "routine" && copy.kind === "routine") {
    copy.sections[path.sectionIndex].items[path.itemIndex] = createComparableTargetItem(
      copy.sections[path.sectionIndex].items[path.itemIndex],
    );
    return copy;
  }

  if (path.kind === "plan" && copy.kind === "plan") {
    copy.days[path.dayIndex].sections[path.sectionIndex].items[path.itemIndex] = createComparableTargetItem(
      copy.days[path.dayIndex].sections[path.sectionIndex].items[path.itemIndex],
    );
  }

  return copy;
}

function createComparableTargetItem<T extends WorkoutRoutineDraftItem | WorkoutPlanItemDraft>(item: T): T {
  return {
    ...item,
    exerciseId: "__PATCH_TARGET__",
    mode: "reps",
    sets: 1,
    target: 1,
    setRestSeconds: 0,
    transitionRestSeconds: 0,
    notes: "__PATCH_TARGET__",
  };
}

function buildPatchCandidateIntent(
  payload: WorkoutRoutineDraft | WorkoutPlanDraft,
  exercises: Exercise[],
): WorkoutPlanIntent {
  return {
    intentType: payload.kind,
    goal: payload.goal,
    experience: "beginner",
    sessionMinutes: getEstimatedMinutes(payload),
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

function buildSuccessMessage(diff: WorkoutPatchDiffEntry, exercises: Exercise[]) {
  const originalName = findExercise(exercises, diff.originalExerciseId)?.nameZh ?? diff.originalExerciseId;
  const replacementName = diff.replacementExerciseId
    ? findExercise(exercises, diff.replacementExerciseId)?.nameZh ?? diff.replacementExerciseId
    : "";

  if (diff.operation === "adjust_load") {
    return `已只调整 ${originalName} 的执行参数，其他动作和休息配置保持不变。`;
  }

  if (diff.operation === "remove_exercise" && !diff.replacementExerciseId) {
    return `已移除 ${originalName}，其他训练内容保持不变。`;
  }

  return `已把 ${originalName} 替换为 ${replacementName}，组数、目标次数/时长和休息保持不变。`;
}

function appliedResult(
  payload: WorkoutRoutineDraft | WorkoutPlanDraft,
  diff: WorkoutPatchDiffEntry[],
): WorkoutPatchResult {
  return {
    status: "applied",
    message: "Patch 已应用。",
    artifactKind: payload.kind,
    payload,
    diff,
    suggestedReplies: [],
    failureReasons: [],
  };
}

function failure(
  status: Exclude<WorkoutPatchResult["status"], "applied" | "ambiguous">,
  message: string,
  reasons: string[],
): WorkoutPatchResult {
  return {
    status,
    message,
    diff: [],
    suggestedReplies: buildFailureReplies(status),
    failureReasons: reasons,
  };
}

function buildFailureReplies(status: WorkoutPatchResult["status"]) {
  if (status === "blocked") {
    return ["只修改当前聊天卡片", "先不要改已保存训练"];
  }

  return ["换一个动作试试", "说清楚要改哪一个动作"];
}

function isPatchablePayload(payload: ConversationArtifactPayload): payload is WorkoutRoutineDraft | WorkoutPlanDraft {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "kind" in payload &&
      ((payload as { kind?: unknown }).kind === "routine" || (payload as { kind?: unknown }).kind === "plan"),
  );
}

function getEstimatedMinutes(payload: WorkoutRoutineDraft | WorkoutPlanDraft) {
  return payload.kind === "routine" ? payload.estimatedSessionMinutes : payload.estimatedSessionMinutes;
}

function findExercise(exercises: Exercise[], exerciseId: string) {
  return exercises.find((exercise) => exercise.id === exerciseId);
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

function clonePayload<T extends WorkoutRoutineDraft | WorkoutPlanDraft>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T;
}

function cloneItem<T extends WorkoutRoutineDraftItem | WorkoutPlanItemDraft>(item: T): T {
  return JSON.parse(JSON.stringify(item)) as T;
}
