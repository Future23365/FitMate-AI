"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import { ExerciseSummaryMetaChip } from "@/features/exercises/components/exercise-summary-meta-chip";
import { ExerciseDetailIconButton } from "@/features/exercises/components/exercise-detail-icon-button";
import {
  createExercisePreviewFromRecommendationItem,
  exercisePreviewPlaceholderImage,
} from "@/features/exercises/lib/exercise-preview-fallback";
import {
  mergeRecommendationItemWithExercise,
  shouldHydrateRecommendationItem,
} from "@/features/exercises/lib/exercise-recommendation-display";
import type { AssistantSuggestion } from "@/lib/shared/chat/assistant-suggestions";
import type {
  ExerciseRecommendationCard as ExerciseRecommendationCardData,
  ExerciseRecommendationItem,
} from "@/lib/shared/exercise-recommendations/schema";
import type { Exercise } from "@/lib/shared/exercises/types";
import {
  createAsyncToastLifecycle,
  type AsyncToastLifecycle,
} from "@/lib/client/async-feedback";
import { clientRequest } from "@/lib/client/http/client-request";

type ExerciseRecommendationCardProps = {
  card: ExerciseRecommendationCardData;
  assistantSuggestions?: AssistantSuggestion[];
  isSuggestionDisabled?: boolean;
  onSuggestionClick?: (message: string) => void;
};

type ExerciseApiResponse = {
  item: Exercise;
};

// ExerciseRecommendationCard 承载聊天气泡里的动作推荐结果，底部只展示本轮 AI 明确给出的下一步建议。
export function ExerciseRecommendationCard({
  assistantSuggestions = [],
  card,
  isSuggestionDisabled = false,
  onSuggestionClick,
}: ExerciseRecommendationCardProps) {
  const [activePreviewExercise, setActivePreviewExercise] = useState<Exercise | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(() => new Map());
  const [failedExerciseIds, setFailedExerciseIds] = useState<Set<string>>(() => new Set());
  const previewRequestRef = useRef<{
    controller: AbortController;
    requestId: number;
    toast: AsyncToastLifecycle;
  } | null>(null);
  const displayItems = useMemo(() => {
    return card.items.map((item) => mergeRecommendationItemWithExercise(item, findCachedExercise(item.exerciseId, exerciseMap)));
  }, [card.items, exerciseMap]);

  const totalMuscles = useMemo(() => {
    const muscles = new Set(displayItems.flatMap((item) => item.primaryMusclesZh));

    return [...muscles].slice(0, 4);
  }, [displayItems]);

  useEffect(() => {
    return () => {
      previewRequestRef.current?.controller.abort();
      previewRequestRef.current?.toast.dismiss();
      previewRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    const missingExerciseIds = uniqueExerciseIds(
      card.items
        .filter((item) => shouldHydrateRecommendationItem(item))
        .map((item) => item.exerciseId)
        .filter((exerciseId) => !findCachedExercise(exerciseId, exerciseMap) && !failedExerciseIds.has(exerciseId)),
    );

    if (missingExerciseIds.length === 0) {
      return;
    }

    let isCancelled = false;

    // 推荐卡片的首屏展示也要用动作库事实补齐，不能等用户点开详情后才显示名称和图片。
    void Promise.allSettled(missingExerciseIds.map((exerciseId) => fetchExerciseById(exerciseId))).then((results) => {
      if (isCancelled) {
        return;
      }

      const loadedExercises: Exercise[] = [];
      const failedIds: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          loadedExercises.push(result.value);
          return;
        }

        failedIds.push(missingExerciseIds[index]);
      });

      if (loadedExercises.length > 0) {
        setExerciseMap((current) => {
          const next = new Map(current);

          loadedExercises.forEach((exercise) => addExerciseToMap(next, exercise));

          return next;
        });
      }

      if (loadedExercises.length > 0 || failedIds.length > 0) {
        setFailedExerciseIds((current) => {
          const next = new Set(current);

          loadedExercises.forEach((exercise) => next.delete(exercise.id));
          failedIds.forEach((id) => next.add(id));

          return next;
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [card.items, exerciseMap, failedExerciseIds]);

  function handleOpenPreview(item: ExerciseRecommendationItem) {
    const cachedExercise = findCachedExercise(item.exerciseId, exerciseMap);

    setActivePreviewExercise(cachedExercise ?? createExercisePreviewFromRecommendationItem(item));
    setIsPreviewOpen(true);

    if (cachedExercise) {
      previewRequestRef.current?.controller.abort();
      previewRequestRef.current?.toast.dismiss();
      previewRequestRef.current = null;
      return;
    }

    const requestId = (previewRequestRef.current?.requestId ?? 0) + 1;
    const controller = new AbortController();
    const detailToast = createAsyncToastLifecycle({
      id: "exercise-recommendation-detail-loading",
      loading: "正在加载动作详情...",
      error: "动作详情加载失败",
      delayMs: 500,
    });

    previewRequestRef.current?.controller.abort();
    previewRequestRef.current?.toast.dismiss();
    previewRequestRef.current = { controller, requestId, toast: detailToast };
    detailToast.start();

    void fetchExerciseById(item.exerciseId, controller.signal)
      .then((data) => {
        if (previewRequestRef.current?.requestId !== requestId) {
          return;
        }

        setExerciseMap((current) => {
          const next = new Map(current);
          addExerciseToMap(next, data);
          return next;
        });
        setActivePreviewExercise(data);
        detailToast.success();
      })
      .catch((error: unknown) => {
        if (previewRequestRef.current?.requestId !== requestId) {
          return;
        }

        setActivePreviewExercise(createExercisePreviewFromRecommendationItem(item));
        detailToast.error(error);
      })
      .finally(() => {
        if (previewRequestRef.current?.requestId === requestId) {
          previewRequestRef.current = null;
        }
      });
  }

  return (
    <div className="app-push-card relative overflow-hidden rounded-xl border border-line bg-white/95 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-card">
      <div className="h-1 w-full bg-primary" />

      <div className="p-md">
        <div className="space-y-sm">
          <div className="flex min-w-0 flex-col gap-xs lg:flex-row lg:items-start lg:justify-between">
            <h3 className="flex min-w-0 items-center gap-xs font-title-lg text-title-lg font-bold text-on-surface">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <SymbolIcon className="text-[18px]">recommend</SymbolIcon>
              </span>
              <span className="truncate">{card.title}</span>
            </h3>

            <div className="flex shrink-0 flex-wrap gap-xs lg:justify-end">
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
          </div>

          <p className="font-body-sm text-body-sm text-muted">
            {card.summary}
          </p>
        </div>

        {card.items.length === 0 ? (
          <div className="mt-sm rounded-xl border border-dashed border-line bg-panel-soft p-md text-center">
            <p className="font-label-md text-label-md font-bold text-ink">当前推荐动作已全部移除</p>
            <p className="mt-xs font-body-sm text-body-sm text-muted">可以继续告诉 FitMate 你想调整的方向。</p>
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
          {displayItems.map((item) => (
            <div
              className="group/exercise-card relative min-w-0 rounded-xl border border-line bg-white p-sm pr-xl text-left transition-all duration-200 hover:border-primary/35 hover:bg-panel-soft/50 hover:shadow-sm"
              key={item.exerciseId}
            >
              <ExerciseDetailIconButton onClick={() => handleOpenPreview(item)} />
              <div className="grid min-w-0 grid-cols-[68px_minmax(0,1fr)] items-start gap-sm">
                <button
                  aria-label={`查看${item.nameZh}动作详情`}
                  className="relative h-[68px] w-[68px] shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line bg-panel-soft transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => handleOpenPreview(item)}
                  type="button"
                >
                  <Image
                    alt={item.nameZh}
                    className="object-cover transition-transform duration-300 group-hover/exercise-card:scale-105"
                    fill
                    sizes="68px"
                    src={item.imageUrl || exercisePreviewPlaceholderImage}
                  />
                </button>

                <div className="min-w-0 pt-[3px]">
                  <h4 className="truncate font-body-md text-body-md font-extrabold leading-tight text-on-surface">
                    {item.nameZh}
                  </h4>
                  <div className="mt-sm flex min-w-0 flex-wrap items-center gap-xs">
                    <ExerciseSummaryMetaChip tone="primary">
                      {item.primaryMusclesZh[0] || "综合"}
                    </ExerciseSummaryMetaChip>
                    <ExerciseSummaryMetaChip>
                      {item.levelZh || "未标注难度"}
                    </ExerciseSummaryMetaChip>
                    <ExerciseSummaryMetaChip tone="outline">
                      {item.equipmentZh || "未标注器械"}
                    </ExerciseSummaryMetaChip>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {assistantSuggestions.length > 0 ? (
          <div className="mt-sm flex flex-wrap justify-end gap-xs border-t border-line/70 pt-sm">
            {assistantSuggestions.map((suggestion) => (
              <button
                className="inline-flex max-w-full items-center gap-xs rounded-lg border border-primary/20 bg-primary-soft px-sm py-xs text-left font-label-sm text-label-sm font-bold text-primary transition-colors hover:border-primary/40 hover:bg-[#dbe5ff] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSuggestionDisabled || !onSuggestionClick}
                key={`${suggestion.kind}:${suggestion.message}`}
                onClick={() => onSuggestionClick?.(suggestion.message)}
                type="button"
              >
                <SymbolIcon className="shrink-0 text-[15px]">arrow_forward</SymbolIcon>
                <span className="min-w-0 break-words">{suggestion.label}</span>
              </button>
            ))}
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

async function fetchExerciseById(exerciseId: string, signal?: AbortSignal) {
  const data = await clientRequest<ExerciseApiResponse>(`/api/exercises/${encodeURIComponent(exerciseId)}`, {
    signal,
    errorMessage: "动作详情加载失败",
  });

  return data.item;
}

function addExerciseToMap(exerciseMap: Map<string, Exercise>, exercise: Exercise) {
  exerciseMap.set(exercise.id, exercise);
  exerciseMap.set(exercise.id.toLowerCase(), exercise);
}

function findCachedExercise(exerciseId: string, exerciseMap: Map<string, Exercise>) {
  return exerciseMap.get(exerciseId) ?? exerciseMap.get(exerciseId.toLowerCase());
}

function uniqueExerciseIds(exerciseIds: string[]) {
  return [...new Set(exerciseIds)];
}
