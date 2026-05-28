"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import { convertWorkoutRoutineDraftToWorkoutRoutine } from "@/features/workout-plans/lib/workout-routine-conversion";
import { createWorkoutRoutine } from "@/features/workouts/api/workout-data-client";
import { clientRequest } from "@/lib/client/http/client-request";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutRoutineDraft, WorkoutRoutineDraftItem } from "@/lib/shared/workout-plans/draft-schema";
import {
  estimateWorkoutMinutes,
  placeholderWorkoutImage,
  workoutSectionConfigs,
  type WorkoutSection,
} from "@/lib/shared/workouts/composition";

type WorkoutRoutineDraftCardProps = {
  draft: WorkoutRoutineDraft;
  initialExercises?: Exercise[];
};

type ExerciseApiResponse = {
  item: Exercise;
};

const sectionTone: Record<WorkoutSection, string> = {
  warmup: "border-[#B6D7B9] bg-[#F1F8F2] text-[#245B2A]",
  training: "border-primary/20 bg-primary-soft text-primary",
  stretch: "border-[#D5C7F1] bg-[#F5F0FF] text-[#5E3BA7]",
};

function createExerciseMap(exercises: Exercise[] = []) {
  const exerciseMap = new Map<string, Exercise>();

  for (const exercise of exercises) {
    exerciseMap.set(exercise.id, exercise);
    exerciseMap.set(exercise.id.toLowerCase(), exercise);
  }

  return exerciseMap;
}

function findExerciseById(exerciseId: string, exerciseMap: Map<string, Exercise>) {
  return exerciseMap.get(exerciseId) ?? exerciseMap.get(exerciseId.toLowerCase());
}

async function fetchExerciseById(exerciseId: string) {
  const data = await clientRequest<ExerciseApiResponse>(
    `/api/exercises/${encodeURIComponent(exerciseId)}`,
    { errorMessage: "动作详情加载失败" },
  );

  return data.item;
}

async function fetchDraftExercises(draft: WorkoutRoutineDraft, cachedExercises: Map<string, Exercise>) {
  const ids = [
    ...new Set(draft.sections.flatMap((section) => section.items.map((item) => item.exerciseId))),
  ];
  const exercises = await Promise.all(
    ids.map(async (id) => findExerciseById(id, cachedExercises) ?? fetchExerciseById(id)),
  );

  return exercises;
}

function collectRoutineDraftExerciseIds(draft: WorkoutRoutineDraft) {
  return [...new Set(draft.sections.flatMap((section) => section.items.map((item) => item.exerciseId)))];
}

function toFallbackPreviewExercise(item: WorkoutRoutineDraftItem): Exercise {
  return {
    id: item.exerciseId,
    source: "draft",
    sourceUrl: "",
    sourceId: item.exerciseId,
    license: "",
    nameEn: item.exerciseId,
    nameZh: item.exerciseId,
    category: null,
    categoryZh: "训练",
    level: null,
    levelZh: null,
    force: null,
    forceZh: null,
    mechanic: null,
    mechanicZh: null,
    equipment: null,
    equipmentZh: "未标注器械",
    homeRequirement: "unknown",
    homeRequirementZh: "未标注",
    primaryMuscles: [],
    primaryMusclesZh: ["综合"],
    secondaryMuscles: [],
    secondaryMusclesZh: [],
    instructionsEn: [],
    instructionsZh: item.notes ? [item.notes] : [],
    images: [],
    imageUrls: [placeholderWorkoutImage],
    riskTags: [],
    goalTags: [],
    reviewStatus: "fallback",
    isPublished: true,
  };
}

export function WorkoutRoutineDraftCard({
  draft,
  initialExercises = [],
}: WorkoutRoutineDraftCardProps) {
  const router = useRouter();
  const [fetchedExerciseMap, setFetchedExerciseMap] = useState<Map<string, Exercise>>(() => new Map());
  const [activePreviewExercise, setActivePreviewExercise] = useState<Exercise | null>(null);
  const [activePreviewTip, setActivePreviewTip] = useState<string | undefined>();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const initialExerciseMap = useMemo(() => createExerciseMap(initialExercises), [initialExercises]);
  const exerciseMap = useMemo(() => {
    const next = new Map(initialExerciseMap);

    for (const [key, exercise] of fetchedExerciseMap) {
      next.set(key, exercise);
    }

    return next;
  }, [fetchedExerciseMap, initialExerciseMap]);
  const draftExerciseIds = useMemo(() => collectRoutineDraftExerciseIds(draft), [draft]);
  const loadedExercises = useMemo(() => {
    return draftExerciseIds.flatMap((exerciseId) => {
      const exercise = findExerciseById(exerciseId, exerciseMap);
      return exercise ? [exercise] : [];
    });
  }, [draftExerciseIds, exerciseMap]);
  const workoutItems = useMemo(() => {
    try {
      return convertWorkoutRoutineDraftToWorkoutRoutine(draft, loadedExercises, {
        createId: () => "preview-item",
      }).items;
    } catch {
      return [];
    }
  }, [draft, loadedExercises]);
  const estimatedMinutes = workoutItems.length
    ? estimateWorkoutMinutes(workoutItems, {
        trainingLoopRounds: draft.trainingLoopRounds,
        trainingLoopRestSeconds: draft.trainingLoopRestSeconds,
      })
    : draft.estimatedSessionMinutes;

  useEffect(() => {
    const missingExerciseIds = draftExerciseIds.filter(
      (exerciseId) => !findExerciseById(exerciseId, exerciseMap),
    );

    if (missingExerciseIds.length === 0) {
      return;
    }

    let isCancelled = false;

    // 聊天历史回放或候选快照不完整时，首屏先补齐动作详情，避免必须点击后才显示。
    void Promise.allSettled(missingExerciseIds.map((exerciseId) => fetchExerciseById(exerciseId))).then(
      (results) => {
        if (isCancelled) {
          return;
        }

        const loaded = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );

        if (loaded.length === 0) {
          return;
        }

        setFetchedExerciseMap((current) => {
          const next = new Map(current);

          for (const exercise of loaded) {
            next.set(exercise.id, exercise);
            next.set(exercise.id.toLowerCase(), exercise);
          }

          return next;
        });
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [draftExerciseIds, exerciseMap]);

  const handleOpenPreview = (item: WorkoutRoutineDraftItem) => {
    const exercise = findExerciseById(item.exerciseId, exerciseMap) ?? toFallbackPreviewExercise(item);

    setActivePreviewExercise(exercise);
    setActivePreviewTip(item.notes);
    setIsPreviewOpen(true);

    if (!findExerciseById(item.exerciseId, exerciseMap)) {
      void fetchExerciseById(item.exerciseId)
        .then((dbExercise) => {
          setFetchedExerciseMap((current) => {
            const next = new Map(current);
            next.set(dbExercise.id, dbExercise);
            next.set(dbExercise.id.toLowerCase(), dbExercise);
            return next;
          });
          setActivePreviewExercise(dbExercise);
        })
        .catch(() => {
          setActivePreviewExercise(toFallbackPreviewExercise(item));
        });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError("");

    try {
      const draftExercises = await fetchDraftExercises(draft, exerciseMap);
      setFetchedExerciseMap((current) => {
        const next = new Map(current);
        draftExercises.forEach((exercise) => {
          next.set(exercise.id, exercise);
          next.set(exercise.id.toLowerCase(), exercise);
        });
        return next;
      });
      const routine = convertWorkoutRoutineDraftToWorkoutRoutine(draft, draftExercises);
      await createWorkoutRoutine(routine);
      setSaveSuccess(true);
      window.setTimeout(() => router.push("/composer"), 900);
    } catch (error) {
      console.error("[WorkoutRoutineDraftCard] Save failed:", error);
      setSaveError(error instanceof Error ? error.message : "保存动作编排失败，请检查数据。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-md overflow-hidden rounded-[20px] border border-line bg-white shadow-card">
      <div className="border-b border-line bg-panel-soft px-lg py-md">
        <div className="flex flex-col gap-sm md:flex-row md:items-start md:justify-between">
          <div>
            <span className="inline-flex items-center gap-xs rounded-lg bg-primary-soft px-sm py-xs font-label-xs text-label-xs font-bold text-primary">
              <SymbolIcon className="text-[14px]">sports_gymnastics</SymbolIcon>
              本次动作编排
            </span>
            <h3 className="mt-sm font-title-lg text-title-lg font-bold text-on-surface">
              {draft.title}
            </h3>
            {draft.summary && (
              <p className="mt-xs font-body-sm text-body-sm text-muted">{draft.summary}</p>
            )}
          </div>
          <div className="shrink-0 self-start">
            <div className="inline-flex whitespace-nowrap rounded-xl border border-line bg-white px-sm py-xs font-label-md text-label-md font-bold text-ink">
              预估 {estimatedMinutes} 分钟
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-md p-lg">
        {workoutSectionConfigs.map((config) => {
          const section = draft.sections.find((candidate) => candidate.section === config.id);

          if (!section) {
            return null;
          }

          return (
            <section className="space-y-sm" key={config.id}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div className="flex items-center gap-xs">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${sectionTone[config.id]}`}>
                    <SymbolIcon className="text-[18px]">{config.icon}</SymbolIcon>
                  </span>
                  <div>
                    <h4 className="font-label-md text-label-md font-bold text-on-surface">
                      {section.title || config.title}
                    </h4>
                    <p className="font-label-xs text-label-xs text-muted">{config.subtitle}</p>
                  </div>
                </div>
                {config.id === "training" && (
                  <span className="rounded-lg bg-primary-soft px-sm py-xs font-label-xs text-label-xs font-bold text-primary">
                    主训练循环 {draft.trainingLoopRounds} 轮
                  </span>
                )}
              </div>

              <div className="space-y-xs">
                {section.items.map((item, index) => {
                  const exercise = findExerciseById(item.exerciseId, exerciseMap);
                  const exerciseName = exercise?.nameZh || item.exerciseId;
                  const image = exercise?.imageUrls?.[0] || placeholderWorkoutImage;
                  const muscles = exercise?.primaryMusclesZh?.slice(0, 2).join("、") || "综合";

                  return (
                    <button
                      className="flex w-full items-center gap-md rounded-xl border border-line bg-white p-sm text-left transition-colors hover:border-primary/30 hover:bg-panel-soft"
                      key={`${item.section}-${item.exerciseId}-${index}`}
                      onClick={() => handleOpenPreview(item)}
                      type="button"
                    >
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-panel-soft">
                        <Image
                          alt={exerciseName}
                          className="object-cover"
                          fill
                          sizes="56px"
                          src={image}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-xs">
                          <h5 className="truncate font-label-md text-label-md font-bold text-on-surface">
                            {exerciseName}
                          </h5>
                          <SymbolIcon className="text-[14px] text-muted">info</SymbolIcon>
                        </div>
                        <p className="mt-[2px] truncate font-label-xs text-label-xs text-muted">
                          {exercise?.equipmentZh || "未标注器械"} · {muscles}
                        </p>
                        {item.notes && (
                          <p className="mt-xs line-clamp-1 font-label-xs text-label-xs text-primary">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-label-md text-label-md font-black text-primary">
                          {item.sets} 组
                        </p>
                        <p className="font-label-xs text-label-xs text-muted">
                          {item.mode === "reps" ? `${item.target} 次` : `${item.target} 秒`}
                        </p>
                        <p className="mt-[2px] font-label-xs text-label-xs text-muted">
                          组间 {item.setRestSeconds}s
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {draft.safetyNotes.length > 0 && (
          <div className="rounded-xl border border-[#F3D19C] bg-[#FFF7E6] p-md text-[#7A4B00]">
            <div className="flex items-start gap-xs">
              <SymbolIcon className="mt-[2px] text-[18px]">warning</SymbolIcon>
              <p className="font-body-xs text-body-xs leading-relaxed">
                <strong className="font-bold">安全提示：</strong>
                {draft.safetyNotes.join("；")}
              </p>
            </div>
          </div>
        )}

        {saveError && (
          <div className="rounded-xl border border-error-container bg-error-container/20 p-md font-body-xs text-body-xs text-on-error-container">
            {saveError}
          </div>
        )}

        <div className="flex flex-col gap-sm border-t border-line pt-md sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 flex-1 font-label-xs text-label-xs text-muted">
            保存后会进入动作编排列表，可继续编辑或安排到训练日历。
          </p>
          <button
            className={`inline-flex shrink-0 items-center justify-center gap-xs whitespace-nowrap rounded-xl px-lg py-sm font-label-md text-label-md font-bold shadow-card transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              saveSuccess ? "bg-[#12B76A] text-white" : "bg-primary text-white hover:bg-primary-deep"
            }`}
            disabled={isSaving || saveSuccess}
            onClick={handleSave}
            type="button"
          >
            <SymbolIcon className={isSaving ? "animate-spin" : ""}>
              {saveSuccess ? "check_circle" : isSaving ? "autorenew" : "save_alt"}
            </SymbolIcon>
            {saveSuccess ? "已保存" : isSaving ? "保存中" : "保存本次编排"}
          </button>
        </div>
      </div>

      <ExercisePreviewSheet
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        exercise={activePreviewExercise}
        executionTip={activePreviewTip}
      />
    </div>
  );
}
