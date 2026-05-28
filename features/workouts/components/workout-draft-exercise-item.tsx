"use client";

import Image from "next/image";

import { ExerciseDetailIconButton } from "@/features/exercises/components/exercise-detail-icon-button";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutMode } from "@/lib/shared/workout-plans/draft-schema";
import { placeholderWorkoutImage } from "@/lib/shared/workouts/composition";

type WorkoutDraftExerciseItemProps = {
  exercise?: Exercise;
  exerciseId: string;
  mode: WorkoutMode;
  notes?: string;
  onOpenPreview: () => void;
  sets: number;
  target: number;
};

// 聊天训练草稿统一的动作条目展示边界：只负责条目 UI，不承载计划或编排状态。
export function WorkoutDraftExerciseItem({
  exercise,
  exerciseId,
  mode,
  notes,
  onOpenPreview,
  sets,
  target,
}: WorkoutDraftExerciseItemProps) {
  const exerciseName = exercise?.nameZh || exerciseId;
  const image = exercise?.imageUrls?.[0] || placeholderWorkoutImage;
  const muscles = exercise?.primaryMusclesZh?.slice(0, 2).join("、") || "综合";
  const prescription = `${sets}组 · ${target}${mode === "reps" ? "次/组" : "秒/组"}`;

  return (
    <div className="group/exercise-card relative flex w-full items-center gap-md rounded-xl border border-line bg-white p-sm pr-xl text-left transition-colors hover:border-primary/30 hover:bg-panel-soft">
      <ExerciseDetailIconButton onClick={onOpenPreview} />
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-panel-soft">
        <Image alt={exerciseName} className="object-cover" fill sizes="56px" src={image} />
      </div>
      <div className="min-w-0 flex-1 pr-xs">
        <div className="flex items-center gap-xs">
          <h5 className="truncate font-body-lg text-body-lg font-extrabold leading-tight text-on-surface">
            {exerciseName}
          </h5>
        </div>
        <p className="mt-xs truncate font-label-sm text-label-sm font-semibold text-muted">
          {exercise?.equipmentZh || "未标注器械"} · {muscles}
        </p>
        <div className="mt-xs flex min-w-0 items-center justify-between gap-md">
          {notes ? (
            <p className="line-clamp-1 min-w-0 font-label-sm text-label-sm font-semibold text-primary">
              {notes}
            </p>
          ) : (
            <span aria-hidden="true" className="min-w-0 flex-1" />
          )}
          <p className="shrink-0 font-label-sm text-label-sm font-extrabold text-primary">
            {prescription}
          </p>
        </div>
      </div>
    </div>
  );
}
