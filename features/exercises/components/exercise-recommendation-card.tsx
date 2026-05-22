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
    <div className="relative mt-md overflow-hidden rounded-[20px] border border-line bg-white/95 shadow-card backdrop-blur-md transition-all duration-300 hover:shadow-lift">
      <div className="h-1.5 w-full bg-primary" />

      <div className="p-lg">
        <div className="flex flex-col gap-sm md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="flex items-center gap-xs font-title-lg text-title-lg font-bold text-on-surface">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <SymbolIcon className="text-[18px]">recommend</SymbolIcon>
              </span>
              {card.title}
            </h3>
            <p className="mt-xs font-body-sm text-body-sm text-muted">
              {card.summary}
            </p>
          </div>
          <div className="flex flex-col items-start gap-sm md:items-end">
            <div className="flex flex-wrap justify-start gap-xs md:justify-end">
              <span className="inline-flex items-center gap-1 rounded-lg bg-panel-soft px-sm py-xs font-label-sm text-label-sm text-ink">
                <SymbolIcon className="text-[14px]">fitness_center</SymbolIcon>
                {card.items.length} 个动作
              </span>
              {totalMuscles.map((muscle) => (
                <span
                  className="rounded-lg bg-primary-soft px-sm py-xs font-label-sm text-label-sm font-bold text-primary"
                  key={muscle}
                >
                  {muscle}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-xs">
              {onRefresh ? (
                <button
                  className="inline-flex items-center gap-xs rounded-xl border border-primary/20 bg-primary-soft px-md py-sm font-label-sm text-label-sm font-bold text-primary transition-colors hover:border-primary/40 hover:bg-[#dbe5ff] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRefreshing}
                  onClick={onRefresh}
                  type="button"
                >
                  <SymbolIcon className={`text-[16px] ${isRefreshing ? "animate-spin" : ""}`}>
                    autorenew
                  </SymbolIcon>
                  换一批
                </button>
              ) : null}
              {onCompose ? (
                <button
                  className="inline-flex items-center gap-xs rounded-xl border border-line bg-white px-md py-sm font-label-sm text-label-sm font-bold text-ink transition-colors hover:border-primary/30 hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRefreshing || card.items.length === 0}
                  onClick={onCompose}
                  type="button"
                >
                  <SymbolIcon className="text-[16px]">playlist_add</SymbolIcon>
                  编成训练
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {card.items.length === 0 ? (
          <div className="mt-md rounded-xl border border-dashed border-line bg-panel-soft p-lg text-center">
            <p className="font-label-md text-label-md font-bold text-ink">当前推荐动作已全部移除</p>
            <p className="mt-xs font-body-sm text-body-sm text-muted">可以点击“换一批”继续探索其他动作。</p>
          </div>
        ) : null}

        {card.safetyNotes.length > 0 ? (
          <div className="mt-md flex items-start gap-xs rounded-xl border border-amber-200/50 bg-amber-50/80 p-md text-amber-900 shadow-sm">
            <SymbolIcon className="mt-[2px] shrink-0 text-[18px] text-amber-600">warning</SymbolIcon>
            <div className="font-body-xs text-body-xs leading-relaxed">
              <strong className="font-bold">筛选提醒：</strong>
              {card.safetyNotes.join("；")}
            </div>
          </div>
        ) : null}

        <div className="mt-md grid gap-sm sm:grid-cols-2">
          {card.items.map((item) => (
            <div
              className="group flex min-w-0 items-center gap-sm rounded-xl border border-line bg-white p-md text-left transition-all duration-200 hover:border-primary/40 hover:shadow-card"
              key={item.exerciseId}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-md text-left"
                onClick={() => handleOpenPreview(item.exerciseId)}
                type="button"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-panel-soft">
                  <Image
                    alt={item.nameZh}
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    fill
                    sizes="64px"
                    src={item.imageUrl || placeholderImage}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <h4 className="truncate font-body-md text-body-md font-bold text-on-surface">
                        {item.nameZh}
                      </h4>
                      <div className="mt-xs flex flex-wrap items-center gap-xs font-label-xs text-label-xs text-muted">
                        <span className="rounded-lg bg-panel-soft px-1 py-[2px]">
                          {item.categoryZh}
                        </span>
                        <span>{item.levelZh}</span>
                        <span>{item.equipmentZh}</span>
                      </div>
                    </div>
                    <SymbolIcon className="shrink-0 text-[18px] text-on-surface-variant transition-colors group-hover:text-primary">
                      info
                    </SymbolIcon>
                  </div>

                  <div className="mt-sm flex flex-wrap gap-xs">
                    {item.primaryMusclesZh.slice(0, 3).map((muscle) => (
                      <span
                        className="rounded-lg bg-primary-soft px-sm py-[2px] font-label-xs text-label-xs font-bold text-primary"
                        key={muscle}
                      >
                        {muscle}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
              {onDislike ? (
                <button
                  aria-label={`不喜欢 ${item.nameZh}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-white text-muted transition-colors hover:border-error/30 hover:bg-error-container/20 hover:text-error"
                  onClick={() => onDislike(item.exerciseId)}
                  title="不喜欢"
                  type="button"
                >
                  <SymbolIcon className="text-[18px]">thumb_down</SymbolIcon>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <ExercisePreviewSheet
        exercise={activePreviewExercise}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  );
}
