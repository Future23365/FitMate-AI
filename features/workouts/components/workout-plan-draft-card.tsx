"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import {
  createWorkoutSchedule,
  createWorkoutRoutine,
  deleteWorkoutSchedule,
  listWorkoutSchedules,
} from "@/features/workouts/api/workout-data-client";
import { WorkoutDraftExerciseItem } from "@/features/workouts/components/workout-draft-exercise-item";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutPlanDraft, WorkoutPlanItemDraft } from "@/lib/shared/workout-plans/draft-schema";
import { convertWorkoutPlanDraftToWorkoutRoutine } from "@/features/workout-plans/lib/workout-routine-conversion";
import {
  buildWorkoutPlanSchedules,
  getWorkoutPlanImportOptions,
  getWorkoutPlanTrainingDays,
  selectWorkoutPlanSchedulesToReplace,
  type WorkoutPlanImportOption,
} from "@/features/workout-plans/lib/workout-plan-scheduling";
import { clientRequest } from "@/lib/client/http/client-request";
import { placeholderWorkoutImage, workoutSectionConfigs } from "@/lib/shared/workouts/composition";

interface WorkoutPlanDraftCardProps {
  draft: WorkoutPlanDraft;
  initialExercises?: Exercise[];
}

const emptyInitialExercises: Exercise[] = [];

type ExerciseApiResponse = {
  item: Exercise;
};

function findExerciseById(exerciseId: string, exerciseMap: Map<string, Exercise>) {
  return exerciseMap.get(exerciseId) ?? exerciseMap.get(exerciseId.toLowerCase());
}

function createExerciseMap(exercises: Exercise[] = []) {
  const exerciseMap = new Map<string, Exercise>();

  for (const exercise of exercises) {
    exerciseMap.set(exercise.id, exercise);
    exerciseMap.set(exercise.id.toLowerCase(), exercise);
  }

  return exerciseMap;
}

function collectDraftExerciseIds(draft: WorkoutPlanDraft) {
  return [
    ...new Set(
      draft.days.flatMap((day) =>
        day.sections.flatMap((section) => section.items.map((item) => item.exerciseId)),
      ),
    ),
  ];
}

async function fetchExerciseById(exerciseId: string) {
  const data = await clientRequest<ExerciseApiResponse>(
    `/api/exercises/${encodeURIComponent(exerciseId)}`,
    { errorMessage: "动作详情加载失败" },
  );

  return data.item;
}

async function fetchDraftExercises(draft: WorkoutPlanDraft, cachedExercises: Map<string, Exercise>) {
  const ids = collectDraftExerciseIds(draft);
  const exercises = await Promise.all(
    ids.map(async (id) => findExerciseById(id, cachedExercises) ?? fetchExerciseById(id)),
  );

  return exercises;
}

function toFallbackPreviewExercise(item: WorkoutPlanItemDraft): Exercise {
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

export function WorkoutPlanDraftCard({
  draft,
  initialExercises = emptyInitialExercises,
}: WorkoutPlanDraftCardProps) {
  const router = useRouter();
  const [activeDayIndex, setActiveDayIndex] = useState(
    draft.days[0]?.cycleDayIndex ?? 1
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedImportOptionId, setSelectedImportOptionId] =
    useState<WorkoutPlanImportOption["id"]>("cycle-1");
  const [fetchedExerciseMap, setFetchedExerciseMap] = useState<Map<string, Exercise>>(() => new Map());

  const [activePreviewExercise, setActivePreviewExercise] = useState<Exercise | null>(null);
  const [activePreviewTip, setActivePreviewTip] = useState<string | undefined>();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const initialExerciseMap = useMemo(() => createExerciseMap(initialExercises), [initialExercises]);
  const exerciseMap = useMemo(() => {
    const next = new Map(initialExerciseMap);

    for (const [key, exercise] of fetchedExerciseMap) {
      next.set(key, exercise);
    }

    return next;
  }, [fetchedExerciseMap, initialExerciseMap]);

  const handleOpenPreview = (item: WorkoutPlanItemDraft) => {
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

  const draftExerciseIds = useMemo(() => collectDraftExerciseIds(draft), [draft]);

  useEffect(() => {
    const missingExerciseIds = draftExerciseIds.filter(
      (exerciseId) => !findExerciseById(exerciseId, exerciseMap),
    );

    if (missingExerciseIds.length === 0) {
      return;
    }

    let isCancelled = false;

    // 计划卡片首屏需要动作快照；候选缺失或历史会话回放时，批量补齐详情。
    void Promise.allSettled(missingExerciseIds.map((exerciseId) => fetchExerciseById(exerciseId))).then(
      (results) => {
        if (isCancelled) {
          return;
        }

        const loadedExercises = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );

        if (loadedExercises.length === 0) {
          return;
        }

        setFetchedExerciseMap((current) => {
          const next = new Map(current);

          for (const exercise of loadedExercises) {
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

  const activeDay = useMemo(() => {
    return draft.days.find((day) => day.cycleDayIndex === activeDayIndex) ?? draft.days[0];
  }, [draft.days, activeDayIndex]);
  const importOptions = useMemo(() => getWorkoutPlanImportOptions(draft), [draft]);
  const selectedImportOption =
    importOptions.find((option) => option.id === selectedImportOptionId) ??
    importOptions[0] ?? {
      id: "cycle-1",
      label: "导入本周期",
      repeatCount: 1,
      daysToImport: draft.cycleLengthDays,
    };

  const handleSave = async () => {
    setIsSaving(true);
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
      // 只为非休息训练日保存 routine，休息日会在日历中生成 rest schedule。
      const draftRoutines = getWorkoutPlanTrainingDays(draft).map((day) => {
        const workout = convertWorkoutPlanDraftToWorkoutRoutine(draft, draftExercises, {
          dayIndex: day.cycleDayIndex,
        });
        workout.title = `[${draft.title}] ${day.title || `训练日 ${day.cycleDayIndex || 1}`}`;
        return {
          cycleDayIndex: day.cycleDayIndex,
          workout,
        };
      });
      const persistedWorkouts = await Promise.all(
        draftRoutines.map(async ({ cycleDayIndex, workout }) => ({
          cycleDayIndex,
          routine: await createWorkoutRoutine(workout),
        })),
      );

      // AI 长期计划保存后按周期日序展开到日历，保留训练日和休息日节奏。
      {
        const today = new Date();
        const newWorkoutSchedules = buildWorkoutPlanSchedules(draft, persistedWorkouts, {
          startDate: today,
          daysToImport: selectedImportOption.daysToImport,
        });
        const existingSchedule = await listWorkoutSchedules();
        const importedSessionsToReplace = selectWorkoutPlanSchedulesToReplace(existingSchedule, draft, {
          startDate: today,
          daysToImport: selectedImportOption.daysToImport,
        });

        await Promise.all(importedSessionsToReplace.map((item) => deleteWorkoutSchedule(item.id)));
        await Promise.all(newWorkoutSchedules.map((workout) => createWorkoutSchedule(workout)));
      }

      setSaveSuccess(true);

      // 停留 1.2 秒展现成功状态，随后顺滑跳转
      setTimeout(() => {
        router.push("/plans");
      }, 1200);
    } catch (error) {
      console.error("[WorkoutPlanDraftCard] Save failed:", error);
      alert("保存计划失败，请检查数据。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-push-card relative mt-md overflow-hidden rounded-[20px] border border-line bg-white/95 shadow-card backdrop-blur-md transition-all duration-300 hover:shadow-lift">
      <div className="h-1.5 w-full bg-primary" />

      <div className="p-lg">
        {/* 卡片头部：标题、主要目标和时长 */}
        <div className="flex flex-col gap-xs md:flex-row md:items-start md:justify-between">
          <div>
            <span className="mb-xs inline-flex items-center rounded-lg bg-primary-soft px-sm py-xs font-label-xs text-label-xs font-bold text-primary">
              训练计划
            </span>
            <h3 className="flex items-center gap-xs font-title-lg text-title-lg font-bold text-on-surface">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <SymbolIcon className="text-[18px]">sports_gymnastics</SymbolIcon>
              </span>
              {draft.title}
            </h3>
            <p className="mt-xs font-body-sm text-body-sm text-muted">
              {draft.summary}
            </p>
          </div>
          <div className="mt-sm flex flex-wrap gap-xs md:mt-0">
            <span className="inline-flex items-center gap-1 rounded-lg bg-panel-soft px-sm py-xs font-label-sm text-label-sm text-ink">
              <SymbolIcon className="text-[14px]">event_repeat</SymbolIcon>
              {draft.cycleLengthDays} 天周期
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-panel-soft px-sm py-xs font-label-sm text-label-sm text-ink">
              <SymbolIcon className="text-[14px]">exercise</SymbolIcon>
              训练 {draft.trainingDayCount} 天 · 休息 {draft.restDayCount} 天
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary-soft px-sm py-xs font-label-sm text-label-sm font-bold text-primary">
              <SymbolIcon className="text-[14px]">schedule</SymbolIcon>
              单次 {draft.estimatedSessionMinutes} 分钟
            </span>
          </div>
        </div>

        {/* 安全注意警告 (防伤病核心提示) */}
        {draft.safetyNotes && draft.safetyNotes.length > 0 && (
          <div className="mt-md flex items-start gap-xs rounded-xl bg-amber-50/80 p-md border border-amber-200/50 text-amber-900 shadow-sm">
            <SymbolIcon className="text-amber-600 mt-[2px] shrink-0 text-[18px]">warning</SymbolIcon>
            <div className="font-body-xs text-body-xs leading-relaxed">
              <strong className="font-bold">安全建议与限制说明：</strong>
              {draft.safetyNotes.join("；")}
            </div>
          </div>
        )}

        <div className="mt-md grid gap-sm md:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel-soft p-md">
            <p className="font-label-xs text-label-xs font-bold text-muted">递进节奏</p>
            <p className="mt-xs font-body-sm text-body-sm text-on-surface">{draft.progression}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel-soft p-md">
            <p className="font-label-xs text-label-xs font-bold text-muted">恢复策略</p>
            <p className="mt-xs font-body-sm text-body-sm text-on-surface">{draft.recoveryStrategy}</p>
          </div>
        </div>

        {/* 训练日切换 Tabs */}
        {draft.days.length > 1 && (
          <div className="mt-lg flex gap-xs border-b border-outline-variant/30 pb-xs overflow-x-auto custom-scrollbar">
            {draft.days.map((day, idx) => {
              const dayIdx = day.cycleDayIndex ?? (idx + 1);
              return (
                <button
                  key={dayIdx}
                  onClick={() => setActiveDayIndex(dayIdx)}
                  className={`flex items-center gap-xs rounded-lg px-md py-sm font-label-md text-label-md transition-all whitespace-nowrap ${
                    activeDayIndex === dayIdx
                      ? "bg-primary text-white shadow-sm shadow-primary/20 scale-[1.02]"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                  type="button"
                >
                  <span>{day.isRestDay ? `休息 ${dayIdx}` : day.title || `训练日 ${dayIdx}`}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 当前训练日计划详情 */}
        {activeDay && (
          <div className="mt-md space-y-md">
            <div className="flex flex-col gap-xs md:flex-row md:items-center md:justify-between">
              <span className="font-label-sm text-label-sm font-bold text-on-surface-variant flex items-center gap-1">
                <SymbolIcon className="text-[16px]">ads_click</SymbolIcon>
                第 {activeDay.cycleDayIndex} 天 · {activeDay.dayType} · {activeDay.focus}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                <SymbolIcon className="text-[16px]">timelapse</SymbolIcon>
                预估用时：{activeDay.estimatedMinutes} 分钟
              </span>
            </div>

            {activeDay.isRestDay ? (
              <div className="rounded-xl border border-line bg-panel-soft p-md">
                <p className="font-body-sm text-body-sm text-on-surface">
                  {(activeDay.recoveryNotes.length ? activeDay.recoveryNotes : activeDay.safetyNotes).join("；") ||
                    "安排低强度恢复，保持轻松活动和充足睡眠。"}
                </p>
              </div>
            ) : (
              <div className="space-y-sm">
                {workoutSectionConfigs.map((sectionConfig) => {
                  const section = activeDay.sections.find((candidate) => candidate.section === sectionConfig.id);

                  if (!section) {
                    return null;
                  }

                  return (
                    <div className="space-y-xs" key={section.section}>
                      <div className="flex items-center gap-xs">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <SymbolIcon className="text-[15px]">{sectionConfig.icon}</SymbolIcon>
                        </span>
                        <div>
                          <p className="font-label-sm text-label-sm font-bold text-on-surface">
                            {sectionConfig.title}
                          </p>
                          <p className="font-label-xs text-label-xs text-muted">{section.title}</p>
                        </div>
                      </div>
                      {section.items.map((item, index) => {
                        const exercise = findExerciseById(item.exerciseId, exerciseMap);

                        return (
                          <WorkoutDraftExerciseItem
                            exercise={exercise}
                            exerciseId={item.exerciseId}
                            key={`${section.section}-${item.exerciseId}-${index}`}
                            mode={item.mode}
                            notes={item.notes}
                            onOpenPreview={() => handleOpenPreview(item)}
                            sets={item.sets}
                            target={item.target}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 本训练日专属安全建议 */}
            {activeDay.safetyNotes && activeDay.safetyNotes.length > 0 && (
              <p className="rounded-lg bg-surface-container-low px-md py-sm font-label-xs text-label-xs text-on-surface-variant border-l-2 border-primary/50">
                📌 <strong className="text-on-surface">防伤提示：</strong>
                {activeDay.safetyNotes.join("；")}
              </p>
            )}
          </div>
        )}

        {/* 排班计划设置区域 */}
        <div className="mt-lg rounded-2xl border border-outline-variant bg-surface-container-low p-md transition-all duration-300">
            <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="flex items-center gap-xs font-label-md text-label-md font-bold text-on-surface">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <SymbolIcon className="text-[14px]">calendar_month</SymbolIcon>
                  </span>
                  周期导入
                </h4>
                <p className="mt-xs font-body-xs text-body-xs text-on-surface-variant">
                  按 {draft.cycleLengthDays} 天周期重复铺排训练日和休息日。
                </p>
              </div>
              <div className="flex items-center gap-xs rounded-xl bg-surface px-xs py-xs shadow-sm border border-outline-variant/30 shrink-0">
                {importOptions.map((option) => (
                  <button
                    className={`rounded-lg px-md py-xs font-label-sm text-label-sm font-bold transition-all ${
                      selectedImportOption.id === option.id
                        ? "bg-primary text-white shadow-sm"
                        : "text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                    key={option.id}
                    onClick={() => setSelectedImportOptionId(option.id)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
        </div>

        {/* 底部操作闭环区 */}
        <div className="mt-lg flex flex-col gap-md border-t border-outline-variant/40 pt-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="font-label-xs text-label-xs text-on-surface-variant">
            {`* 导入后将保存训练日 routine，并排定未来 ${selectedImportOption.daysToImport} 天的周期日程`}
          </p>
          <button
            onClick={handleSave}
            disabled={isSaving || saveSuccess}
            className={`flex items-center justify-center gap-xs rounded-full px-xl py-md font-label-md text-label-md font-bold shadow-md transition-all active:scale-[0.97] disabled:scale-100 disabled:opacity-60 ${
              saveSuccess
                ? "bg-green-500 text-white shadow-green-200/50"
                : "bg-primary text-white hover:bg-primary/95 hover:shadow-primary/30"
            }`}
            type="button"
          >
            {saveSuccess ? (
              <>
                <SymbolIcon className="animate-bounce">check_circle</SymbolIcon>
                导入成功！正在为您跳转...
              </>
            ) : isSaving ? (
              <>
                <SymbolIcon className="animate-spin">autorenew</SymbolIcon>
                正在为您导入计划...
              </>
            ) : (
              <>
                <SymbolIcon>save_alt</SymbolIcon>
                确认并导入此计划
              </>
            )}
          </button>
        </div>
      </div>

      {/* 底部悬浮动作详情右侧抽屉 */}
      <ExercisePreviewSheet
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        exercise={activePreviewExercise}
        executionTip={activePreviewTip}
      />
    </div>
  );
}
