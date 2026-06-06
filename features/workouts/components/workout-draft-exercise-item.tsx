"use client";

import Image from "next/image";
import { useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ExerciseDetailIconButton } from "@/features/exercises/components/exercise-detail-icon-button";
import { ExerciseSummaryMetaChip } from "@/features/exercises/components/exercise-summary-meta-chip";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutMode } from "@/lib/shared/workout-plans/draft-schema";

type WorkoutDraftExerciseItemProps = {
  exercise?: Exercise;
  exerciseId: string;
  imageState?: WorkoutDraftExerciseImageState;
  mode: WorkoutMode;
  notes?: string;
  onOpenPreview: () => void;
  sets: number;
  target: number;
};

export type WorkoutDraftExerciseImageState = "loading" | "available" | "unavailable";

// resolveWorkoutDraftExerciseImageState 把动作详情加载态和真实无图态分开，避免临时加载时显示静态占位图。
export function resolveWorkoutDraftExerciseImageState({
  exercise,
  exerciseId,
  failedExerciseIds,
}: {
  exercise: Exercise | undefined;
  exerciseId: string;
  failedExerciseIds: Set<string>;
}): WorkoutDraftExerciseImageState {
  if (exercise?.imageUrls?.[0]) {
    return "available";
  }

  if (exercise || failedExerciseIds.has(exerciseId)) {
    return "unavailable";
  }

  return "loading";
}

function ExerciseImageLoadingPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-panel-soft">
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}

function ExerciseImageUnavailablePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-container-low to-panel-soft text-muted">
      <SymbolIcon className="text-[22px]">fitness_center</SymbolIcon>
    </div>
  );
}

// 聊天训练草稿统一的动作条目展示边界：只负责条目 UI，不承载计划或编排状态。
export function WorkoutDraftExerciseItem({
  exercise,
  exerciseId,
  imageState,
  mode,
  notes,
  onOpenPreview,
  sets,
  target,
}: WorkoutDraftExerciseItemProps) {
  const exerciseName = exercise?.nameZh || exerciseId;
  const image = exercise?.imageUrls?.[0];
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const muscles = exercise?.primaryMusclesZh?.slice(0, 2).join("、") || "综合";
  const level = exercise?.levelZh;
  const prescription = `${sets}组 · ${target}${mode === "reps" ? "次/组" : "秒/组"}`;
  const resolvedImageState: WorkoutDraftExerciseImageState =
    imageState ?? (image ? "available" : "unavailable");
  const shouldShowImage = resolvedImageState === "available" && image && failedImageUrl !== image;
  const shouldShowLoading = resolvedImageState === "loading";

  return (
    <div className="group/exercise-card relative w-full rounded-xl border border-line bg-white p-sm pr-xl text-left transition-colors hover:border-primary/30 hover:bg-panel-soft">
      <ExerciseDetailIconButton onClick={onOpenPreview} />
      <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-sm">
        <button
          aria-label={`查看${exerciseName}动作详情`}
          aria-busy={shouldShowLoading}
          className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line bg-panel-soft transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onOpenPreview}
          type="button"
        >
          {shouldShowImage ? (
            <Image
              alt={exerciseName}
              className="object-cover"
              fill
              onError={() => setFailedImageUrl(image)}
              sizes="56px"
              src={image}
            />
          ) : shouldShowLoading ? (
            <ExerciseImageLoadingPlaceholder />
          ) : (
            <ExerciseImageUnavailablePlaceholder />
          )}
        </button>

        <div className="min-w-0">
          <h5 className="truncate font-body-md text-body-md font-extrabold leading-tight text-on-surface">
            {exerciseName}
          </h5>
          <div className="mt-xs flex min-w-0 flex-wrap items-center gap-xs">
            <ExerciseSummaryMetaChip>{muscles}</ExerciseSummaryMetaChip>
            {level ? (
              <ExerciseSummaryMetaChip tone="primary">
                {level}
              </ExerciseSummaryMetaChip>
            ) : null}
            <ExerciseSummaryMetaChip tone="outline">
              {exercise?.equipmentZh || "未标注器械"}
            </ExerciseSummaryMetaChip>
          </div>
        </div>

        <p className="shrink-0 rounded-lg border border-primary/15 bg-primary-soft px-sm py-xs font-label-xs text-label-xs font-extrabold leading-none text-primary">
          {prescription}
        </p>
      </div>

      {notes ? (
        <p className="ml-[68px] mt-xs flex min-w-0 items-center gap-[4px] font-label-sm text-label-sm font-medium text-muted">
          <SymbolIcon className="shrink-0 text-[15px] text-[#F59E0B]">lightbulb</SymbolIcon>
          <span className="line-clamp-1 min-w-0">{notes}</span>
        </p>
      ) : null}
    </div>
  );
}
