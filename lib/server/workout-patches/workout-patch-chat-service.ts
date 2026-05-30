import "server-only";

import { getArtifactPayload } from "@/lib/server/conversation-artifacts/artifact-service";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import {
  summarizeWorkoutPatchForTrace,
  summarizeWorkoutPatchResultForTrace,
} from "@/lib/server/dev/ai-run-trace";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { applyWorkoutPatch } from "@/lib/server/workout-patches/workout-patch-engine";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
import type { Exercise } from "@/lib/shared/exercises/types";
import type {
  WorkoutPlanDraft,
  WorkoutPlanItemDraft,
  WorkoutRoutineDraft,
  WorkoutRoutineDraftItem,
} from "@/lib/shared/workout-plans/draft-schema";
import type { WorkoutPatch, WorkoutPatchResult } from "@/lib/shared/workout-patches/schema";

type BuildAndApplyWorkoutPatchInput = {
  userId: string;
  latestUserMessage: string;
  referenceResolution: Extract<ReferenceResolution, { status: "resolved" }>;
  responseMessageId?: string;
  trace?: AiTraceLogger;
};

type PatchableItem = {
  exerciseId: string;
  section: "warmup" | "training" | "stretch";
  cycleDayIndex?: number;
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
  if (!shouldAttemptWorkoutPatch(input.latestUserMessage, input.referenceResolution)) {
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

  const payloadStartedAt = new Date().toISOString();
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
  const target = resolvePatchTarget(input.latestUserMessage, artifact.payload, exercises);
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

  const patch: WorkoutPatch = {
    scope: "artifact_only",
    target: {
      artifactId: artifact.artifactId,
      artifactKind: artifact.kind,
    },
    operations: [
      {
        operation: inferPatchOperation(input.latestUserMessage),
        target: {
          artifactId: artifact.artifactId,
          artifactKind: artifact.kind,
          section: target.section,
          cycleDayIndex: target.cycleDayIndex,
          exerciseId: target.exerciseId,
        },
        reason: input.latestUserMessage,
        ...(inferPatchOperation(input.latestUserMessage) === "remove_exercise"
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

export function shouldAttemptWorkoutPatch(
  message: string,
  resolution: ReferenceResolution | null,
) {
  if (resolution?.status !== "resolved") {
    return false;
  }

  if (resolution.artifactKind !== "routine" && resolution.artifactKind !== "plan") {
    return false;
  }

  return /换掉|换成|替换|改成|太难|简单点|容易点|降低|删掉|删除|移除|去掉|不要/.test(message);
}

export function formatWorkoutPatchReply(result: WorkoutPatchResult) {
  if (result.status === "applied") {
    return `${result.message}\n\n我已经生成了新的训练卡片 revision，原卡片仍可追溯读取。`;
  }

  if (result.status === "ambiguous") {
    return result.message;
  }

  if (result.status === "blocked") {
    return result.message;
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

function isWorkoutDraftPayload(payload: unknown): payload is WorkoutRoutineDraft | WorkoutPlanDraft {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "kind" in payload &&
      ((payload as { kind?: unknown }).kind === "routine" || (payload as { kind?: unknown }).kind === "plan"),
  );
}
