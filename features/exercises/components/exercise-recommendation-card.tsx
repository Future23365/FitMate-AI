"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import exercisesData from "@/data/exercises.zh.json";
import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import type { ExerciseRecommendationCard as ExerciseRecommendationCardData } from "@/lib/shared/exercise-recommendations/schema";
import type { Exercise } from "@/lib/shared/exercises/types";

type ExerciseRecommendationCardProps = {
  card: ExerciseRecommendationCardData;
  isRefreshing?: boolean;
  onCompose?: () => void;
  onDislike?: (exerciseId: string) => void;
  onRefresh?: () => void;
};

const exercises = exercisesData as Exercise[];
const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const placeholderImage = "/images/exercise-placeholder.svg";

export function ExerciseRecommendationCard({
  card,
  isRefreshing = false,
  onCompose,
  onDislike,
  onRefresh,
}: ExerciseRecommendationCardProps) {
  const [activePreviewExercise, setActivePreviewExercise] = useState<Exercise | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const totalMuscles = useMemo(() => {
    const muscles = new Set(card.items.flatMap((item) => item.primaryMusclesZh));

    return [...muscles].slice(0, 4);
  }, [card.items]);

  function handleOpenPreview(exerciseId: string) {
    const exercise = exerciseMap.get(exerciseId);

    if (!exercise) {
      return;
    }

    setActivePreviewExercise(exercise);
    setIsPreviewOpen(true);
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-white/95 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-card">
      <div className="h-1 w-full bg-primary" />

      <div className="p-md">
        <div className="space-y-sm">
          <div className="min-w-0">
            <h3 className="flex min-w-0 items-center gap-xs text-[15px] font-bold leading-5 text-on-surface">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <SymbolIcon className="text-[17px]">recommend</SymbolIcon>
              </span>
              <span className="truncate">{card.title}</span>
            </h3>
            <p className="mt-xs text-[13px] leading-5 text-muted">
              {card.summary}
            </p>
          </div>

          <div className="flex flex-wrap gap-xs">
            <span className="inline-flex items-center gap-1 rounded-lg bg-panel-soft px-sm py-[3px] text-[12px] font-medium leading-4 text-ink">
              <SymbolIcon className="text-[14px]">fitness_center</SymbolIcon>
              {card.items.length} 个动作
            </span>
            {totalMuscles.map((muscle) => (
              <span
                className="rounded-lg bg-primary-soft px-sm py-[3px] text-[12px] font-bold leading-4 text-primary"
                key={muscle}
              >
                {muscle}
              </span>
            ))}
          </div>
        </div>

        {card.items.length === 0 ? (
          <div className="mt-sm rounded-xl border border-dashed border-line bg-panel-soft p-md text-center">
            <p className="font-label-md text-label-md font-bold text-ink">当前推荐动作已全部移除</p>
            <p className="mt-xs font-body-sm text-body-sm text-muted">可以点击“换一批”继续探索其他动作。</p>
          </div>
        ) : null}

        {card.safetyNotes.length > 0 ? (
          <div className="mt-sm flex items-start gap-xs rounded-lg border border-amber-200/50 bg-amber-50/80 px-sm py-xs text-amber-900">
            <SymbolIcon className="mt-[1px] shrink-0 text-[16px] text-amber-600">warning</SymbolIcon>
            <div className="font-body-xs text-body-xs leading-relaxed">
              <strong className="font-bold">筛选提醒：</strong>
              {card.safetyNotes.join("；")}
            </div>
          </div>
        ) : null}

        <div className="mt-sm grid gap-sm sm:grid-cols-2">
          {card.items.map((item) => (
            <div
              className="group relative min-w-0 rounded-lg border border-line bg-white p-sm pr-11 text-left transition-all duration-200 hover:border-primary/40 hover:bg-panel-soft/40"
              key={item.exerciseId}
            >
              <button
                className="block w-full min-w-0 text-left"
                onClick={() => handleOpenPreview(item.exerciseId)}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-sm">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-panel-soft">
                    <Image
                      alt={item.nameZh}
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      fill
                      sizes="48px"
                      src={item.imageUrl || placeholderImage}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-xs">
                      <h4 className="truncate text-[14px] font-bold leading-5 text-on-surface">
                        {item.nameZh}
                      </h4>
                      <SymbolIcon className="shrink-0 text-[15px] text-on-surface-variant transition-colors group-hover:text-primary">
                        info
                      </SymbolIcon>
                    </div>

                    <div className="mt-[2px] flex min-w-0 items-center gap-xs text-[12px] leading-4 text-muted">
                      <span className="shrink-0 rounded-md bg-panel-soft px-1 py-[1px]">
                        {item.levelZh}
                      </span>
                      <span className="truncate">{item.categoryZh}</span>
                      <span className="truncate">{item.equipmentZh}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-xs flex flex-wrap gap-xs">
                  {item.primaryMusclesZh.slice(0, 3).map((muscle) => (
                    <span
                      className="rounded-md bg-primary-soft px-xs py-[1px] text-[12px] font-bold leading-4 text-primary"
                      key={muscle}
                    >
                      {muscle}
                    </span>
                  ))}
                </div>
              </button>
              {onDislike ? (
                <button
                  aria-label={`不喜欢 ${item.nameZh}`}
                  className="absolute right-sm top-sm grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted transition-colors hover:border-error/30 hover:bg-error-container/20 hover:text-error"
                  onClick={() => onDislike(item.exerciseId)}
                  title="不喜欢"
                  type="button"
                >
                  <SymbolIcon className="text-[16px]">thumb_down</SymbolIcon>
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {onRefresh || onCompose ? (
          <div className="mt-sm flex flex-wrap justify-end gap-xs border-t border-line/70 pt-sm">
            {onRefresh ? (
              <button
                className="inline-flex items-center gap-xs rounded-lg border border-primary/20 bg-primary-soft px-sm py-xs text-[12px] font-bold leading-4 text-primary transition-colors hover:border-primary/40 hover:bg-[#dbe5ff] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRefreshing}
                onClick={onRefresh}
                type="button"
              >
                <SymbolIcon className={`text-[15px] ${isRefreshing ? "animate-spin" : ""}`}>
                  autorenew
                </SymbolIcon>
                换一批
              </button>
            ) : null}
            {onCompose ? (
              <button
                className="inline-flex items-center gap-xs rounded-lg border border-line bg-white px-sm py-xs text-[12px] font-bold leading-4 text-ink transition-colors hover:border-primary/30 hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRefreshing || card.items.length === 0}
                onClick={onCompose}
                type="button"
              >
                <SymbolIcon className="text-[15px]">playlist_add</SymbolIcon>
                编成训练
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ExercisePreviewSheet
        exercise={activePreviewExercise}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  );
}
