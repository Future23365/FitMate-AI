"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import { ExerciseSummaryMetaChip, ExerciseSummaryRow } from "@/features/exercises/components/exercise-summary-row";
import type { AssistantSuggestion } from "@/lib/shared/chat/assistant-suggestions";
import type {
  ExerciseRecommendationCard as ExerciseRecommendationCardData,
  ExerciseRecommendationItem,
} from "@/lib/shared/exercise-recommendations/schema";
import type { Exercise } from "@/lib/shared/exercises/types";
import { clientRequest } from "@/lib/client/http/client-request";

type ExerciseRecommendationCardProps = {
  card: ExerciseRecommendationCardData;
  assistantSuggestions?: AssistantSuggestion[];
  isSuggestionDisabled?: boolean;
  onSuggestionClick?: (message: string) => void;
};

const placeholderImage = "/images/exercise-placeholder.svg";

type ExerciseApiResponse = {
  item: Exercise;
};

function toPreviewFallbackExercise(item: ExerciseRecommendationItem): Exercise {
  return {
    id: item.exerciseId,
    source: "recommendation",
    sourceUrl: "",
    sourceId: item.exerciseId,
    license: "",
    nameEn: item.nameEn ?? item.exerciseId,
    nameZh: item.nameZh,
    category: null,
    categoryZh: item.categoryZh,
    level: null,
    levelZh: item.levelZh,
    force: null,
    forceZh: null,
    mechanic: null,
    mechanicZh: null,
    equipment: null,
    equipmentZh: item.equipmentZh,
    homeRequirement: "unknown",
    homeRequirementZh: "未标注",
    primaryMuscles: [],
    primaryMusclesZh: item.primaryMusclesZh,
    secondaryMuscles: [],
    secondaryMusclesZh: item.secondaryMusclesZh,
    instructionsEn: [],
    instructionsZh: item.reasons,
    images: [],
    imageUrls: [item.imageUrl || placeholderImage],
    allowedSections: ["training"],
    intensityRole: "strength",
    movementPattern: "other",
    difficulty: "beginner",
    riskTags: [],
    contraindications: [],
    regressionExerciseIds: [],
    progressionExerciseIds: [],
    substitutionGroupId: null,
    goalTags: [],
    reviewStatus: "fallback",
    isPublished: true,
  };
}

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

  const totalMuscles = useMemo(() => {
    const muscles = new Set(card.items.flatMap((item) => item.primaryMusclesZh));

    return [...muscles].slice(0, 4);
  }, [card.items]);

  function handleOpenPreview(item: ExerciseRecommendationItem) {
    const cachedExercise = exerciseMap.get(item.exerciseId);

    setActivePreviewExercise(cachedExercise ?? toPreviewFallbackExercise(item));
    setIsPreviewOpen(true);

    if (!cachedExercise) {
      void clientRequest<ExerciseApiResponse>(`/api/exercises/${encodeURIComponent(item.exerciseId)}`, {
        errorMessage: "动作详情加载失败",
      })
        .then((data) => {
          setExerciseMap((current) => {
            const next = new Map(current);
            next.set(data.item.id, data.item);
            return next;
          });
          setActivePreviewExercise(data.item);
        })
        .catch(() => {
          setActivePreviewExercise(toPreviewFallbackExercise(item));
        });
    }
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
          {card.items.map((item) => (
            <ExerciseSummaryRow
              meta={
                <>
                  <ExerciseSummaryMetaChip tone="primary">
                    {item.primaryMusclesZh[0] || "综合"}
                  </ExerciseSummaryMetaChip>
                  <ExerciseSummaryMetaChip>
                    {item.levelZh || "未标注难度"}
                  </ExerciseSummaryMetaChip>
                  <ExerciseSummaryMetaChip tone="outline">
                    {item.equipmentZh || "未标注器械"}
                  </ExerciseSummaryMetaChip>
                </>
              }
              onOpenPreview={() => handleOpenPreview(item)}
              key={item.exerciseId}
              thumbnail={
                <Image
                  alt={item.nameZh}
                  className="object-cover transition-transform duration-300 group-hover/exercise-card:scale-105"
                  fill
                  sizes="64px"
                  src={item.imageUrl || placeholderImage}
                />
              }
              thumbnailLabel={`查看${item.nameZh}动作详情`}
              title={item.nameZh}
              titleElement="h4"
            />
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
