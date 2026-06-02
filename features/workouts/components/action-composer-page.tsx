"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ResponsiveRightSidebar } from "@/components/app/responsive-right-sidebar";
import { SymbolIcon } from "@/components/app/symbol-icon";
import { useAutoHideScrollbar } from "@/components/app/use-auto-hide-scrollbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LazyExercisePreviewSheet } from "@/features/exercises/components/lazy-exercise-preview-sheet";
import {
  createWorkoutRoutine,
  deleteWorkoutRoutine as deleteWorkoutRoutineRequest,
  getWorkoutRoutine,
  listWorkoutRoutines,
  saveWorkoutRoutine,
} from "@/features/workouts/api/workout-data-client";
import { clientRequest } from "@/lib/client/http/client-request";
import type { Exercise, ExerciseFacets, ExerciseListItem, ExerciseSuitability } from "@/lib/shared/exercises/types";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
import {
  clampLoopRounds,
  defaultTrainingToStretchRestSeconds,
  defaultSetRestSeconds,
  defaultTrainingLoopRestSeconds,
  defaultTrainingLoopRounds,
  defaultTransitionRestSeconds,
  defaultWarmupToTrainingRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getSectionItems,
  getTotalWorkoutSets,
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
  items: ExerciseListItem[];
  total: number;
  facets: ExerciseFacets;
};

type ExerciseDetailApiResponse = {
  item: Exercise;
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

type LibrarySuitabilityFilter = "all" | ExerciseSuitability;
type RightPanelView = "library" | "saved";

const sectionConfigs = workoutSectionConfigs;
const sectionVisualStyles: Record<
  WorkoutSection,
  {
    accentText: string;
    block: string;
    chip: string;
    icon: string;
    line: string;
    node: string;
    selected: string;
  }
> = {
  warmup: {
    accentText: "text-[#B25E09]",
    block: "border-[#F4C56B]/45 bg-[#FFF8EA]",
    chip: "border-[#F4C56B]/45 bg-[#FFF1CC] text-[#8A4B08]",
    icon: "bg-[#FFF1CC] text-[#B25E09]",
    line: "bg-[#F4C56B]/55",
    node: "bg-[#F59E0B]",
    selected: "border-[#F59E0B]/55 bg-[#FFF4D6] ring-[#F59E0B]/15",
  },
  training: {
    accentText: "text-primary",
    block: "border-primary/20 bg-[#F8FAFF]",
    chip: "border-primary/20 bg-primary-soft text-primary",
    icon: "bg-primary-soft text-primary",
    line: "bg-primary/35",
    node: "bg-primary",
    selected: "border-primary/45 bg-primary-soft/45 ring-primary/15",
  },
  stretch: {
    accentText: "text-[#047857]",
    block: "border-[#A7F3D0]/55 bg-[#F0FDF7]",
    chip: "border-[#A7F3D0]/70 bg-[#DCFCE7] text-[#047857]",
    icon: "bg-[#DCFCE7] text-[#047857]",
    line: "bg-[#86EFAC]/65",
    node: "bg-[#10B981]",
    selected: "border-[#10B981]/45 bg-[#ECFDF3] ring-[#10B981]/15",
  },
};
const librarySuitabilityOptions: Array<{
  id: LibrarySuitabilityFilter;
  label: string;
  icon: string;
}> = [
  { id: "all", label: "全部", icon: "select_all" },
  { id: "warmup", label: "适合热身", icon: "local_fire_department" },
  { id: "training", label: "适合主训练", icon: "fitness_center" },
  { id: "stretch", label: "适合拉伸", icon: "self_improvement" },
];
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
  const section = item.section ?? "training";

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
    allowedSections: [section],
    intensityRole: section === "warmup" ? "activation" : section === "stretch" ? "recovery" : "strength",
    movementPattern: section === "stretch" ? "stretch" : "other",
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

function formatDateTime(date: Date) {
  return toUtcISOString(date);
}

function hasFacetValue(options: ExerciseFacets["categories"], value: string) {
  return !value || options.some((option) => option.value === value || option.label === value);
}

// 阶段摘要只服务编排画布的信息层级，不改变 routine 的保存或执行规则。
function summarizeComposerSection(
  sectionItems: WorkoutItem[],
  section: WorkoutSection,
  options: {
    trainingLoopRestSeconds: number;
    trainingLoopRounds: number;
  },
) {
  const isTraining = section === "training";
  const sectionLoopRounds = isTraining ? options.trainingLoopRounds : 1;

  return {
    minutes: sectionItems.length
      ? estimateWorkoutMinutes(sectionItems, {
          minimumMinutes: 0,
          trainingLoopRestSeconds: isTraining ? options.trainingLoopRestSeconds : 0,
          trainingLoopRounds: sectionLoopRounds,
          trainingToStretchRestSeconds: 0,
          warmupToTrainingRestSeconds: 0,
        })
      : 0,
    sets: getTotalWorkoutSets(sectionItems, sectionLoopRounds),
  };
}

async function fetchExerciseDetail(exerciseId: string, signal?: AbortSignal) {
  const data = await clientRequest<ExerciseDetailApiResponse>(
    `/api/exercises/${encodeURIComponent(exerciseId)}`,
    {
      signal,
      errorMessage: "动作详情加载失败",
    },
  );

  return data.item;
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

  const matchedSummary =
    preferredExercise ??
    data.items.find((exercise) => exercise.equipmentZh === "自重") ??
    data.items[0] ??
    null;

  return matchedSummary ? fetchExerciseDetail(matchedSummary.id) : null;
}

export function ActionComposerPage() {
  const mainScrollRef = useAutoHideScrollbar<HTMLElement>();
  const [planTitle, setPlanTitle] = useState("我的燃脂循环训练");
  const [titleDraft, setTitleDraft] = useState(planTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [workoutRoutines, setWorkoutRoutines] = useState<WorkoutRoutine[]>([]);
  const [activeWorkoutRoutineId, setActiveWorkoutRoutineId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [libraryItems, setLibraryItems] = useState<ExerciseListItem[]>([]);
  const [exerciseCache, setExerciseCache] = useState<Map<string, Exercise>>(() => new Map());
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryFacets, setLibraryFacets] = useState<ExerciseFacets>(defaultExerciseFacets);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [librarySuitabilityFilter, setLibrarySuitabilityFilter] =
    useState<LibrarySuitabilityFilter>("all");
  const [libraryMuscle, setLibraryMuscle] = useState("");
  const [libraryEquipment, setLibraryEquipment] = useState("");
  const [libraryLevel, setLibraryLevel] = useState("");
  const [libraryHomeRequirement, setLibraryHomeRequirement] = useState("");
  const [selectedLibraryExerciseId, setSelectedLibraryExerciseId] = useState("");
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("library");
  const [draggingItemId, setDraggingItemId] = useState("");
  const [dragOverItemId, setDragOverItemId] = useState("");
  const [selectedSection, setSelectedSection] = useState<WorkoutSection>("training");
  const [trainingLoopRounds, setTrainingLoopRounds] = useState(defaultTrainingLoopRounds);
  const [trainingLoopRestSeconds, setTrainingLoopRestSeconds] = useState(defaultTrainingLoopRestSeconds);
  const [warmupToTrainingRestSeconds, setWarmupToTrainingRestSeconds] = useState(defaultWarmupToTrainingRestSeconds);
  const [trainingToStretchRestSeconds, setTrainingToStretchRestSeconds] = useState(defaultTrainingToStretchRestSeconds);
  const [activePreviewExercise, setActivePreviewExercise] = useState<Exercise | null>(null);
  const [activePreviewSource, setActivePreviewSource] = useState<"library" | "plan" | null>(null);
  const [isPreviewSheetOpen, setIsPreviewSheetOpen] = useState(false);
  const [isPreviewExerciseLoading, setIsPreviewExerciseLoading] = useState(false);
  const [previewExerciseError, setPreviewExerciseError] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const hasHandledInitialWorkoutLoadRef = useRef(false);

  // 标题更新集中在这里，避免展示态标题和编辑态草稿在切换编排时出现不同步。
  const applyPlanTitle = useCallback((nextTitle: string) => {
    setPlanTitle(nextTitle);
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
  }, []);

  const openWorkoutRoutine = useCallback(
    (workout: WorkoutRoutine, updateHash = true) => {
      const normalizedWorkout = normalizeWorkoutRoutine(workout);
      const normalizedItems = normalizedWorkout.items;

      applyPlanTitle(normalizedWorkout.title);
      setItems(normalizedItems);
      setTrainingLoopRounds(normalizedWorkout.trainingLoopRounds ?? 1);
      setTrainingLoopRestSeconds(normalizedWorkout.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds);
      setWarmupToTrainingRestSeconds(normalizedWorkout.warmupToTrainingRestSeconds ?? defaultWarmupToTrainingRestSeconds);
      setTrainingToStretchRestSeconds(normalizedWorkout.trainingToStretchRestSeconds ?? defaultTrainingToStretchRestSeconds);
      setSelectedItemId(normalizedItems[0]?.id ?? "");
      setSelectedSection(normalizedItems[0]?.section ?? "training");
      setActiveWorkoutRoutineId(workout.id);
      setSaveStatus(`已加载：${workout.title}`);

      if (updateHash) {
        window.history.replaceState(null, "", `#${workout.id}`);
      }
    },
    [applyPlanTitle],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      pageSize: "30",
      sort: "name_asc",
    });

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setIsLoadingLibrary(true);
      }
    });

    if (libraryQuery.trim()) {
      params.set("q", libraryQuery.trim());
    }

    if (libraryCategory) {
      params.set("category", libraryCategory);
    }

    if (librarySuitabilityFilter !== "all") {
      params.set("suitability", librarySuitabilityFilter);
    }

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
        const shouldClearCategory = !hasFacetValue(data.facets.categories, libraryCategory);
        const shouldClearMuscle = !hasFacetValue(data.facets.muscles, libraryMuscle);
        const shouldClearEquipment = !hasFacetValue(data.facets.equipment, libraryEquipment);
        const shouldClearLevel = !hasFacetValue(data.facets.levels, libraryLevel);
        const shouldClearHomeRequirement = !hasFacetValue(
          data.facets.homeRequirements,
          libraryHomeRequirement,
        );

        setLibraryItems(data.items);
        setLibraryTotal(data.total);
        setLibraryFacets(data.facets);
        setSelectedLibraryExerciseId((current) =>
          data.items.some((exercise) => exercise.id === current)
            ? current
            : data.items[0]?.id ?? "",
        );

        // 请求返回的新 facets 是筛选项的事实来源，失效筛选在这里统一归一化。
        if (shouldClearCategory) {
          setLibraryCategory("");
        }

        if (shouldClearMuscle) {
          setLibraryMuscle("");
        }

        if (shouldClearEquipment) {
          setLibraryEquipment("");
        }

        if (shouldClearLevel) {
          setLibraryLevel("");
        }

        if (shouldClearHomeRequirement) {
          setLibraryHomeRequirement("");
        }

        if (
          shouldClearCategory ||
          shouldClearMuscle ||
          shouldClearEquipment ||
          shouldClearLevel ||
          shouldClearHomeRequirement
        ) {
          setSaveStatus("已清除与当前用途不匹配的筛选");
        }
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
    librarySuitabilityFilter,
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
  }, [openWorkoutRoutine]);

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
  }, [activeWorkoutRoutineId, items.length, openWorkoutRoutine]);

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

  const selectedLibraryExercise =
    libraryItems.find((exercise) => exercise.id === selectedLibraryExerciseId) ?? libraryItems[0];
  const workoutEstimateOptions = {
    trainingLoopRestSeconds,
    trainingLoopRounds,
    warmupToTrainingRestSeconds,
    trainingToStretchRestSeconds,
  };
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

  function cacheExerciseDetail(exercise: Exercise) {
    setExerciseCache((current) => {
      const next = new Map(current);
      next.set(exercise.id, exercise);
      return next;
    });
  }

  async function readExerciseDetailFromCache(exerciseId: string) {
    const cachedExercise = exerciseCache.get(exerciseId);

    if (cachedExercise) {
      return cachedExercise;
    }

    const exercise = await fetchExerciseDetail(exerciseId);
    cacheExerciseDetail(exercise);
    return exercise;
  }

  function addExercise(exercise: Exercise, section = selectedSection) {
    const nextItem = toWorkoutItem(exercise, { section });
    setItems((current) => [...current, nextItem]);
    setSelectedItemId(nextItem.id);
    setSelectedLibraryExerciseId("");
    setSelectedSection(section);
    setSaveStatus("");
  }

  function openLibraryPreview(exercise: ExerciseListItem) {
    setSelectedLibraryExerciseId(exercise.id);
    setIsPreviewSheetOpen(true);
    setIsPreviewExerciseLoading(true);
    setPreviewExerciseError("");
    setActivePreviewExercise(null);
    setActivePreviewSource("library");

    void readExerciseDetailFromCache(exercise.id)
      .then((fullExercise) => {
        setActivePreviewExercise(fullExercise);
      })
      .catch((error: unknown) => {
        setPreviewExerciseError(error instanceof Error ? error.message : "动作详情加载失败");
      })
      .finally(() => {
        setIsPreviewExerciseLoading(false);
      });
  }

  function openPlanPreview(item: WorkoutItem) {
    setActivePreviewExercise(toPreviewExercise(item, exerciseCache));
    setActivePreviewSource("plan");
    setIsPreviewSheetOpen(true);
    setPreviewExerciseError("");
  }

  function closePreviewSheet() {
    setIsPreviewSheetOpen(false);
    setActivePreviewExercise(null);
    setActivePreviewSource(null);
    setIsPreviewExerciseLoading(false);
    setPreviewExerciseError("");
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
      const supplementalSummaries = libraryItems
        .filter((exercise) => !selectedIds.has(exercise.id))
        .filter((exercise) => exercise.equipmentZh === "自重" || exercise.goalTags.includes("home_friendly"))
        .slice(0, Math.max(0, 3 - nextItems.length));
      const supplementalExercises = await Promise.all(
        supplementalSummaries.map((exercise) => readExerciseDetailFromCache(exercise.id)),
      );
      const supplementalItems = supplementalExercises.map((exercise) => toWorkoutItem(exercise));

      const composedItems = [...nextItems, ...supplementalItems];

      applyPlanTitle("燃脂循环训练 A");
      setTrainingLoopRounds(defaultTrainingLoopRounds);
      setTrainingLoopRestSeconds(defaultTrainingLoopRestSeconds);
      setWarmupToTrainingRestSeconds(defaultWarmupToTrainingRestSeconds);
      setTrainingToStretchRestSeconds(defaultTrainingToStretchRestSeconds);
      setItems(composedItems);
      setSelectedItemId(composedItems[0]?.id ?? "");
      setSaveStatus(`已从动作库导入 ${composedItems.length} 个模板动作`);
    } catch {
      setSaveStatus("模板动作加载失败");
    }
  }

  function createNewComposition() {
    applyPlanTitle("新的动作编排");
    setItems([]);
    setTrainingLoopRounds(defaultTrainingLoopRounds);
    setTrainingLoopRestSeconds(defaultTrainingLoopRestSeconds);
    setWarmupToTrainingRestSeconds(defaultWarmupToTrainingRestSeconds);
    setTrainingToStretchRestSeconds(defaultTrainingToStretchRestSeconds);
    setSelectedItemId("");
    setSelectedSection("training");
    setActiveWorkoutRoutineId("");
    setSaveStatus("已新建空白编排");
    window.history.replaceState(null, "", window.location.pathname);
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
      warmupToTrainingRestSeconds,
      trainingToStretchRestSeconds,
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
    <div
      className="responsive-right-sidebar-scope right-sidebar-page-shell app-mesh-bg min-h-screen text-ink"
    >
      <main
        className="custom-scrollbar right-sidebar-main-scroll right-sidebar-page-main h-screen overflow-y-auto"
        ref={mainScrollRef}
      >
        <header className="mb-md rounded-[16px] border-b border-line/70 bg-white px-sm py-xs shadow-[0_8px_18px_rgba(15,23,42,0.06)] md:px-md md:py-sm">
          <div className="flex flex-col gap-sm">
            <div className="flex min-w-0 flex-col gap-sm lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="mb-[2px] flex items-center gap-[4px] font-label-sm text-label-sm font-bold text-primary">
                  <SymbolIcon className="text-[15px]">edit_note</SymbolIcon>
                  个性化动作编排
                </p>
                {isEditingTitle ? (
                  <div className="flex min-w-0 items-center gap-xs">
                    <input
                      aria-label="编排名称"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-primary/35 bg-white px-md font-title-lg text-title-lg font-extrabold text-ink outline-none ring-4 ring-primary/10"
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
                  <div className="flex min-w-0 items-center gap-xs">
                    <h1 className="min-w-0 truncate font-title-lg text-title-lg font-extrabold text-ink">
                      {planTitle}
                    </h1>
                    <button
                      aria-label="编辑编排名称"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary transition-colors hover:bg-primary-soft"
                      onClick={startTitleEdit}
                      type="button"
                    >
                      <SymbolIcon className="text-[18px]">edit</SymbolIcon>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-sm pt-xs lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-xs">
                <WorkbenchMetric icon="schedule" label="预计" suffix="min" value={totalMinutes} />
                <WorkbenchMetric icon="format_list_numbered" label="动作" suffix="个" value={items.length} />
                <WorkbenchMetric icon="repeat" label="组数" suffix="组" value={totalSets} />
                <WorkbenchMetric icon="local_fire_department" label="消耗" suffix="kcal" value={totalCalories} primary />
              </div>
              <div className="flex flex-wrap items-center gap-xs">
                <button className="h-10 rounded-xl border border-outline px-md font-label-md text-label-md transition-colors hover:bg-surface-container-low" onClick={createNewComposition} type="button">
                  新增
                </button>
                <button className="h-10 rounded-xl border border-outline px-md font-label-md text-label-md transition-colors hover:bg-surface-container-low" onClick={importTemplate} type="button">
                  导入模板
                </button>
                <button className="h-10 rounded-xl bg-primary-container px-md font-label-md text-label-md text-white shadow-sm transition-opacity hover:opacity-90" onClick={saveComposition} type="button">
                  保存
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-lg overflow-hidden rounded-[24px] border border-line bg-[#F8FAFC] p-sm shadow-card md:p-md">
          <div className="mb-md flex flex-col gap-xs px-xs md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-label-sm text-label-sm font-bold text-primary">训练流程画布</p>
              <h2 className="mt-[2px] font-title-md text-title-md font-extrabold text-ink">
                按执行顺序编排热身、主训练和拉伸
              </h2>
            </div>
            <p className="font-label-sm text-label-sm text-muted">
              拖拽调整顺序，休息节点会进入训练时间线
            </p>
          </div>
          <div className="relative space-y-md pl-8 md:pl-10">
            <span
              className="absolute bottom-8 left-[14px] top-8 w-px bg-gradient-to-b from-[#F4C56B]/70 via-primary/40 to-[#86EFAC]/70 md:left-[18px]"
              aria-hidden="true"
            />
            {sectionConfigs.map((section, sectionIndex) => {
              const sectionItems = getSectionItems(items, section.id);
              const sectionSummary = summarizeComposerSection(sectionItems, section.id, {
                trainingLoopRestSeconds,
                trainingLoopRounds,
              });

              return (
                <div className="relative space-y-sm" key={section.id}>
                  <span
                    className={`absolute -left-[25px] top-6 z-10 grid h-7 w-7 place-items-center rounded-full border-[3px] border-[#F8FAFC] text-white shadow-sm md:-left-[31px] ${sectionVisualStyles[section.id].node}`}
                    aria-hidden="true"
                  >
                    <SymbolIcon className="text-[15px]">{section.icon}</SymbolIcon>
                  </span>
                  <WorkoutSectionBlock
                    index={sectionIndex}
                    isSelected={selectedSection === section.id}
                    itemCount={sectionItems.length}
                    loopRounds={trainingLoopRounds}
                    loopRestSeconds={trainingLoopRestSeconds}
                    minutes={sectionSummary.minutes}
                    onAddNext={() => setSelectedSection(section.id)}
                    onDropToEnd={() => {
                      moveItemToSectionEnd(draggingItemId, section.id);
                      setDraggingItemId("");
                      setDragOverItemId("");
                    }}
                    onLoopRoundsChange={setTrainingLoopRounds}
                    onLoopRestSecondsChange={setTrainingLoopRestSeconds}
                    section={section}
                    sets={sectionSummary.sets}
                  >
                    {sectionItems.map((item, index) => (
                      <div key={item.id}>
                        <WorkoutExerciseRow
                          dragState={dragOverItemId === item.id ? "over" : draggingItemId === item.id ? "dragging" : "idle"}
                          exercise={exerciseCache.get(item.exerciseId)}
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
                            section={section.id}
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
                  {section.id === "warmup" ? (
                    <SectionBoundaryRestControl
                      label="热身到训练休息"
                      section="warmup"
                      seconds={warmupToTrainingRestSeconds}
                      onChange={setWarmupToTrainingRestSeconds}
                    />
                  ) : null}
                  {section.id === "training" ? (
                    <SectionBoundaryRestControl
                      label="训练到拉伸休息"
                      section="training"
                      seconds={trainingToStretchRestSeconds}
                      onChange={setTrainingToStretchRestSeconds}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {saveStatus ? (
          <div className="fixed bottom-lg left-1/2 z-40 -translate-x-1/2 rounded-full bg-inverse-surface px-lg py-sm font-label-md text-label-md text-inverse-on-surface shadow-lg">
            {saveStatus}
          </div>
        ) : null}
      </main>

      <ResponsiveRightSidebar
        className="gap-md overflow-y-auto p-md"
        label="动作编排侧边栏"
      >
        <section className="flex min-h-[420px] flex-1 flex-col">
          <div className="mb-md rounded-xl border border-line bg-panel-soft p-[3px]">
            <div className="grid grid-cols-2 gap-[3px]">
              <button
                aria-pressed={rightPanelView === "library"}
                className={`flex h-9 min-w-0 items-center justify-center gap-[4px] rounded-lg px-[4px] text-[12px] font-bold transition-colors ${
                  rightPanelView === "library"
                    ? "bg-white text-primary shadow-sm"
                    : "text-secondary hover:bg-white/70 hover:text-primary"
                }`}
                onClick={() => setRightPanelView("library")}
                type="button"
              >
                <SymbolIcon className="text-[18px]">folder_open</SymbolIcon>
                动作库
                <span className="rounded bg-surface-container px-xs py-[1px] text-[10px] text-outline">
                  {libraryTotal}
                </span>
              </button>
              <button
                aria-pressed={rightPanelView === "saved"}
                className={`flex h-9 min-w-0 items-center justify-center gap-[4px] rounded-lg px-[4px] text-[12px] font-bold transition-colors ${
                  rightPanelView === "saved"
                    ? "bg-white text-primary shadow-sm"
                    : "text-secondary hover:bg-white/70 hover:text-primary"
                }`}
                onClick={() => setRightPanelView("saved")}
                type="button"
              >
                <SymbolIcon className="text-[18px]">bookmark</SymbolIcon>
                <span className="whitespace-nowrap">已保存编排</span>
                <span className="rounded bg-surface-container px-xs py-[1px] text-[10px] text-outline">
                  {workoutRoutines.length}
                </span>
              </button>
            </div>
          </div>

          {rightPanelView === "library" ? (
            <>
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
              <div className="relative mb-sm overflow-hidden rounded-xl border border-line bg-panel-soft">
                <div className="pointer-events-none absolute inset-0 bg-panel-soft" />
                <div className="scrollbar-none relative flex gap-[3px] overflow-x-auto overscroll-x-contain p-[3px]">
                  {librarySuitabilityOptions.map((option) => (
                    <button
                      aria-label={option.label}
                      className={`flex h-8 shrink-0 items-center justify-center gap-[3px] rounded-lg border px-sm text-[11px] font-semibold transition-colors ${
                        librarySuitabilityFilter === option.id
                          ? "border-primary/25 bg-white text-primary shadow-sm"
                          : "border-transparent text-secondary hover:bg-white/70 hover:text-primary"
                      }`}
                      key={option.id}
                      onClick={() => setLibrarySuitabilityFilter(option.id)}
                      type="button"
                    >
                      <SymbolIcon className="text-[15px]">{option.icon}</SymbolIcon>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
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
                            setSaveStatus("正在读取动作详情...");
                            void readExerciseDetailFromCache(exercise.id)
                              .then((fullExercise) => {
                                addExercise(fullExercise);
                                setSaveStatus(`已加入：${fullExercise.nameZh}`);
                              })
                              .catch(() => setSaveStatus("动作详情加载失败"));
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
            </>
          ) : (
            <div className="custom-scrollbar flex-1 space-y-sm overflow-y-auto pr-xs">
              {workoutRoutines.length ? (
                workoutRoutines.map((workout) => (
                  <RoutineCompositionCard
                    isActive={workout.id === activeWorkoutRoutineId}
                    key={workout.id}
                    onDelete={() => {
                      void removeWorkoutRoutine(workout);
                    }}
                    onDuplicate={() => {
                      void duplicateWorkoutRoutine(workout);
                    }}
                    onOpen={() => openWorkoutRoutine(workout)}
                    workout={workout}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-line bg-panel-soft p-md">
                  <p className="font-label-md text-label-md text-muted">
                    保存当前编排后，会在这里快速切换、复制或删除。
                  </p>
                  <button
                    className="mt-sm flex w-full items-center justify-center gap-xs rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white transition-colors hover:bg-primary-deep"
                    onClick={() => {
                      void saveComposition();
                    }}
                    type="button"
                  >
                    <SymbolIcon className="text-[18px]">save</SymbolIcon>
                    保存当前编排
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </ResponsiveRightSidebar>
      <LazyExercisePreviewSheet
        exercise={activePreviewExercise}
        errorMessage={previewExerciseError}
        isLoading={isPreviewExerciseLoading}
        isOpen={isPreviewSheetOpen}
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
  minutes,
  onAddNext,
  onDropToEnd,
  onLoopRoundsChange,
  onLoopRestSecondsChange,
  section,
  sets,
}: {
  children: ReactNode;
  index: number;
  isSelected: boolean;
  itemCount: number;
  loopRounds: number;
  loopRestSeconds: number;
  minutes: number;
  onAddNext: () => void;
  onDropToEnd: () => void;
  onLoopRoundsChange: (value: number) => void;
  onLoopRestSecondsChange: (value: number) => void;
  section: (typeof sectionConfigs)[number];
  sets: number;
}) {
  const isTraining = section.id === "training";
  const visual = sectionVisualStyles[section.id];

  return (
    <section
      className={`group relative overflow-hidden rounded-[20px] border px-md pb-sm pt-md transition-all ${
        isSelected
          ? `${visual.selected} shadow-card ring-1`
          : `${visual.block} hover:border-primary/25 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]`
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropToEnd();
      }}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${visual.line}`} aria-hidden="true" />
      <div className="mb-md flex flex-col gap-sm md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-sm">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              isSelected ? `${visual.node} text-white` : visual.icon
            }`}
          >
            <SymbolIcon className="text-[22px]">{section.icon}</SymbolIcon>
          </span>
          <div className="min-w-0">
            <h3 className="font-title-lg text-title-lg font-extrabold">
              {index + 1}. {section.title}
            </h3>
            <p className="mt-[2px] font-label-sm text-label-sm text-muted">
              {section.subtitle}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-xs">
          {isTraining ? (
            <div className="flex h-9 items-center overflow-hidden rounded-xl border border-line bg-white/85 p-[2px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <label className="flex h-full items-center gap-xs rounded-lg px-sm font-label-md text-label-md text-secondary transition-colors hover:bg-primary-soft/60">
                <SymbolIcon className={`text-[18px] ${visual.accentText}`}>repeat</SymbolIcon>
                <span>轮数</span>
                <select
                  className="h-7 rounded-lg border border-outline-variant bg-white px-sm text-center font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
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
              <span className="mx-[2px] h-5 w-px bg-line" aria-hidden="true" />
              <label className="flex h-full items-center gap-xs rounded-lg px-sm font-label-md text-label-md text-secondary transition-colors hover:bg-primary-soft/60">
                <SymbolIcon className={`text-[18px] ${visual.accentText}`}>timer</SymbolIcon>
                <span className="whitespace-nowrap">轮间休息</span>
                <select
                  className="h-7 rounded-lg border border-outline-variant bg-white px-sm text-center font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
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
            </div>
          ) : null}
          <button
            className={`flex h-9 shrink-0 items-center justify-center gap-xs rounded-xl border px-md font-label-md text-label-md transition-colors active:scale-[0.98] ${
              isSelected
                ? `${visual.node} border-transparent text-white shadow-card hover:opacity-90`
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
        <div className="space-y-xs">{children}</div>
      ) : (
        <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-outline-variant bg-white/65 p-md text-center font-label-md text-label-md text-muted">
          <div>
            <SymbolIcon className={`mb-xs text-3xl ${visual.accentText}`}>{section.icon}</SymbolIcon>
            <p>请从右侧动作库添加</p>
          </div>
        </div>
      )}
      <div className="mt-md flex flex-wrap items-center justify-end gap-x-sm gap-y-[2px] border-t border-line/70 pt-xs">
        <SectionSummaryPill icon="format_list_numbered" label="动作" value={`${itemCount} 个`} visual={visual} />
        <SectionSummaryPill icon="repeat" label="组数" value={`${sets} 组`} visual={visual} />
        <SectionSummaryPill icon="schedule" label="预计" value={`${minutes} min`} visual={visual} />
      </div>
    </section>
  );
}

function SectionSummaryPill({
  icon,
  label,
  value,
  visual,
}: {
  icon: string;
  label: string;
  value: string;
  visual: (typeof sectionVisualStyles)[WorkoutSection];
}) {
  return (
    <span className="flex h-7 items-center gap-[4px] font-label-sm text-label-sm text-secondary">
      <SymbolIcon className={`text-[15px] ${visual.accentText}`}>{icon}</SymbolIcon>
      <span className="font-extrabold text-ink">{value}</span>
      <span className="font-medium text-muted">{label}</span>
    </span>
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
  const warmupToTrainingRestSeconds = workout.warmupToTrainingRestSeconds ?? defaultWarmupToTrainingRestSeconds;
  const trainingToStretchRestSeconds = workout.trainingToStretchRestSeconds ?? defaultTrainingToStretchRestSeconds;
  const normalizedItems = workout.items.map(normalizeWorkoutItem);
  const minutes = estimateWorkoutMinutes(normalizedItems, {
    trainingLoopRestSeconds: loopRestSeconds,
    trainingLoopRounds: loopRounds,
    warmupToTrainingRestSeconds,
    trainingToStretchRestSeconds,
  });
  const calories = estimateWorkoutCalories(normalizedItems, {
    trainingLoopRestSeconds: loopRestSeconds,
    trainingLoopRounds: loopRounds,
    warmupToTrainingRestSeconds,
    trainingToStretchRestSeconds,
  });
  return (
    <div
      className={`group relative flex w-full items-center gap-sm overflow-hidden rounded-xl border p-sm text-left transition-all ${
        isActive
          ? "border-primary bg-primary/5 shadow-card ring-2 ring-primary/10"
          : "border-line bg-white hover:border-primary/40 hover:ring-1 hover:ring-primary/10"
      }`}
    >
      <span
        className={`absolute left-0 top-sm h-[calc(100%-1rem)] w-[3px] rounded-r-full transition-colors ${
          isActive ? "bg-primary" : "bg-transparent group-hover:bg-primary/25"
        }`}
        aria-hidden="true"
      />
      <button
        className="flex min-w-0 flex-1 items-center gap-sm pl-[2px] text-left transition-[padding] md:group-hover:pr-16"
        onClick={onOpen}
        title={workout.title}
        type="button"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isActive ? "bg-primary text-white" : "bg-primary-soft text-primary"
          }`}
        >
          <SymbolIcon className="text-[20px]">fitness_center</SymbolIcon>
        </span>
        <span className="min-w-0 flex-1 space-y-[3px]">
          <span className="block max-w-full truncate font-label-md text-label-md font-bold leading-tight">
            {workout.title}
          </span>
          <span className="flex max-w-full items-center gap-1 overflow-hidden">
            <span className="shrink-0 rounded bg-surface-container px-[5px] py-[1px] text-[10px] font-semibold text-secondary">
              {workout.items.length}动作
            </span>
            <span className="shrink-0 rounded bg-surface-container px-[5px] py-[1px] text-[10px] font-semibold text-secondary">
              {loopRounds}轮
            </span>
            <span className="shrink-0 rounded bg-primary-soft px-[5px] py-[1px] text-[10px] font-semibold text-primary">
              {minutes}min
            </span>
            <span className="shrink-0 rounded bg-surface-container px-[5px] py-[1px] text-[10px] font-semibold text-secondary">
              {calories}kcal
            </span>
          </span>
          <span className="block truncate text-[10px] text-outline">
            {workout.updatedAt}
          </span>
        </span>
      </button>
      <div className="absolute right-sm top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-1 rounded-full border border-line bg-white/95 p-[2px] opacity-100 shadow-sm transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
        <button
          aria-label={`复制 ${workout.title}`}
          className="grid h-7 w-7 place-items-center rounded-full text-outline transition-colors hover:bg-primary/10 hover:text-primary"
          onClick={onDuplicate}
          type="button"
        >
          <SymbolIcon className="text-[18px] leading-none">content_copy</SymbolIcon>
        </button>
        <button
          aria-label={`删除 ${workout.title}`}
          className="grid h-7 w-7 place-items-center rounded-full text-outline transition-colors hover:bg-error/10 hover:text-error"
          onClick={onDelete}
          type="button"
        >
          <SymbolIcon className="text-[18px] leading-none">delete</SymbolIcon>
        </button>
      </div>
    </div>
  );
}

function WorkbenchMetric({
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
      className={`flex h-8 shrink-0 items-center gap-[3px] rounded-full border px-sm ${
        primary ? "border-primary/20 bg-primary-soft text-primary" : "border-line bg-panel-soft text-ink"
      }`}
    >
      <span className={primary ? "text-primary" : "text-outline"}>
        <SymbolIcon className="text-[15px]">{icon}</SymbolIcon>
      </span>
      <span className="font-label-md text-label-md font-extrabold">{value}</span>
      <span className="font-label-sm text-label-sm text-secondary">
        {suffix} · {label}
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
    <select
      aria-label={label}
      className="h-9 w-full rounded-lg border border-outline-variant bg-white px-sm text-[11px] font-semibold text-on-surface outline-none transition-colors hover:bg-surface-container-low focus:border-primary focus:ring-2 focus:ring-primary/20"
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
  );
}

function clampPrescriptionValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// CompactPrescriptionStepper 将动作处方里的数字编辑压缩为行内片段，避免动作卡片被表单控件挤换行。
function CompactPrescriptionStepper({
  ariaLabel,
  className,
  label,
  max = 999,
  min = 1,
  onChange,
  prefix = "",
  suffix = "",
  value,
}: {
  ariaLabel: string;
  className: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  value: number;
}) {
  const commitValue = (nextValue: number) => {
    onChange(clampPrescriptionValue(nextValue, min, max));
  };

  return (
    <div className={`flex h-11 shrink-0 flex-col justify-center gap-[3px] px-xs ${className}`}>
      <span className="text-center text-[10px] font-semibold leading-none text-secondary">{label}</span>
      <div className="grid h-6 grid-cols-[18px_1fr_18px] items-center gap-[2px]">
        <button
          aria-label={`减少${ariaLabel}`}
          className="grid h-6 w-[18px] place-items-center rounded-[6px] text-outline transition-colors hover:bg-primary-soft hover:text-primary disabled:text-outline/30 disabled:hover:bg-transparent"
          disabled={value <= min}
          onClick={(event) => {
            event.stopPropagation();
            commitValue(value - 1);
          }}
          type="button"
        >
          <SymbolIcon className="text-[14px]">remove</SymbolIcon>
        </button>
        <div className="relative flex h-6 min-w-0 items-center justify-center">
          <input
            aria-label={ariaLabel}
            className="h-full w-full min-w-0 rounded-[6px] border-0 bg-transparent px-0 text-center text-[13px] font-extrabold leading-6 text-ink outline-none transition-colors focus:bg-primary-soft focus:ring-2 focus:ring-primary/15"
            inputMode="numeric"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const numericValue = Number(event.target.value.replace(/\D/g, "")) || min;
              commitValue(numericValue);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            value={`${prefix}${value}${suffix}`}
          />
        </div>
        <button
          aria-label={`增加${ariaLabel}`}
          className="grid h-6 w-[18px] place-items-center rounded-[6px] text-outline transition-colors hover:bg-primary-soft hover:text-primary disabled:text-outline/30 disabled:hover:bg-transparent"
          disabled={value >= max}
          onClick={(event) => {
            event.stopPropagation();
            commitValue(value + 1);
          }}
          type="button"
        >
          <SymbolIcon className="text-[14px]">add</SymbolIcon>
        </button>
      </div>
    </div>
  );
}

// WorkoutPrescriptionControl 表达单个动作的目标、组数与组间休息，是动作行右侧的紧凑处方控制组。
function WorkoutPrescriptionControl({
  item,
  onUpdate,
}: {
  item: WorkoutItem;
  onUpdate: (updater: (item: WorkoutItem) => WorkoutItem) => void;
}) {
  const targetLabel = item.mode === "duration" ? "目标时长" : "目标次数";

  return (
    <div
      className="flex h-[50px] shrink-0 items-center rounded-[10px] border border-line bg-white px-[5px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:ml-auto"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      title={`${targetLabel} ${item.target}${item.mode === "duration" ? "s" : ""} · ${item.sets}组 · 组间 ${item.setRestSeconds}s`}
    >
      <CompactPrescriptionStepper
        ariaLabel={targetLabel}
        className="w-[92px]"
        label={targetLabel}
        suffix={item.mode === "duration" ? "s" : ""}
        value={item.target}
        onChange={(nextValue) => onUpdate((current) => ({ ...current, target: nextValue }))}
      />
      <CompactPrescriptionStepper
        ariaLabel="组数"
        className="w-[74px]"
        label="组数"
        prefix="×"
        value={item.sets}
        onChange={(nextValue) => onUpdate((current) => ({ ...current, sets: nextValue }))}
      />
      <div className="flex h-11 w-[86px] shrink-0 flex-col justify-center gap-[3px] px-xs">
        <span className={`text-center text-[10px] font-semibold leading-none ${item.sets > 1 ? "text-secondary" : "text-outline/60"}`}>
          组间休息
        </span>
        {item.sets > 1 ? (
          <Select
            onValueChange={(nextValue: string) =>
              onUpdate((current) => ({ ...current, setRestSeconds: Number(nextValue) }))
            }
            value={String(item.setRestSeconds)}
          >
            <SelectTrigger
              aria-label="组间"
              className="relative h-6 w-full justify-center rounded-[6px] border-0 bg-transparent px-2 pr-5 text-center text-[13px] font-extrabold leading-6 text-ink shadow-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/15 [&>span]:min-w-0 [&>span]:text-center [&>svg]:absolute [&>svg]:right-1.5"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-[88px]">
              {restOptions.map((option) => (
                <SelectItem className="pr-3" key={option} value={String(option)}>
                  {option}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div
            aria-label="组间，1组时不可选"
            className="flex h-6 items-center justify-center rounded-[6px] text-[13px] font-extrabold leading-6 text-outline/60"
          >
            无
          </div>
        )}
      </div>
    </div>
  );
}

function WorkoutExerciseRow({
  dragState,
  exercise,
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
  exercise?: Exercise;
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
  const section = item.section ?? "training";
  const visual = sectionVisualStyles[section];
  const itemTags = [
    item.musclesZh.slice(0, 2).join("、") || exercise?.primaryMusclesZh.slice(0, 2).join("、") || "综合",
    item.equipmentZh || exercise?.equipmentZh || "未标注器械",
  ];

  return (
    <div
      className={`relative flex flex-col gap-md overflow-hidden rounded-2xl border border-line bg-white/95 p-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-primary/35 hover:shadow-[0_12px_26px_rgba(15,23,42,0.07)] hover:ring-1 hover:ring-primary/10 md:flex-row md:items-center ${
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
      <div className={`absolute inset-y-0 left-0 w-1 ${visual.line}`} aria-hidden="true" />
      <div className="flex items-center gap-sm pl-xs md:w-[58px] md:shrink-0">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full border font-label-md text-label-md font-extrabold ${visual.chip}`}>
          {String(index + 1).padStart(2, "0")}
        </div>
        <button
          aria-label={`拖拽排序：${item.nameZh}`}
          className="cursor-grab rounded-md p-xs text-outline transition-colors hover:bg-surface-container-low hover:text-primary active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <SymbolIcon>drag_indicator</SymbolIcon>
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-md md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-md md:min-w-[250px]">
          <button
            aria-label={`查看动作详情：${item.nameZh}`}
            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container-low ring-1 ring-line transition-transform hover:scale-[1.02]"
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
            type="button"
          >
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="64px"
              src={item.imageUrl}
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-xs">
              <p className="min-w-0 flex-1 truncate font-title-sm text-title-sm font-extrabold text-ink">{item.nameZh}</p>
              <span className={`hidden min-w-[34px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-xs py-[1px] text-center text-[10px] font-bold leading-none md:inline-flex ${visual.chip}`}>
                {item.mode === "duration" ? "计时" : "次数"}
              </span>
            </div>
            <div className="mt-xs flex max-w-full flex-nowrap items-center gap-xs overflow-hidden">
              {itemTags.map((tag) => (
                <span
                  className="inline-flex min-w-0 max-w-[140px] shrink-0 items-center rounded-md bg-surface-container-low px-xs py-[2px] text-[11px] font-semibold leading-none text-secondary"
                  key={tag}
                  title={tag}
                >
                  <span className="truncate">{tag}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <WorkoutPrescriptionControl item={item} onUpdate={onUpdate} />
      </div>
      <div className="flex shrink-0 gap-[2px] md:pl-xs">
        <button
          aria-label={`查看动作详情：${item.nameZh}`}
          className="grid h-8 w-8 place-items-center rounded-lg text-outline transition-colors hover:bg-primary/5 hover:text-primary"
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          type="button"
        >
          <SymbolIcon>info</SymbolIcon>
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-outline transition-colors hover:bg-primary/5 hover:text-primary" onClick={(event) => { event.stopPropagation(); onDuplicate(); }} type="button">
          <SymbolIcon>content_copy</SymbolIcon>
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-outline transition-colors hover:bg-error/5 hover:text-error" onClick={(event) => { event.stopPropagation(); onDelete(); }} type="button">
          <SymbolIcon>delete</SymbolIcon>
        </button>
      </div>
    </div>
  );
}

function SectionBoundaryRestControl({
  label,
  onChange,
  section,
  seconds,
}: {
  label: string;
  onChange: (seconds: number) => void;
  section: WorkoutSection;
  seconds: number;
}) {
  const visual = sectionVisualStyles[section];

  return (
    <div className="relative flex h-10 items-center justify-center">
      <span className={`h-px min-w-10 ${visual.line}`} aria-hidden="true" />
      <label className={`mx-xs flex h-8 items-center gap-[5px] rounded-full border bg-white px-sm text-[11px] font-semibold shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-colors hover:border-primary/40 ${visual.chip}`}>
        <span className={`grid h-5 w-5 place-items-center rounded-full text-white ${visual.node}`}>
          <SymbolIcon className="text-[13px]">timer</SymbolIcon>
        </span>
        <span>{label}</span>
        <select
          aria-label={label}
          className="h-6 rounded-full border border-outline-variant bg-white px-[6px] text-[10px] font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
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
      <span className={`h-px min-w-10 ${visual.line}`} aria-hidden="true" />
    </div>
  );
}

function RestIntervalControl({
  onChange,
  section,
  seconds,
}: {
  onChange: (seconds: number) => void;
  section: WorkoutSection;
  seconds: number;
}) {
  const visual = sectionVisualStyles[section];

  return (
    <div className="flex h-9 items-center justify-center">
      <span className={`h-px min-w-12 ${visual.line}`} aria-hidden="true" />
      <label className="group mx-xs flex h-7 cursor-pointer items-center gap-[4px] rounded-full border border-dashed border-outline-variant bg-white px-xs text-[10px] font-semibold text-secondary shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-colors hover:border-primary/50 hover:bg-primary-soft/60">
        <span className={`grid h-5 w-5 place-items-center rounded-full text-white ${visual.node}`}>
          <SymbolIcon className="text-[13px]">timer</SymbolIcon>
        </span>
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
      <span className={`h-px min-w-12 ${visual.line}`} aria-hidden="true" />
    </div>
  );
}
