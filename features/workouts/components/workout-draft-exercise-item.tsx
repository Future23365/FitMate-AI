"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ExerciseDetailIconButton } from "@/features/exercises/components/exercise-detail-icon-button";
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

function ExerciseImageLoadingPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-panel-soft">
      <Skeleton className="h-full w-full rounded-lg" />
      <div className="absolute inset-[13px] rounded-md border border-white/70" />
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
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const muscles = exercise?.primaryMusclesZh?.slice(0, 2).join("、") || "综合";
  const level = exercise?.levelZh;
  const targetLabel = `${target}${mode === "reps" ? "次/组" : "秒/组"}`;
  const prescription = `${targetLabel} · ${sets}组`;
  const resolvedImageState: WorkoutDraftExerciseImageState =
    imageState ?? (image ? "available" : "unavailable");
  const shouldShowImage = resolvedImageState === "available" && image && !hasImageLoadError;
  const shouldShowLoading = resolvedImageState === "loading";

  useEffect(() => {
    setHasImageLoadError(false);
  }, [image]);

  return (
    <div className="group/exercise-card relative grid w-full grid-cols-[64px_minmax(0,1fr)] items-stretch gap-md rounded-xl border border-line bg-white p-sm pr-xl text-left transition-colors hover:border-primary/30 hover:bg-panel-soft">
      <ExerciseDetailIconButton onClick={onOpenPreview} />
      <button
        aria-label={`查看${exerciseName}动作详情`}
        aria-busy={shouldShowLoading}
        className="relative min-h-[72px] w-16 self-stretch cursor-pointer overflow-hidden rounded-lg border border-line bg-panel-soft transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        onClick={onOpenPreview}
        type="button"
      >
        {shouldShowImage ? (
          <Image
            alt={exerciseName}
            className="object-cover"
            fill
            onError={() => setHasImageLoadError(true)}
            sizes="64px"
            src={image}
          />
        ) : shouldShowLoading ? (
          <ExerciseImageLoadingPlaceholder />
        ) : (
          <ExerciseImageUnavailablePlaceholder />
        )}
      </button>
      <div className="grid min-w-0 content-center gap-xs py-[2px] pr-xs">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-sm">
          <h5 className="truncate font-body-lg text-body-lg font-extrabold leading-tight text-on-surface">
            {exerciseName}
          </h5>
          <p className="max-w-[138px] truncate rounded-lg border border-primary/15 bg-primary-soft px-sm py-xs text-right font-label-sm text-label-sm font-extrabold leading-none text-primary">
            {prescription}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-xs overflow-hidden">
          <span className="shrink-0 rounded-md border border-line bg-panel-soft px-xs py-[1px] font-label-xs text-label-xs font-bold text-ink">
            {muscles}
          </span>
          {level && (
            <span className="shrink-0 rounded-md border border-primary/15 bg-white px-xs py-[1px] font-label-xs text-label-xs font-bold text-primary">
              {level}
            </span>
          )}
          <span className="truncate font-label-sm text-label-sm font-semibold text-muted">
            {exercise?.equipmentZh || "未标注器械"}
          </span>
        </div>
        {notes && (
          <p className="flex min-w-0 items-center gap-[4px] font-label-sm text-label-sm font-medium text-muted">
            <SymbolIcon className="shrink-0 text-[15px] text-[#F59E0B]">lightbulb</SymbolIcon>
            <span className="line-clamp-1 min-w-0">{notes}</span>
          </p>
        )}
      </div>
    </div>
  );
}
