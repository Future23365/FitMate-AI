"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import {
  createWorkoutRoutine,
  deleteWorkoutRoutine as deleteWorkoutRoutineRequest,
  getWorkoutRoutine,
  listWorkoutRoutines,
  saveWorkoutRoutine,
} from "@/features/workouts/api/workout-data-client";
import { clientRequest } from "@/lib/client/http/client-request";
import type { Exercise, ExerciseFacets } from "@/lib/shared/exercises/types";
import {
  clampLoopRounds,
  defaultSetRestSeconds,
  defaultTrainingLoopRestSeconds,
  defaultTrainingLoopRounds,
  defaultTransitionRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getSectionItems,
  getTotalWorkoutSets,
  inferWorkoutSection,
  loopRoundOptions,
  normalizeWorkoutRoutine,
  normalizeWorkoutItem,
  placeholderWorkoutImage,
  restOptions,
  workoutSectionConfigs,
  type WorkoutRoutine,
  type WorkoutItem,
  type WorkoutMode,
  type WorkoutSection,
} from "@/lib/shared/workouts/composition";

type ExerciseApiResponse = {
  items: Exercise[];
  total: number;
  facets: ExerciseFacets;
};

type TemplateExerciseConfig = {
  query: string;
  preferredIds: string[];
  mode?: WorkoutMode;
  section?: WorkoutSection;
  target?: number;
  sets?: number;
  setRestSeconds?: number;
  transitionRestSeconds?: number;
};

const sectionConfigs = workoutSectionConfigs;
const defaultExerciseFacets: ExerciseFacets = {
  categories: [],
  levels: [],
  force: [],
  mechanics: [],
  equipment: [],
  homeRequirements: [],
  muscles: [],
  goalTags: [],
  riskTags: [],
};

const templateExerciseConfigs: TemplateExerciseConfig[] = [
  {
    query: "开合跳",
    preferredIds: ["Jumping_Jacks", "Jumping_Jack"],
    mode: "duration",
    section: "warmup",
    target: 40,
    sets: 2,
    setRestSeconds: 20,
    transitionRestSeconds: 20,
  },
  {
    query: "自重深蹲",
    preferredIds: ["Bodyweight_Squat", "Chair_Squat"],
    mode: "reps",
    section: "training",
    target: 12,
    sets: 4,
    setRestSeconds: 30,
    transitionRestSeconds: 20,
  },
  {
    query: "俯卧撑",
    preferredIds: ["Pushups", "Incline_Push-Up"],
    mode: "reps",
    section: "training",
    target: 15,
    sets: 3,
    setRestSeconds: 30,
    transitionRestSeconds: 20,
  },
  {
    query: "平板支撑",
    preferredIds: ["Plank", "Push_Up_to_Side_Plank"],
    mode: "duration",
    section: "training",
    target: 45,
    sets: 3,
    setRestSeconds: 20,
    transitionRestSeconds: 20,
  },
  {
    query: "拉伸",
    preferredIds: ["Standing_Hamstring_and_Calf_Stretch", "Seated_Hamstring_Stretch"],
    mode: "duration",
    section: "stretch",
    target: 45,
    sets: 2,
    setRestSeconds: 15,
    transitionRestSeconds: 20,
  },
];

function toWorkoutItem(
  exercise: Exercise,
  overrides: Partial<
    Pick<WorkoutItem, "mode" | "target" | "sets" | "setRestSeconds" | "transitionRestSeconds" | "section">
  > = {},
): WorkoutItem {
  const category = exercise.categoryZh || "训练";
  const imageUrls = exercise.imageUrls.length ? exercise.imageUrls : [placeholderWorkoutImage];
  const isDuration =
    category.includes("拉伸") ||
    exercise.nameZh.includes("支撑") ||
    exercise.nameZh.includes("伸展");

  return {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    nameEn: exercise.nameEn,
    categoryZh: category,
    equipmentZh: exercise.equipmentZh || "未标注器械",
    musclesZh: exercise.primaryMusclesZh.length ? exercise.primaryMusclesZh : ["综合"],
    instructionsZh: exercise.instructionsZh,
    imageUrl: imageUrls[0],
    imageUrls,
    mode: overrides.mode ?? (isDuration ? "duration" : "reps"),
    target: overrides.target ?? (isDuration ? 45 : 12),
    sets: overrides.sets ?? 1,
    setRestSeconds: overrides.setRestSeconds ?? defaultSetRestSeconds,
    transitionRestSeconds: overrides.transitionRestSeconds ?? defaultTransitionRestSeconds,
    section: overrides.section ?? "training",
  };
}

function toPreviewExercise(item: WorkoutItem, exerciseById: Map<string, Exercise>): Exercise {
  const matchedExercise = exerciseById.get(item.exerciseId);

  if (matchedExercise) {
    return matchedExercise;
  }

  return {
    id: item.exerciseId,
    source: "local",
    sourceUrl: "",
    sourceId: item.exerciseId,
    license: "",
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    category: null,
    categoryZh: item.categoryZh,
    level: null,
    levelZh: null,
    force: null,
    forceZh: null,
    mechanic: null,
    mechanicZh: null,
    equipment: null,
    equipmentZh: item.equipmentZh,
    homeRequirement: "unknown",
    homeRequirementZh: "未标注",
    primaryMuscles: [],
    primaryMusclesZh: item.musclesZh,
    secondaryMuscles: [],
    secondaryMusclesZh: [],
    instructionsEn: [],
    instructionsZh: item.instructionsZh,
    images: [],
    imageUrls: item.imageUrls?.length ? item.imageUrls : [item.imageUrl || placeholderWorkoutImage],
    riskTags: [],
    goalTags: [],
    reviewStatus: "fallback",
    isPublished: true,
  };
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function changeNumber(value: number, delta: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value + delta));
}

async function fetchTemplateExercise(config: TemplateExerciseConfig) {
  const params = new URLSearchParams({
    pageSize: "20",
    q: config.query,
    sort: "level_asc",
  });
  const data = await clientRequest<ExerciseApiResponse>(`/api/exercises?${params.toString()}`, {
    errorMessage: "模板动作加载失败",
  });
  const preferredExercise = config.preferredIds
    .map((id) => data.items.find((exercise) => exercise.id === id))
    .find(Boolean);

  return (
    preferredExercise ??
    data.items.find((exercise) => exercise.equipmentZh === "自重") ??
    data.items[0] ??
    null
  );
}

export function ActionComposerPage() {
  const [planTitle, setPlanTitle] = useState("我的燃脂循环训练");
  const [titleDraft, setTitleDraft] = useState(planTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [workoutRoutines, setWorkoutRoutines] = useState<WorkoutRoutine[]>([]);
  const [activeWorkoutRoutineId, setActiveWorkoutRoutineId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [libraryItems, setLibraryItems] = useState<Exercise[]>([]);
  const [exerciseCache, setExerciseCache] = useState<Map<string, Exercise>>(() => new Map());
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryFacets, setLibraryFacets] = useState<ExerciseFacets>(defaultExerciseFacets);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [libraryWorkoutSection, setLibraryWorkoutSection] = useState<WorkoutSection>("training");
  const [libraryMuscle, setLibraryMuscle] = useState("");
  const [libraryEquipment, setLibraryEquipment] = useState("");
  const [libraryLevel, setLibraryLevel] = useState("");
  const [libraryHomeRequirement, setLibraryHomeRequirement] = useState("");
  const [selectedLibraryExerciseId, setSelectedLibraryExerciseId] = useState("");
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [draggingItemId, setDraggingItemId] = useState("");
  const [dragOverItemId, setDragOverItemId] = useState("");
  const [selectedSection, setSelectedSection] = useState<WorkoutSection>("training");
  const [trainingLoopRounds, setTrainingLoopRounds] = useState(defaultTrainingLoopRounds);
  const [trainingLoopRestSeconds, setTrainingLoopRestSeconds] = useState(defaultTrainingLoopRestSeconds);
  const [activePreviewExercise, setActivePreviewExercise] = useState<Exercise | null>(null);
  const [activePreviewSource, setActivePreviewSource] = useState<"library" | "plan" | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const hasHandledInitialWorkoutLoadRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      pageSize: "30",
      sort: "name_asc",
    });

    if (libraryQuery.trim()) {
      params.set("q", libraryQuery.trim());
    }

    if (libraryCategory) {
      params.set("category", libraryCategory);
    }

    params.set("workoutSection", libraryWorkoutSection);

    if (libraryMuscle) {
      params.set("muscle", libraryMuscle);
    }

    if (libraryEquipment) {
      params.set("equipment", libraryEquipment);
    }

    if (libraryLevel) {
      params.set("level", libraryLevel);
    }

    if (libraryHomeRequirement) {
      params.set("homeRequirement", libraryHomeRequirement);
    }

    clientRequest<ExerciseApiResponse>(`/api/exercises?${params.toString()}`, {
      signal: controller.signal,
      errorMessage: "动作库加载失败",
    })
      .then((data) => {
        setLibraryItems(data.items);
        setExerciseCache((current) => {
          const next = new Map(current);
          data.items.forEach((exercise) => next.set(exercise.id, exercise));
          return next;
        });
        setLibraryTotal(data.total);
        setLibraryFacets(data.facets);
        setSelectedLibraryExerciseId((current) =>
          data.items.some((exercise) => exercise.id === current)
            ? current
            : data.items[0]?.id ?? "",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLibraryItems([]);
        setLibraryTotal(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingLibrary(false);
        }
      });

    return () => controller.abort();
  }, [
    libraryCategory,
    libraryEquipment,
    libraryHomeRequirement,
    libraryLevel,
    libraryMuscle,
    libraryQuery,
    libraryWorkoutSection,
  ]);

  useEffect(() => {
    async function loadFromHash() {
      const hashId = window.location.hash.slice(1);

      if (!hashId) {
        return;
      }

      try {
        const matchedWorkout = await getWorkoutRoutine(hashId);
        openWorkoutRoutine(matchedWorkout, false);
      } catch {
        setSaveStatus("训练编排读取失败");
      }
    }

    void loadFromHash();
    window.addEventListener("hashchange", loadFromHash);

    return () => window.removeEventListener("hashchange", loadFromHash);
  }, []);

  useEffect(() => {
    async function syncWorkoutRoutines() {
      try {
        const nextWorkouts = await listWorkoutRoutines();
        setWorkoutRoutines(nextWorkouts.map(normalizeWorkoutRoutine));

        if (!hasHandledInitialWorkoutLoadRef.current) {
          hasHandledInitialWorkoutLoadRef.current = true;

          const hashId = window.location.hash.slice(1);
          if (!hashId && nextWorkouts.length > 0 && !activeWorkoutRoutineId && items.length === 0) {
            openWorkoutRoutine(nextWorkouts[0], false);
          }
        }
      } catch {
        setSaveStatus("已保存编排加载失败");
        setWorkoutRoutines([]);
      }
    }

    void syncWorkoutRoutines();
    window.addEventListener("fitmate:workouts-updated", syncWorkoutRoutines);

    return () => {
      window.removeEventListener("fitmate:workouts-updated", syncWorkoutRoutines);
    };
  }, [activeWorkoutRoutineId, items.length]);

  useEffect(() => {
    if (!saveStatus) {
      return;
    }

    const timer = window.setTimeout(() => setSaveStatus(""), 1800);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    if (!isEditingTitle) {
      return;
    }

    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];
  const selectedLibraryExercise =
    libraryItems.find((exercise) => exercise.id === selectedLibraryExerciseId) ?? libraryItems[0];
  const workoutEstimateOptions = { trainingLoopRestSeconds, trainingLoopRounds };
  const totalMinutes = estimateWorkoutMinutes(items, workoutEstimateOptions);
  const totalCalories = estimateWorkoutCalories(items, workoutEstimateOptions);
  const totalSets = getTotalWorkoutSets(items, trainingLoopRounds);
  const hasLibraryFilters =
    Boolean(libraryQuery.trim()) ||
    Boolean(libraryCategory) ||
    Boolean(libraryMuscle) ||
    Boolean(libraryEquipment) ||
    Boolean(libraryHomeRequirement) ||
    Boolean(libraryLevel);

  function updateItem(id: string, updater: (item: WorkoutItem) => WorkoutItem) {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  // 标题更新集中在这里，避免展示态标题和编辑态草稿在切换编排时出现不同步。
  function applyPlanTitle(nextTitle: string) {
    setPlanTitle(nextTitle);
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
  }

  function startTitleEdit() {
    setTitleDraft(planTitle);
    setIsEditingTitle(true);
    setSaveStatus("");
  }

  function commitTitleEdit() {
    const nextTitle = titleDraft.trim() || "未命名动作编排";
    applyPlanTitle(nextTitle);
  }

  function cancelTitleEdit() {
    setTitleDraft(planTitle);
    setIsEditingTitle(false);
  }

  function addExercise(exercise: Exercise, section = selectedSection) {
    const nextItem = toWorkoutItem(exercise, { section });
    setItems((current) => [...current, nextItem]);
    setSelectedItemId(nextItem.id);
    setSelectedLibraryExerciseId("");
    setSelectedSection(section);
    setSaveStatus("");
  }

  function openLibraryPreview(exercise: Exercise) {
    setSelectedLibraryExerciseId(exercise.id);
    setActivePreviewExercise(exercise);
    setActivePreviewSource("library");
  }

  function openPlanPreview(item: WorkoutItem) {
    setActivePreviewExercise(toPreviewExercise(item, exerciseCache));
    setActivePreviewSource("plan");
  }

  function closePreviewSheet() {
    setActivePreviewExercise(null);
    setActivePreviewSource(null);
  }

  function addPreviewExercise() {
    if (!activePreviewExercise) {
      return;
    }

    addExercise(activePreviewExercise);
    closePreviewSheet();
  }

  function resetLibraryFilters() {
    setLibraryQuery("");
    setLibraryCategory("");
    setLibraryMuscle("");
    setLibraryEquipment("");
    setLibraryHomeRequirement("");
    setLibraryLevel("");
  }

  function duplicateItem(item: WorkoutItem) {
    const nextItem = { ...item, id: crypto.randomUUID(), nameZh: `${item.nameZh} 副本` };
    setItems((current) => {
      const index = current.findIndex((currentItem) => currentItem.id === item.id);
      return [...current.slice(0, index + 1), nextItem, ...current.slice(index + 1)];
    });
    setSelectedItemId(nextItem.id);
  }

  function deleteItem(id: string) {
    setItems((current) => {
      const nextItems = current.filter((item) => item.id !== id);
      setSelectedItemId(nextItems[0]?.id ?? "");
      return nextItems;
    });
  }

  async function importTemplate() {
    setSaveStatus("正在从动作库生成模板...");

    try {
      const templateExercises = await Promise.all(
        templateExerciseConfigs.map(async (config) => ({
          config,
          exercise: await fetchTemplateExercise(config),
        })),
      );
      const nextItems = templateExercises.flatMap(({ config, exercise }) =>
        exercise
          ? [
              toWorkoutItem(exercise, {
                mode: config.mode,
                section: config.section,
                target: config.target,
                sets: config.sets,
                setRestSeconds: config.setRestSeconds,
                transitionRestSeconds: config.transitionRestSeconds,
              }),
            ]
          : [],
      );

      if (!nextItems.length) {
        setSaveStatus("动作库中没有找到可用模板动作");
        return;
      }

      const selectedIds = new Set(nextItems.map((item) => item.exerciseId));
      const supplementalItems = libraryItems
        .filter((exercise) => !selectedIds.has(exercise.id))
        .filter((exercise) => exercise.equipmentZh === "自重" || exercise.goalTags.includes("home_friendly"))
        .slice(0, Math.max(0, 3 - nextItems.length))
        .map((exercise) => toWorkoutItem(exercise));

      const composedItems = [...nextItems, ...supplementalItems];

      applyPlanTitle("燃脂循环训练 A");
      setTrainingLoopRounds(defaultTrainingLoopRounds);
      setTrainingLoopRestSeconds(defaultTrainingLoopRestSeconds);
      setItems(composedItems);
      setSelectedItemId(composedItems[0]?.id ?? "");
      setSaveStatus(`已从动作库导入 ${composedItems.length} 个模板动作`);
    } catch {
      setSaveStatus("模板动作加载失败");
    }
  }

  function autoSort() {
    const sortedItems = [...items].sort((left, right) => {
      const sectionOrder: WorkoutSection[] = ["warmup", "training", "stretch"];
      return (
        sectionOrder.indexOf(left.section ?? inferWorkoutSection(left)) -
        sectionOrder.indexOf(right.section ?? inferWorkoutSection(right))
      );
    });
    setItems(sortedItems);
    setSaveStatus("已按热身、训练、拉伸排序");
  }

  function insertRest() {
    if (!selectedItem) {
      return;
    }

    updateItem(selectedItem.id, (item) => ({
      ...item,
      transitionRestSeconds:
        restOptions[(restOptions.indexOf(item.transitionRestSeconds) + 1) % restOptions.length] ??
        30,
    }));
    setSaveStatus("已调整动作之间的休息间隔");
  }

  function createNewComposition() {
    applyPlanTitle("新的动作编排");
    setItems([]);
    setTrainingLoopRounds(defaultTrainingLoopRounds);
    setTrainingLoopRestSeconds(defaultTrainingLoopRestSeconds);
    setSelectedItemId("");
    setSelectedSection("training");
    setActiveWorkoutRoutineId("");
    setSaveStatus("已新建空白编排");
    window.history.replaceState(null, "", window.location.pathname);
  }

  function openWorkoutRoutine(workout: WorkoutRoutine, updateHash = true) {
    const normalizedWorkout = normalizeWorkoutRoutine(workout);
    const normalizedItems = normalizedWorkout.items;

    applyPlanTitle(normalizedWorkout.title);
    setItems(normalizedItems);
    setTrainingLoopRounds(normalizedWorkout.trainingLoopRounds ?? 1);
    setTrainingLoopRestSeconds(normalizedWorkout.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds);
    setSelectedItemId(normalizedItems[0]?.id ?? "");
    setSelectedSection(normalizedItems[0]?.section ?? "training");
    setActiveWorkoutRoutineId(workout.id);
    setSaveStatus(`已加载：${workout.title}`);

    if (updateHash) {
      window.history.replaceState(null, "", `#${workout.id}`);
    }
  }

  async function duplicateWorkoutRoutine(workout: WorkoutRoutine) {
    const now = new Date();
    const normalizedWorkout = normalizeWorkoutRoutine(workout);
    const copiedWorkout: WorkoutRoutine = {
      ...normalizedWorkout,
      id: crypto.randomUUID(),
      title: `${normalizedWorkout.title} 副本`,
      updatedAt: formatDateTime(now),
      items: normalizedWorkout.items.map((item) => ({
        ...normalizeWorkoutItem(item),
        id: crypto.randomUUID(),
      })),
    };

    try {
      const savedCopy = await createWorkoutRoutine(copiedWorkout);
      setWorkoutRoutines((current) => [savedCopy, ...current].slice(0, 8));
      setSaveStatus(`已复制：${workout.title}`);
    } catch {
      setSaveStatus("复制训练编排失败");
    }
  }

  async function removeWorkoutRoutine(workout: WorkoutRoutine) {
    const confirmed = window.confirm(`删除已保存编排「${workout.title}」？`);

    if (!confirmed) {
      return;
    }

    try {
      await deleteWorkoutRoutineRequest(workout.id);
      setWorkoutRoutines((current) => current.filter((routine) => routine.id !== workout.id));

      if (activeWorkoutRoutineId === workout.id) {
        setActiveWorkoutRoutineId("");
      }

      setSaveStatus(`已删除：${workout.title}`);
    } catch {
      setSaveStatus("删除训练编排失败");
    }
  }

  async function saveComposition() {
    const now = new Date();
    const activeWorkoutExists = workoutRoutines.some((workout) => workout.id === activeWorkoutRoutineId);
    const routineId = activeWorkoutExists ? activeWorkoutRoutineId : crypto.randomUUID();
    const routine: WorkoutRoutine = {
      id: routineId,
      title: planTitle.trim() || "未命名动作编排",
      updatedAt: formatDateTime(now),
      trainingLoopRounds: clampLoopRounds(trainingLoopRounds),
      trainingLoopRestSeconds,
      items: items.map(normalizeWorkoutItem),
    };

    try {
      const persistedWorkout = activeWorkoutExists
        ? await saveWorkoutRoutine(routine)
        : await createWorkoutRoutine(routine);
      setWorkoutRoutines((current) =>
        activeWorkoutExists
          ? current.map((workout) => (workout.id === routineId ? persistedWorkout : workout))
          : [persistedWorkout, ...current].slice(0, 8),
      );
      setActiveWorkoutRoutineId(routineId);
      window.history.replaceState(null, "", `#${routineId}`);
      setSaveStatus(
        activeWorkoutExists
          ? `已更新：${persistedWorkout.updatedAt}`
          : `已保存：${persistedWorkout.updatedAt}`,
      );
    } catch {
      setSaveStatus("保存训练编排失败，请确认动作来自数据库");
    }
  }

  function moveItem(draggedId: string, targetId: string, targetSection: WorkoutSection) {
    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }

    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);

      if (draggedIndex < 0) {
        return current;
      }

      const nextItems = [...current];
      const [draggedItem] = nextItems.splice(draggedIndex, 1);
      const targetIndex = nextItems.findIndex((item) => item.id === targetId);

      if (targetIndex < 0) {
        return current;
      }

      nextItems.splice(targetIndex, 0, { ...draggedItem, section: targetSection });

      return nextItems;
    });
    setSaveStatus("已调整动作顺序");
  }

  function moveItemToSectionEnd(draggedId: string, targetSection: WorkoutSection) {
    if (!draggedId) {
      return;
    }

    setItems((current) => {
      const draggedItem = current.find((item) => item.id === draggedId);

      if (!draggedItem) {
        return current;
      }

      return [
        ...current.filter((item) => item.id !== draggedId),
        { ...draggedItem, section: targetSection },
      ];
    });
    setSelectedSection(targetSection);
    setSaveStatus(`已移动到${sectionConfigs.find((section) => section.id === targetSection)?.title ?? "当前步骤"}`);
  }

  return (
    <div className="app-mesh-bg min-h-screen text-ink md:pl-[260px] xl:pr-[300px]">
      <main className="custom-scrollbar h-screen overflow-y-auto overflow-x-hidden p-lg pb-28 xl:p-xl">
        <header className="mb-xl flex flex-col gap-lg xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-headline-lg text-headline-lg">个性化动作编排</h1>
            <p className="mt-xs font-body-md text-body-md text-on-surface-variant">
              自由组合训练动作，实时调整训练参数与执行顺序
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <button className="rounded-xl border border-outline px-lg py-sm font-label-md text-label-md transition-colors hover:bg-surface-container-low" onClick={createNewComposition} type="button">
              新增编排
            </button>
            <button className="rounded-xl border border-outline px-lg py-sm font-label-md text-label-md transition-colors hover:bg-surface-container-low" onClick={importTemplate} type="button">
              导入模板
            </button>
            <button className="rounded-xl bg-primary-container px-lg py-sm font-label-md text-label-md text-white shadow-sm transition-opacity hover:opacity-90" onClick={saveComposition} type="button">
              保存编排
            </button>
          </div>
        </header>

        <section className="mb-lg space-y-sm rounded-[20px] border border-line bg-white p-md shadow-card">
          <div className="flex items-center justify-between gap-md">
            <h2 className="flex items-center gap-xs font-title-lg text-title-lg font-extrabold">
              <SymbolIcon className="text-[20px] text-primary">bookmark</SymbolIcon>
              已保存编排
            </h2>
            <span className="font-label-sm text-label-sm text-muted">
              {workoutRoutines.length ? `${workoutRoutines.length} 个` : "暂无保存"}
            </span>
          </div>
          {workoutRoutines.length ? (
            <div className="relative -mx-xs">
              <div className="scrollbar-none flex gap-sm overflow-x-auto px-xs pb-1">
                {workoutRoutines.map((workout) => (
                  <RoutineCompositionCard
                    isActive={workout.id === activeWorkoutRoutineId}
                    key={workout.id}
                    onDelete={() => removeWorkoutRoutine(workout)}
                    onDuplicate={() => duplicateWorkoutRoutine(workout)}
                    onOpen={() => openWorkoutRoutine(workout)}
                    workout={workout}
                  />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-sm rounded-xl border border-dashed border-line bg-panel-soft p-md md:flex-row md:items-center md:justify-between">
              <p className="font-label-md text-label-md text-muted">
                保存当前编排后，会在这里快速切换、复制或删除。
              </p>
              <button
                className="flex shrink-0 items-center justify-center gap-xs rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white transition-colors hover:bg-primary-deep"
                onClick={saveComposition}
                type="button"
              >
                <SymbolIcon className="text-[18px]">save</SymbolIcon>
                保存当前编排
              </button>
            </div>
          )}
        </section>

        <section className="mb-lg rounded-[20px] border border-line bg-white p-md shadow-card">
          <div className="mb-lg rounded-xl border border-line bg-panel px-md py-sm">
            <div className="flex min-w-0 items-center justify-between gap-md py-xs">
              <div className="min-w-0 flex-1">
                {isEditingTitle ? (
                  <div className="flex min-w-0 items-center gap-xs">
                    <input
                      aria-label="编排名称"
                      className="min-w-0 flex-1 rounded-xl border border-primary/35 bg-white px-md py-sm font-title-lg text-title-lg font-extrabold text-ink outline-none ring-4 ring-primary/10"
                      onBlur={commitTitleEdit}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitTitleEdit();
                        }
                        if (event.key === "Escape") {
                          cancelTitleEdit();
                        }
                      }}
                      ref={titleInputRef}
                      value={titleDraft}
                    />
                    <button
                      aria-label="确认编排名称"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-deep"
                      onClick={commitTitleEdit}
                      onMouseDown={(event) => event.preventDefault()}
                      type="button"
                    >
                      <SymbolIcon className="text-[20px]">check</SymbolIcon>
                    </button>
                    <button
                      aria-label="取消编辑编排名称"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-outline-variant bg-white text-outline transition-colors hover:bg-surface-container-low"
                      onClick={cancelTitleEdit}
                      onMouseDown={(event) => event.preventDefault()}
                      type="button"
                    >
                      <SymbolIcon className="text-[20px]">close</SymbolIcon>
                    </button>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-sm">
                    <h2 className="truncate font-headline-md text-headline-md font-extrabold text-ink">
                      {planTitle}
                    </h2>
                    <button
                      aria-label="编辑编排名称"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary transition-colors hover:bg-primary-soft"
                      onClick={startTitleEdit}
                      type="button"
                    >
                      <SymbolIcon className="text-[20px]">edit</SymbolIcon>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-sm grid border-t border-line/70 pt-sm sm:grid-cols-2 xl:grid-cols-4">
              <CompositionMetric icon="schedule" label="预计时长" suffix="min" value={totalMinutes} />
              <CompositionMetric icon="format_list_numbered" label="动作数量" suffix="个" value={items.length} />
              <CompositionMetric icon="repeat" label="预计组数" suffix="组" value={totalSets} />
              <CompositionMetric icon="local_fire_department" label="预估消耗" suffix="kcal" value={totalCalories} primary />
            </div>
          </div>

          <div className="space-y-md">
            {sectionConfigs.map((section, sectionIndex) => {
              const sectionItems = getSectionItems(items, section.id);

              return (
                <WorkoutSectionBlock
                  index={sectionIndex}
                  isSelected={selectedSection === section.id}
                  itemCount={sectionItems.length}
                  key={section.id}
                  loopRounds={trainingLoopRounds}
                  loopRestSeconds={trainingLoopRestSeconds}
                  onAddNext={() => setSelectedSection(section.id)}
                  onDropToEnd={() => {
                    moveItemToSectionEnd(draggingItemId, section.id);
                    setDraggingItemId("");
                    setDragOverItemId("");
                  }}
                  onLoopRoundsChange={setTrainingLoopRounds}
                  onLoopRestSecondsChange={setTrainingLoopRestSeconds}
                  section={section}
                >
                  {sectionItems.map((item, index) => (
                    <div key={item.id}>
                      <WorkoutExerciseRow
                        dragState={dragOverItemId === item.id ? "over" : draggingItemId === item.id ? "dragging" : "idle"}
                        index={index}
                        item={item}
                        onDelete={() => deleteItem(item.id)}
                        onDragEnd={() => {
                          setDraggingItemId("");
                          setDragOverItemId("");
                        }}
                        onDragEnter={() => setDragOverItemId(item.id)}
                        onDragStart={() => {
                          setDraggingItemId(item.id);
                          setDragOverItemId("");
                        }}
                        onDrop={() => {
                          moveItem(draggingItemId, item.id, section.id);
                          setDraggingItemId("");
                          setDragOverItemId("");
                        }}
                        onDuplicate={() => duplicateItem(item)}
                        onPreview={() => openPlanPreview(item)}
                        onUpdate={(updater) => updateItem(item.id, updater)}
                      />
                      {index < sectionItems.length - 1 ? (
                        <RestIntervalControl
                          seconds={item.transitionRestSeconds}
                          onChange={(nextSeconds) =>
                            updateItem(item.id, (current) => ({
                              ...current,
                              transitionRestSeconds: nextSeconds,
                            }))
                          }
                        />
                      ) : null}
                    </div>
                  ))}
                </WorkoutSectionBlock>
              );
            })}
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-center bg-background/80 py-md backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-center gap-xs rounded-[20px] border border-line bg-white p-xs shadow-lift">
            <ToolbarButton icon="auto_awesome" label="自动排序" onClick={autoSort} />
            <ToolbarButton icon="more_time" label="插入休息" onClick={insertRest} />
            <ToolbarButton
              icon="sync_alt"
              label="生成循环训练"
              onClick={() => {
                applyPlanTitle("循环训练计划");
                setTrainingLoopRounds(defaultTrainingLoopRounds);
                setTrainingLoopRestSeconds(defaultTrainingLoopRestSeconds);
                setSelectedSection("training");
              }}
            />
            <ToolbarButton icon="save" label="保存编排" onClick={saveComposition} primary />
          </div>
        </div>

        {saveStatus ? (
          <div className="fixed bottom-lg left-1/2 z-40 -translate-x-1/2 rounded-full bg-inverse-surface px-lg py-sm font-label-md text-label-md text-inverse-on-surface shadow-lg">
            {saveStatus}
          </div>
        ) : null}
      </main>

      <aside className="fixed right-0 top-0 z-30 hidden h-screen w-[300px] flex-col gap-md overflow-y-auto border-l border-line/70 bg-white/68 p-md shadow-nav backdrop-blur-2xl xl:flex">
        <section className="flex min-h-[420px] flex-col">
          <div className="mb-md flex items-center justify-between">
            <h2 className="flex items-center gap-xs font-label-md text-label-md font-bold">
              <SymbolIcon className="text-xl text-primary">folder_open</SymbolIcon>
              动作库
            </h2>
            <span className="rounded bg-surface-container px-xs py-[2px] text-[10px] text-outline">
              {libraryTotal} 条
            </span>
          </div>
          <div className="relative mb-sm">
            <SymbolIcon className="absolute left-sm top-1/2 -translate-y-1/2 text-lg text-outline">
              search
            </SymbolIcon>
            <input
              className="w-full rounded-xl border border-line bg-white py-sm pl-10 pr-md font-label-md text-label-md outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="搜索训练动作..."
              value={libraryQuery}
            />
          </div>
          <div className="mb-sm grid grid-cols-3 gap-xs rounded-xl border border-line bg-surface-container-lowest p-xs">
            {sectionConfigs.map((section) => (
              <button
                className={`flex min-w-0 flex-col items-center gap-[2px] rounded-lg px-xs py-xs text-[10px] font-bold transition-colors ${
                  libraryWorkoutSection === section.id
                    ? "bg-primary text-white"
                    : "text-on-surface-variant hover:bg-primary-soft hover:text-primary"
                }`}
                key={section.id}
                onClick={() => setLibraryWorkoutSection(section.id)}
                type="button"
              >
                <SymbolIcon className="text-[17px]">{section.icon}</SymbolIcon>
                <span className="w-full truncate">{section.title}</span>
              </button>
            ))}
          </div>
          <div className="mb-sm grid grid-cols-2 gap-xs">
            <LibraryFilterSelect
              label="分类"
              onChange={setLibraryCategory}
              options={libraryFacets.categories}
              value={libraryCategory}
            />
            <LibraryFilterSelect
              label="肌群"
              onChange={setLibraryMuscle}
              options={libraryFacets.muscles.slice(0, 16)}
              value={libraryMuscle}
            />
            <LibraryFilterSelect
              label="器械"
              onChange={setLibraryEquipment}
              options={libraryFacets.equipment.slice(0, 16)}
              value={libraryEquipment}
            />
            <LibraryFilterSelect
              label="难度"
              onChange={setLibraryLevel}
              options={libraryFacets.levels}
              value={libraryLevel}
            />
            <LibraryFilterSelect
              label="居家条件"
              onChange={setLibraryHomeRequirement}
              options={libraryFacets.homeRequirements}
              value={libraryHomeRequirement}
            />
            <button
              className="rounded-lg border border-outline-variant bg-white px-sm py-xs text-[11px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasLibraryFilters}
              onClick={resetLibraryFilters}
              type="button"
            >
              清空筛选
            </button>
          </div>
          <div className="custom-scrollbar flex-1 space-y-sm overflow-y-auto pr-xs">
            {isLoadingLibrary ? (
              <p className="rounded-xl bg-surface-container-low p-md text-center font-label-md text-label-md text-on-surface-variant">
                正在加载动作库...
              </p>
            ) : !libraryItems.length ? (
              <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-md text-center">
                <SymbolIcon className="mb-xs text-3xl text-outline">search_off</SymbolIcon>
                <p className="font-label-md text-label-md">没有找到匹配动作</p>
                <button
                  className="mt-sm rounded-full bg-primary px-md py-xs text-[11px] font-bold text-white"
                  onClick={resetLibraryFilters}
                  type="button"
                >
                  重置筛选
                </button>
              </div>
            ) : (
              libraryItems.map((exercise) => {
                const isSelected = exercise.id === selectedLibraryExercise?.id;

                return (
                <div
                  className={`flex w-full items-center gap-sm rounded-xl border p-sm text-left transition-all ${
                    isSelected
                      ? "border-primary-container bg-primary/5 ring-2 ring-primary-container/10"
                      : "border-outline-variant bg-surface-container-lowest hover:border-primary"
                  }`}
                  key={exercise.id}
                  onClick={() => setSelectedLibraryExerciseId(exercise.id)}
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-low">
                    <Image
                      alt=""
                      className="object-cover"
                      fill
                      sizes="40px"
                      src={exercise.imageUrls[0] || placeholderWorkoutImage}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-label-md text-label-md font-bold">{exercise.nameZh}</p>
                    <p className="truncate text-[10px] text-outline">
                      {(exercise.primaryMusclesZh[0] || exercise.categoryZh || "综合")} · {exercise.equipmentZh || "未标注"}
                    </p>
                  </div>
                  <button
                    aria-label={`查看动作详情：${exercise.nameZh}`}
                    className="rounded-full p-xs text-outline transition-colors hover:bg-primary/10 hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      openLibraryPreview(exercise);
                    }}
                    type="button"
                  >
                    <SymbolIcon>info</SymbolIcon>
                  </button>
                  <button
                    aria-label={`加入当前计划：${exercise.nameZh}`}
                    className="rounded-full p-xs text-primary transition-colors hover:bg-primary/10"
                    onClick={(event) => {
                      event.stopPropagation();
                      addExercise(exercise);
                    }}
                    type="button"
                  >
                    <SymbolIcon>add_circle</SymbolIcon>
                  </button>
                </div>
                );
              })
            )}
          </div>
        </section>

      </aside>
      <ExercisePreviewSheet
        exercise={activePreviewExercise}
        isOpen={Boolean(activePreviewExercise)}
        onClose={closePreviewSheet}
        primaryAction={
          activePreviewSource === "library"
            ? {
                icon: "playlist_add",
                label: "加入当前计划",
                onClick: addPreviewExercise,
              }
            : undefined
        }
      />
    </div>
  );
}

function WorkoutSectionBlock({
  children,
  index,
  isSelected,
  itemCount,
  loopRounds,
  loopRestSeconds,
  onAddNext,
  onDropToEnd,
  onLoopRoundsChange,
  onLoopRestSecondsChange,
  section,
}: {
  children: ReactNode;
  index: number;
  isSelected: boolean;
  itemCount: number;
  loopRounds: number;
  loopRestSeconds: number;
  onAddNext: () => void;
  onDropToEnd: () => void;
  onLoopRoundsChange: (value: number) => void;
  onLoopRestSecondsChange: (value: number) => void;
  section: (typeof sectionConfigs)[number];
}) {
  const isTraining = section.id === "training";

  return (
    <section
      className={`relative overflow-hidden rounded-[20px] border p-md transition-all ${
        isSelected
          ? "border-primary/45 bg-primary-soft/45 shadow-card ring-1 ring-primary/15"
          : "border-line bg-white"
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropToEnd();
      }}
    >
      <div className="mb-md flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-sm">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              isSelected ? "bg-primary text-white" : "bg-primary-soft text-primary"
            }`}
          >
            <SymbolIcon className="text-[22px]">{section.icon}</SymbolIcon>
          </span>
          <div className="min-w-0">
            <h3 className="font-title-lg text-title-lg font-extrabold">
              {index + 1}. {section.title}
            </h3>
            <p className="mt-[2px] font-label-sm text-label-sm text-muted">
              {section.subtitle} · {itemCount} 个动作
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          {isTraining ? (
            <>
              <label className="flex items-center gap-xs rounded-xl border border-line bg-panel-soft px-sm py-xs font-label-md text-label-md text-secondary">
                <SymbolIcon className="text-[18px] text-primary">timer</SymbolIcon>
                循环间隙
                <select
                  className="h-8 rounded-lg border border-outline-variant bg-white px-sm text-center font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={(event) => onLoopRestSecondsChange(Number(event.target.value))}
                  value={loopRestSeconds}
                >
                  {restOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-xs rounded-xl border border-line bg-panel-soft px-sm py-xs font-label-md text-label-md text-secondary">
                <SymbolIcon className="text-[18px] text-primary">sync_alt</SymbolIcon>
                循环
                <select
                  className="h-8 rounded-lg border border-outline-variant bg-white px-sm text-center font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={(event) => onLoopRoundsChange(Number(event.target.value))}
                  value={loopRounds}
                >
                  {loopRoundOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}轮
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <button
            className={`flex items-center gap-xs rounded-xl border px-md py-sm font-label-md text-label-md transition-colors ${
              isSelected
                ? "border-primary bg-primary text-white shadow-card hover:bg-primary-deep"
                : "border-outline bg-white hover:bg-panel-soft"
            }`}
            onClick={onAddNext}
            type="button"
          >
            <SymbolIcon className="text-[18px]">{isSelected ? "check_circle" : "playlist_add"}</SymbolIcon>
            {isSelected ? `当前添加到${section.title}` : `添加到${section.title}`}
          </button>
        </div>
      </div>
      {itemCount ? (
        <div>{children}</div>
      ) : (
        <div className="rounded-xl border border-dashed border-outline-variant bg-panel-soft p-md text-center font-label-md text-label-md text-muted">
          从右侧动作库添加到{section.title}，或把已有动作拖到这里。
        </div>
      )}
    </section>
  );
}

function RoutineCompositionCard({
  isActive,
  onDelete,
  onDuplicate,
  onOpen,
  workout,
}: {
  isActive: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpen: () => void;
  workout: WorkoutRoutine;
}) {
  const loopRounds = clampLoopRounds(workout.trainingLoopRounds ?? 1);
  const loopRestSeconds = workout.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds;
  const normalizedItems = workout.items.map(normalizeWorkoutItem);
  const minutes = estimateWorkoutMinutes(normalizedItems, {
    trainingLoopRestSeconds: loopRestSeconds,
    trainingLoopRounds: loopRounds,
  });
  const calories = estimateWorkoutCalories(normalizedItems, {
    trainingLoopRestSeconds: loopRestSeconds,
    trainingLoopRounds: loopRounds,
  });
  const icon = workout.title.includes("燃脂")
    ? "local_fire_department"
    : workout.title.includes("核心")
      ? "accessibility_new"
      : workout.title.includes("居家")
        ? "home"
        : "fitness_center";

  return (
    <div
      className={`group flex w-64 shrink-0 items-center gap-sm rounded-xl border p-sm text-left transition-all ${
        isActive
          ? "border-primary bg-primary/5 shadow-card ring-2 ring-primary/10"
          : "border-line bg-white hover:border-primary/40 hover:ring-1 hover:ring-primary/10"
      }`}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-sm text-left"
        onClick={onOpen}
        type="button"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isActive ? "bg-primary text-white" : "bg-primary-soft text-primary"
          }`}
        >
          <SymbolIcon className="text-[20px]">{icon}</SymbolIcon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-label-md text-label-md font-bold">
            {workout.title}
          </span>
          <span className="block truncate text-[10px] text-secondary">
            {workout.items.length} 动作 · 训练{loopRounds}轮 · {minutes}min · {calories}kcal
          </span>
          <span className="block truncate text-[10px] text-outline">
            {workout.updatedAt}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button
          aria-label={`复制 ${workout.title}`}
          className="rounded-full p-xs text-outline transition-colors hover:bg-primary/10 hover:text-primary"
          onClick={onDuplicate}
          type="button"
        >
          <SymbolIcon className="text-[18px]">content_copy</SymbolIcon>
        </button>
        <button
          aria-label={`删除 ${workout.title}`}
          className="rounded-full p-xs text-outline transition-colors hover:bg-error/10 hover:text-error"
          onClick={onDelete}
          type="button"
        >
          <SymbolIcon className="text-[18px]">delete</SymbolIcon>
        </button>
      </div>
    </div>
  );
}

function CompositionMetric({
  icon,
  label,
  primary = false,
  suffix,
  value,
}: {
  icon: string;
  label: string;
  primary?: boolean;
  suffix: string;
  value: number;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-sm px-sm py-xs sm:px-md xl:border-l xl:first:border-l-0 ${
        primary ? "text-primary" : "text-ink"
      } border-line/70`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${primary ? "text-primary" : "text-outline"}`}>
        <SymbolIcon className="text-[20px]">{icon}</SymbolIcon>
      </span>
      <span className="min-w-0 flex items-baseline gap-xs">
        <span className={`font-title-lg text-title-lg font-extrabold ${primary ? "text-primary" : "text-ink"}`}>
          {value}
        </span>
        <span className="truncate font-label-sm text-label-sm text-secondary">
          {suffix} · {label}
        </span>
      </span>
    </div>
  );
}

function LibraryFilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ExerciseFacets["muscles"];
  value: string;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        className="h-8 w-full rounded-lg border border-outline-variant bg-white px-xs text-[11px] text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function WorkoutExerciseRow({
  dragState,
  index,
  item,
  onDelete,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onDuplicate,
  onPreview,
  onUpdate,
}: {
  dragState: "dragging" | "idle" | "over";
  index: number;
  item: WorkoutItem;
  onDelete: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDuplicate: () => void;
  onPreview: () => void;
  onUpdate: (updater: (item: WorkoutItem) => WorkoutItem) => void;
}) {
  return (
    <div
      className={`relative flex flex-col gap-md rounded-xl border border-line bg-white p-md transition-all hover:border-primary/40 hover:ring-1 hover:ring-primary/10 md:flex-row md:items-center ${
        dragState === "dragging" ? "opacity-50" : ""
      } ${
        dragState === "over" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
      draggable
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
    >
      <div className="flex items-center gap-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-line font-label-md text-label-md font-bold text-muted">
          {index + 1}
        </div>
        <button
          aria-label={`拖拽排序：${item.nameZh}`}
          className="cursor-grab rounded-md p-xs active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <SymbolIcon className="text-outline">drag_indicator</SymbolIcon>
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-md md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-md">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container-low">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="56px"
              src={item.imageUrl}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-body-lg text-body-lg font-bold">
              {item.nameZh} <span className="text-label-sm font-normal text-outline">{item.nameEn}</span>
            </p>
            <div className="mt-xs flex flex-wrap items-center gap-xs">
              <span className={`inline-block rounded px-sm py-[2px] text-[10px] font-bold uppercase ${item.mode === "duration" ? "bg-primary-fixed text-on-primary-fixed-variant" : "bg-tertiary-fixed text-on-tertiary-fixed-variant"}`}>
                {item.mode === "duration" ? "时长模式" : "次数模式"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-md md:ml-auto">
          <Stepper
            label={item.mode === "duration" ? "目标时长" : "目标次数"}
            suffix={item.mode === "duration" ? "s" : ""}
            value={item.target}
            onChange={(nextValue) => onUpdate((current) => ({ ...current, target: nextValue }))}
          />
          <Stepper
            label="组数"
            value={item.sets}
            onChange={(nextValue) => onUpdate((current) => ({ ...current, sets: nextValue }))}
          />
          {item.sets > 1 ? (
            <label className="min-w-[76px] text-center">
              <span className="mb-xs block text-[10px] text-outline">组间</span>
              <select
                className="h-9 w-full rounded-lg border border-outline-variant bg-transparent px-xs text-center font-label-md text-label-md outline-none focus:ring-0"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, setRestSeconds: Number(event.target.value) }))
                }
                value={item.setRestSeconds}
              >
                {restOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}s
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      <div className="flex gap-xs border-outline-variant md:border-l md:pl-md">
        <button
          aria-label={`查看动作详情：${item.nameZh}`}
          className="rounded-lg p-sm text-outline transition-colors hover:bg-primary/5 hover:text-primary"
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          type="button"
        >
          <SymbolIcon>info</SymbolIcon>
        </button>
        <button className="rounded-lg p-sm text-outline transition-colors hover:bg-primary/5 hover:text-primary" onClick={(event) => { event.stopPropagation(); onDuplicate(); }} type="button">
          <SymbolIcon>content_copy</SymbolIcon>
        </button>
        <button className="rounded-lg p-sm text-outline transition-colors hover:bg-error/5 hover:text-error" onClick={(event) => { event.stopPropagation(); onDelete(); }} type="button">
          <SymbolIcon>delete</SymbolIcon>
        </button>
      </div>
    </div>
  );
}

function RestIntervalControl({
  onChange,
  seconds,
}: {
  onChange: (seconds: number) => void;
  seconds: number;
}) {
  return (
    <div className="flex h-7 items-center justify-center">
      <span className="h-px min-w-10 bg-outline-variant/70" aria-hidden="true" />
      <label className="group mx-xs flex h-6 cursor-pointer items-center gap-[3px] rounded-full border border-dashed border-outline-variant bg-white px-xs text-[10px] font-medium text-secondary transition-colors hover:border-primary/50 hover:bg-primary-soft/60">
        <SymbolIcon className="text-[13px] text-outline transition-colors group-hover:text-primary">
          timer
        </SymbolIcon>
        <span>动作间休息</span>
        <select
          aria-label="动作间休息"
          className="h-5 rounded-full border border-outline-variant bg-white px-[5px] py-0 text-[10px] font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
          onChange={(event) => onChange(Number(event.target.value))}
          value={seconds}
        >
          {restOptions.map((option) => (
            <option key={option} value={option}>
              {option}s
            </option>
          ))}
        </select>
      </label>
      <span className="h-px min-w-10 bg-outline-variant/70" aria-hidden="true" />
    </div>
  );
}

function Stepper({
  label,
  onChange,
  suffix = "",
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="min-w-[76px] text-center">
      <p className="mb-xs text-[10px] text-outline">{label}</p>
      <div className="flex h-9 items-center rounded-lg border border-outline-variant">
        <button className="flex-1 text-lg hover:bg-surface-container-low" onClick={(event) => { event.stopPropagation(); onChange(changeNumber(value, -1, 1, 999)); }} type="button">
          -
        </button>
        <input
          className="w-10 border-none bg-transparent p-0 text-center font-label-md text-label-md outline-none focus:ring-0"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onChange(changeNumber(Number(event.target.value.replace(/\D/g, "")) || 1, 0, 1, 999))}
          value={`${value}${suffix}`}
        />
        <button className="flex-1 text-lg hover:bg-surface-container-low" onClick={(event) => { event.stopPropagation(); onChange(changeNumber(value, 1, 1, 999)); }} type="button">
          +
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`flex items-center gap-xs rounded-xl px-md py-sm font-label-md text-label-md transition-colors ${
        primary ? "bg-primary/5 font-bold text-primary hover:bg-primary/10" : "hover:bg-surface-container-low"
      }`}
      onClick={onClick}
      type="button"
    >
      <SymbolIcon className="text-sm">{icon}</SymbolIcon>
      {label}
    </button>
  );
}
