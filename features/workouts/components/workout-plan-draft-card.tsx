"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import {
  createWorkoutSchedule,
  createWorkoutRoutine,
  deleteWorkoutSchedule,
  listWorkoutSchedules,
} from "@/features/workouts/api/workout-data-client";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutPlanDraft, WorkoutPlanItemDraft } from "@/lib/shared/workout-plans/draft-schema";
import { convertWorkoutPlanDraftToWorkoutRoutine } from "@/features/workout-plans/lib/workout-routine-conversion";
import { clientRequest } from "@/lib/client/http/client-request";
import {
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getWorkoutTimingConfig,
  placeholderWorkoutImage,
  type WorkoutSchedule,
} from "@/lib/shared/workouts/composition";

interface WorkoutPlanDraftCardProps {
  draft: WorkoutPlanDraft;
  initialExercises?: Exercise[];
}

const placeholderImage = placeholderWorkoutImage;
const emptyInitialExercises: Exercise[] = [];

type ExerciseApiResponse = {
  item: Exercise;
};

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

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
  return [...new Set(draft.days.flatMap((day) => day.items.map((item) => item.exerciseId)))];
}

async function fetchExerciseById(exerciseId: string) {
  const data = await clientRequest<ExerciseApiResponse>(
    `/api/exercises/${encodeURIComponent(exerciseId)}`,
    { errorMessage: "动作详情加载失败" },
  );

  return data.item;
}

async function fetchDraftExercises(draft: WorkoutPlanDraft, cachedExercises: Map<string, Exercise>) {
  const ids = [
    ...new Set(draft.days.flatMap((day) => day.items.map((item) => item.exerciseId))),
  ];
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
    imageUrls: [placeholderImage],
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
    draft.days[0]?.dayIndex ?? 1
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [scheduleRange, setScheduleRange] = useState<7 | 28>(28);
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
    return draft.days.find((day) => day.dayIndex === activeDayIndex) ?? draft.days[0];
  }, [draft.days, activeDayIndex]);

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
      // 1. 全量保存 Routine
      const draftRoutines = draft.days.map((day) => {
        const workout = convertWorkoutPlanDraftToWorkoutRoutine(draft, draftExercises, {
          dayIndex: day.dayIndex,
        });
        // 润色命名：[计划标题] 训练日标题
        workout.title = `[${draft.title}] ${day.title || `训练日 ${day.dayIndex || 1}`}`;
        return workout;
      });
      const persistedWorkouts = await Promise.all(draftRoutines.map((workout) => createWorkoutRoutine(workout)));

      // AI 长期计划保存后会按频次生成日历安排。
      {
        const today = new Date();
        const trainingDaysMap: Record<number, number[]> = {
          1: [3], // 周三
          2: [2, 4], // 周二、周四
          3: [1, 3, 5], // 周一、周三、周五
          4: [1, 2, 4, 5], // 周一、周二、周四、周五
          5: [1, 2, 3, 5, 6], // 周一、周二、周三、周五、周六
          6: [1, 2, 3, 4, 5, 6], // 周一至周六
          7: [1, 2, 3, 4, 5, 6, 7], // 每天
        };

        const newWorkoutSchedules: WorkoutSchedule[] = [];
        let trainingDayCount = 0;

        for (let d = 0; d < scheduleRange; d++) {
          const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
          const dateKey = toDateKey(targetDate);
          const dayOfWeek = targetDate.getDay() === 0 ? 7 : targetDate.getDay();
          const isTrainingDay = (trainingDaysMap[draft.weeklyFrequency] || [1, 3, 5]).includes(dayOfWeek);

          if (isTrainingDay) {
            const workout = persistedWorkouts[trainingDayCount % persistedWorkouts.length];
            const timingConfig = getWorkoutTimingConfig(workout);
            trainingDayCount++;

            newWorkoutSchedules.push({
              id: `${workout.id}-${dateKey}-${crypto.randomUUID()}`,
              date: dateKey,
              routineId: workout.id,
              title: workout.title,
              status: "planned",
              minutes: estimateWorkoutMinutes(workout.items, {
                minimumMinutes: 15,
                ...timingConfig,
              }),
              calories: estimateWorkoutCalories(workout.items, {
                minimumCalories: 80,
                ...timingConfig,
              }),
              items: workout.items,
              ...timingConfig,
              sourceRoutineTitle: draft.title,
            });
          } else {
            newWorkoutSchedules.push({
              id: `rest-${dateKey}-${crypto.randomUUID()}`,
              date: dateKey,
              title: "休息日",
              status: "rest",
              minutes: 0,
              calories: 0,
              items: [],
              sourceRoutineTitle: draft.title,
            });
          }
        }

        // 只替换同一计划来源的旧安排，避免误删用户手动安排或其他计划。
        const startRangeKey = toDateKey(today);
        const endRangeDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + scheduleRange - 1);
        const endRangeKey = toDateKey(endRangeDate);
        const existingSchedule = await listWorkoutSchedules();
        const importedSessionsToReplace = existingSchedule.filter((item) => {
          const isInRange = item.date >= startRangeKey && item.date <= endRangeKey;
          const isSameImportedPlan = item.sourceRoutineTitle === draft.title;

          return isInRange && isSameImportedPlan;
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
              每周 {draft.weeklyFrequency} 次
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

        {/* 训练日切换 Tabs */}
        {draft.days.length > 1 && (
          <div className="mt-lg flex gap-xs border-b border-outline-variant/30 pb-xs overflow-x-auto custom-scrollbar">
            {draft.days.map((day, idx) => {
              const dayIdx = day.dayIndex ?? (idx + 1);
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
                  <span>{day.title || `训练日 ${dayIdx}`}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 当前训练日计划详情 */}
        {activeDay && (
          <div className="mt-md space-y-md">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm font-bold text-on-surface-variant flex items-center gap-1">
                <SymbolIcon className="text-[16px]">ads_click</SymbolIcon>
                今日焦点：{activeDay.focus}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                <SymbolIcon className="text-[16px]">timelapse</SymbolIcon>
                预估用时：{activeDay.estimatedMinutes} 分钟
              </span>
            </div>

            {/* 当天动作列表卡片流 */}
            <div className="space-y-sm">
              {activeDay.items.map((item, index) => {
                const exercise = findExerciseById(item.exerciseId, exerciseMap);
                const exerciseName = exercise?.nameZh || item.exerciseId;
                const category = exercise?.categoryZh || "加载中";
                const equipment = exercise?.equipmentZh || "加载中";
                const image = exercise?.imageUrls?.[0] || placeholderImage;

                return (
                  <div
                    key={`${item.exerciseId}-${index}`}
                    onClick={() => handleOpenPreview(item)}
                    className="flex items-center gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md hover:border-primary-container/40 hover:shadow-sm cursor-pointer transition-all duration-200 group"
                  >
                    {/* 动作封面图片 */}
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
                      <Image
                        alt={exerciseName}
                        className="object-cover transition-transform duration-300 hover:scale-105"
                        fill
                        sizes="64px"
                        src={image}
                      />
                    </div>

                    {/* 动作内容与参数 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-sm">
                        <div>
                          <h4 className="font-body-md text-body-md font-bold text-on-surface truncate flex items-center gap-xs">
                            <span className="truncate">{exerciseName}</span>
                            <span className="inline-flex items-center gap-[2px] rounded-full bg-primary/10 px-sm py-[2px] font-label-xs text-label-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <SymbolIcon className="text-[12px]">info</SymbolIcon>
                              <span>查看教学</span>
                            </span>
                          </h4>
                          <div className="mt-xs flex items-center gap-xs font-label-xs text-label-xs text-on-surface-variant">
                            <span className="rounded bg-surface-container px-1 py-[2px]">{category}</span>
                            <span className="text-outline-variant">•</span>
                            <span>{equipment}</span>
                          </div>
                        </div>
                        {/* 组数/次数指标 */}
                        <div className="text-right shrink-0">
                          <p className="font-body-lg text-body-lg font-black text-primary">
                            {item.sets}<span className="font-normal text-on-surface-variant">组</span>
                          </p>
                          <p className="mt-xs font-label-md text-label-md font-bold text-on-surface-variant">
                            每组{item.target}{item.mode === "reps" ? "次" : "秒"}
                          </p>
                        </div>
                      </div>

                      {item.notes && (
                        <div className="mt-sm flex flex-wrap items-center justify-end gap-sm border-t border-outline-variant/30 pt-xs">
                          <p className="font-label-xs text-label-xs text-primary truncate max-w-[200px]" title={item.notes}>
                            💡 {item.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

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
                  日历日程智能排班
                </h4>
                <p className="mt-xs font-body-xs text-body-xs text-on-surface-variant">
                  智能排班系统将根据每周 {draft.weeklyFrequency} 次频次，规律合理地铺满您的训练日程。
                </p>
              </div>
              <div className="flex items-center gap-xs rounded-xl bg-surface px-xs py-xs shadow-sm border border-outline-variant/30 shrink-0">
                <button
                  onClick={() => setScheduleRange(7)}
                  className={`rounded-lg px-md py-xs font-label-sm text-label-sm font-bold transition-all ${
                    scheduleRange === 7
                      ? "bg-primary text-white shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                  type="button"
                >
                  未来 1 周
                </button>
                <button
                  onClick={() => setScheduleRange(28)}
                  className={`rounded-lg px-md py-xs font-label-sm text-label-sm font-bold transition-all ${
                    scheduleRange === 28
                      ? "bg-primary text-white shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                  type="button"
                >
                  未来 4 周 (推荐)
                </button>
              </div>
            </div>
        </div>

        {/* 底部操作闭环区 */}
        <div className="mt-lg flex flex-col gap-md border-t border-outline-variant/40 pt-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="font-label-xs text-label-xs text-on-surface-variant">
            {`* 导入后将全量保存动作，并排定未来 ${scheduleRange === 7 ? "1" : "4"} 周的日历计划`}
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
