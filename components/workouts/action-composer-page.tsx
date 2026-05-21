"use client";

import { useEffect, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import type { Exercise, ExerciseFacets } from "@/lib/exercises/types";

type ExerciseApiResponse = {
  items: Exercise[];
  total: number;
  facets: ExerciseFacets;
};

type WorkoutMode = "reps" | "duration";

type WorkoutItem = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  categoryZh: string;
  equipmentZh: string;
  musclesZh: string[];
  instructionsZh: string[];
  imageUrl: string;
  mode: WorkoutMode;
  target: number;
  sets: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
  restSeconds?: number;
};

type SavedWorkout = {
  id: string;
  title: string;
  savedAt: string;
  items: WorkoutItem[];
};

type TemplateExerciseConfig = {
  query: string;
  preferredIds: string[];
  mode?: WorkoutMode;
  target?: number;
  sets?: number;
  setRestSeconds?: number;
  transitionRestSeconds?: number;
};

const historyStorageKey = "fitmate.workoutHistory";
const placeholderImage = "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg";
const restOptions = [15, 20, 30, 45, 60, 90];
const defaultExerciseFacets: ExerciseFacets = {
  categories: [],
  levels: [],
  force: [],
  mechanics: [],
  equipment: [],
  muscles: [],
  goalTags: [],
  riskTags: [],
};

const templateExerciseConfigs: TemplateExerciseConfig[] = [
  {
    query: "自重深蹲",
    preferredIds: ["Bodyweight_Squat", "Chair_Squat"],
    mode: "reps",
    target: 12,
    sets: 4,
    setRestSeconds: 30,
    transitionRestSeconds: 45,
  },
  {
    query: "俯卧撑",
    preferredIds: ["Pushups", "Incline_Push-Up"],
    mode: "reps",
    target: 15,
    sets: 3,
    setRestSeconds: 30,
    transitionRestSeconds: 45,
  },
  {
    query: "平板支撑",
    preferredIds: ["Plank", "Push_Up_to_Side_Plank"],
    mode: "duration",
    target: 45,
    sets: 3,
    setRestSeconds: 20,
    transitionRestSeconds: 30,
  },
];

function toWorkoutItem(
  exercise: Exercise,
  overrides: Partial<
    Pick<WorkoutItem, "mode" | "target" | "sets" | "setRestSeconds" | "transitionRestSeconds">
  > = {},
): WorkoutItem {
  const category = exercise.categoryZh || "训练";
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
    imageUrl: exercise.imageUrls[0] || placeholderImage,
    mode: overrides.mode ?? (isDuration ? "duration" : "reps"),
    target: overrides.target ?? (isDuration ? 45 : 12),
    sets: overrides.sets ?? 3,
    setRestSeconds: overrides.setRestSeconds ?? 30,
    transitionRestSeconds: overrides.transitionRestSeconds ?? 45,
  };
}

function normalizeWorkoutItem(item: WorkoutItem): WorkoutItem {
  const legacyRestSeconds = item.restSeconds ?? 30;

  return {
    ...item,
    setRestSeconds: item.setRestSeconds ?? legacyRestSeconds,
    transitionRestSeconds: item.transitionRestSeconds ?? legacyRestSeconds,
  };
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function readSavedWorkouts() {
  const rawHistory = window.localStorage.getItem(historyStorageKey);

  if (!rawHistory) {
    return [];
  }

  try {
    const savedWorkouts = JSON.parse(rawHistory) as SavedWorkout[];
    return Array.isArray(savedWorkouts) ? savedWorkouts : [];
  } catch {
    return [];
  }
}

function estimateMinutes(items: WorkoutItem[]) {
  const seconds = items.reduce((total, item, index) => {
    const activeSeconds = item.mode === "duration" ? item.target : item.target * 4;
    const setRestSeconds = item.setRestSeconds * Math.max(0, item.sets - 1);
    const transitionRestSeconds = index < items.length - 1 ? item.transitionRestSeconds : 0;

    return total + activeSeconds * item.sets + setRestSeconds + transitionRestSeconds;
  }, 0);

  return Math.max(1, Math.round(seconds / 60));
}

function estimateCalories(items: WorkoutItem[]) {
  return Math.max(0, Math.round(estimateMinutes(items) * 7.2 + items.length * 12));
}

function getTotalSets(items: WorkoutItem[]) {
  return items.reduce((total, item) => total + item.sets, 0);
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
  const response = await fetch(`/api/exercises?${params.toString()}`);

  if (!response.ok) {
    throw new Error("模板动作加载失败");
  }

  const data = (await response.json()) as ExerciseApiResponse;
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
  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);
  const [activeSavedWorkoutId, setActiveSavedWorkoutId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [libraryItems, setLibraryItems] = useState<Exercise[]>([]);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryFacets, setLibraryFacets] = useState<ExerciseFacets>(defaultExerciseFacets);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [libraryMuscle, setLibraryMuscle] = useState("");
  const [libraryEquipment, setLibraryEquipment] = useState("");
  const [libraryLevel, setLibraryLevel] = useState("");
  const [selectedLibraryExerciseId, setSelectedLibraryExerciseId] = useState("");
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState("");
  const [dragOverItemId, setDragOverItemId] = useState("");
  const [detailImageSelection, setDetailImageSelection] = useState({
    detailId: "",
    index: 0,
  });

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

    if (libraryMuscle) {
      params.set("muscle", libraryMuscle);
    }

    if (libraryEquipment) {
      params.set("equipment", libraryEquipment);
    }

    if (libraryLevel) {
      params.set("level", libraryLevel);
    }

    fetch(`/api/exercises?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("动作库加载失败");
        }

        return (await response.json()) as ExerciseApiResponse;
      })
      .then((data) => {
        setLibraryItems(data.items);
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
  }, [libraryCategory, libraryEquipment, libraryLevel, libraryMuscle, libraryQuery]);

  useEffect(() => {
    function loadFromHash() {
      const hashId = window.location.hash.slice(1);

      if (!hashId) {
        return;
      }

      const rawHistory = window.localStorage.getItem(historyStorageKey);

      if (!rawHistory) {
        return;
      }

      try {
        const savedWorkouts = JSON.parse(rawHistory) as SavedWorkout[];
        const matchedWorkout = savedWorkouts.find((workout) => workout.id === hashId);

        if (matchedWorkout) {
          openSavedWorkout(matchedWorkout, false);
        }
      } catch {
        setSaveStatus("历史记录读取失败");
      }
    }

    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);

    return () => window.removeEventListener("hashchange", loadFromHash);
  }, []);

  useEffect(() => {
    function syncSavedWorkouts() {
      setSavedWorkouts(readSavedWorkouts());
    }

    syncSavedWorkouts();
    window.addEventListener("storage", syncSavedWorkouts);
    window.addEventListener("fitmate:history-updated", syncSavedWorkouts);

    return () => {
      window.removeEventListener("storage", syncSavedWorkouts);
      window.removeEventListener("fitmate:history-updated", syncSavedWorkouts);
    };
  }, []);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];
  const selectedLibraryExercise =
    libraryItems.find((exercise) => exercise.id === selectedLibraryExerciseId) ?? libraryItems[0];
  const totalMinutes = estimateMinutes(items);
  const totalCalories = estimateCalories(items);
  const totalSets = getTotalSets(items);
  const hasLibraryFilters =
    Boolean(libraryQuery.trim()) ||
    Boolean(libraryCategory) ||
    Boolean(libraryMuscle) ||
    Boolean(libraryEquipment) ||
    Boolean(libraryLevel);
  const detailName = selectedLibraryExercise?.nameZh ?? selectedItem?.nameZh;
  const detailId = selectedLibraryExercise?.id ?? selectedItem?.id ?? "";
  const detailImageUrls = selectedLibraryExercise?.imageUrls.length
    ? selectedLibraryExercise.imageUrls
    : [selectedItem?.imageUrl ?? placeholderImage];
  const activeDetailImageIndex =
    detailImageSelection.detailId === detailId
      ? Math.min(detailImageSelection.index, detailImageUrls.length - 1)
      : 0;
  const detailImageUrl = detailImageUrls[activeDetailImageIndex] ?? placeholderImage;
  const detailMuscles =
    selectedLibraryExercise?.primaryMusclesZh ?? selectedItem?.musclesZh ?? [];
  const detailInstructions =
    selectedLibraryExercise?.instructionsZh ?? selectedItem?.instructionsZh ?? [];
  const hasMultipleDetailImages = detailImageUrls.length > 1;

  function updateItem(id: string, updater: (item: WorkoutItem) => WorkoutItem) {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  function addExercise(exercise: Exercise) {
    const nextItem = toWorkoutItem(exercise);
    setItems((current) => [...current, nextItem]);
    setSelectedItemId(nextItem.id);
    setSelectedLibraryExerciseId("");
    setSaveStatus("");
  }

  function resetLibraryFilters() {
    setLibraryQuery("");
    setLibraryCategory("");
    setLibraryMuscle("");
    setLibraryEquipment("");
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

      setPlanTitle("燃脂循环训练 A");
      setItems(composedItems);
      setSelectedItemId(composedItems[0]?.id ?? "");
      setSaveStatus(`已从动作库导入 ${composedItems.length} 个模板动作`);
    } catch {
      setSaveStatus("模板动作加载失败");
    }
  }

  function autoSort() {
    const sortedItems = [...items].sort((left, right) => {
      const order = ["热身", "拉伸", "核心", "力量", "有氧", "训练"];
      return order.indexOf(left.categoryZh) - order.indexOf(right.categoryZh);
    });
    setItems(sortedItems);
    setSaveStatus("已按训练类型自动排序");
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

  function openSavedWorkout(workout: SavedWorkout, updateHash = true) {
    const normalizedItems = workout.items.map(normalizeWorkoutItem);

    setPlanTitle(workout.title);
    setItems(normalizedItems);
    setSelectedItemId(normalizedItems[0]?.id ?? "");
    setActiveSavedWorkoutId(workout.id);
    setSaveStatus(`已加载：${workout.title}`);

    if (updateHash) {
      window.history.replaceState(null, "", `#${workout.id}`);
    }
  }

  function duplicateSavedWorkout(workout: SavedWorkout) {
    const now = new Date();
    const copiedWorkout: SavedWorkout = {
      ...workout,
      id: crypto.randomUUID(),
      title: `${workout.title} 副本`,
      savedAt: formatDateTime(now),
      items: workout.items.map((item) => ({
        ...normalizeWorkoutItem(item),
        id: crypto.randomUUID(),
      })),
    };
    const nextHistory = [copiedWorkout, ...savedWorkouts].slice(0, 8);

    window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
    setSavedWorkouts(nextHistory);
    window.dispatchEvent(new Event("fitmate:history-updated"));
    setSaveStatus(`已复制：${workout.title}`);
  }

  function deleteSavedWorkout(workout: SavedWorkout) {
    const confirmed = window.confirm(`删除已保存编排「${workout.title}」？`);

    if (!confirmed) {
      return;
    }

    const nextHistory = savedWorkouts.filter((savedWorkout) => savedWorkout.id !== workout.id);

    window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
    setSavedWorkouts(nextHistory);
    window.dispatchEvent(new Event("fitmate:history-updated"));

    if (activeSavedWorkoutId === workout.id) {
      setActiveSavedWorkoutId("");
    }

    setSaveStatus(`已删除：${workout.title}`);
  }

  function savePlan() {
    const now = new Date();
    const savedWorkout: SavedWorkout = {
      id: crypto.randomUUID(),
      title: planTitle.trim() || "未命名训练计划",
      savedAt: formatDateTime(now),
      items,
    };
    const rawHistory = window.localStorage.getItem(historyStorageKey);
    const currentHistory = rawHistory ? (JSON.parse(rawHistory) as SavedWorkout[]) : [];
    const nextHistory = [savedWorkout, ...currentHistory].slice(0, 8);

    window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
    setSavedWorkouts(nextHistory);
    setActiveSavedWorkoutId(savedWorkout.id);
    window.dispatchEvent(new Event("fitmate:history-updated"));
    setSaveStatus(`已保存：${savedWorkout.savedAt}`);
  }

  function moveItem(draggedId: string, targetId: string) {
    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }

    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const targetIndex = current.findIndex((item) => item.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const nextItems = [...current];
      const [draggedItem] = nextItems.splice(draggedIndex, 1);
      nextItems.splice(targetIndex, 0, draggedItem);

      return nextItems;
    });
    setSaveStatus("已调整动作顺序");
  }

  return (
    <div className="min-h-screen bg-background text-on-surface lg:pl-[260px] xl:pr-[300px]">
      <main className="custom-scrollbar h-screen overflow-y-auto overflow-x-hidden p-lg pb-28 xl:p-xl">
        <header className="mb-xl flex flex-col gap-lg xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-headline-lg text-headline-lg">个性化动作编排</h1>
            <p className="mt-xs font-body-md text-body-md text-on-surface-variant">
              自由组合训练动作，实时调整训练参数与执行顺序
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <button className="rounded-xl border border-outline px-lg py-sm font-label-md text-label-md transition-colors hover:bg-surface-container-low" onClick={importTemplate} type="button">
              导入模板
            </button>
            <button className="rounded-xl border border-outline px-lg py-sm font-label-md text-label-md transition-colors hover:bg-surface-container-low" onClick={() => setShowPreview((value) => !value)} type="button">
              预览训练
            </button>
            <button className="rounded-xl bg-primary-container px-lg py-sm font-label-md text-label-md text-white shadow-sm transition-opacity hover:opacity-90" onClick={savePlan} type="button">
              保存计划
            </button>
          </div>
        </header>

        <section className="mb-lg space-y-sm rounded-2xl border border-outline-variant bg-white p-md shadow-sm">
          <div className="flex items-center justify-between gap-md">
            <h2 className="flex items-center gap-xs font-title-lg text-title-lg">
              <SymbolIcon className="text-[20px] text-primary">bookmark</SymbolIcon>
              已保存编排
            </h2>
            <span className="font-label-sm text-label-sm text-outline">
              {savedWorkouts.length ? `${savedWorkouts.length} 个` : "暂无保存"}
            </span>
          </div>
          {savedWorkouts.length ? (
            <div className="custom-scrollbar -mx-xs flex gap-sm overflow-x-auto px-xs pb-xs">
              {savedWorkouts.map((workout) => (
                <SavedCompositionCard
                  isActive={workout.id === activeSavedWorkoutId}
                  key={workout.id}
                  onDelete={() => deleteSavedWorkout(workout)}
                  onDuplicate={() => duplicateSavedWorkout(workout)}
                  onOpen={() => openSavedWorkout(workout)}
                  workout={workout}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-sm rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-md md:flex-row md:items-center md:justify-between">
              <p className="font-label-md text-label-md text-on-surface-variant">
                保存当前编排后，会在这里快速切换、复制或删除。
              </p>
              <button
                className="flex shrink-0 items-center justify-center gap-xs rounded-full bg-primary-container px-md py-sm font-label-md text-label-md text-white transition-opacity hover:opacity-90"
                onClick={savePlan}
                type="button"
              >
                <SymbolIcon className="text-[18px]">save</SymbolIcon>
                保存当前编排
              </button>
            </div>
          )}
        </section>

        <section className="mb-lg rounded-2xl border border-outline-variant bg-white p-md shadow-sm">
          <div className="mb-lg flex flex-col gap-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-md md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-sm">
              <input
                aria-label="训练计划名称"
                className="min-w-0 flex-1 border-none bg-transparent font-title-lg text-title-lg font-bold outline-none focus:ring-0"
                onChange={(event) => setPlanTitle(event.target.value)}
                value={planTitle}
              />
              <SymbolIcon className="text-[18px] text-primary">edit</SymbolIcon>
            </div>
            <div className="flex flex-wrap items-center gap-lg">
              <Stat icon="schedule" label="min" value={totalMinutes} />
              <Stat icon="format_list_numbered" label="动作" value={items.length} />
              <Stat icon="local_fire_department" label="kcal" value={totalCalories} primary />
            </div>
          </div>

          {items.length ? (
            <div>
              {items.map((item, index) => (
                <div key={item.id}>
                  <WorkoutExerciseRow
                    dragState={dragOverItemId === item.id ? "over" : draggingItemId === item.id ? "dragging" : "idle"}
                    index={index}
                    isSelected={item.id === selectedItem?.id}
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
                      moveItem(draggingItemId, item.id);
                      setDraggingItemId("");
                      setDragOverItemId("");
                    }}
                    onDuplicate={() => duplicateItem(item)}
                    onSelect={() => setSelectedItemId(item.id)}
                    onUpdate={(updater) => updateItem(item.id, updater)}
                  />
                  {index < items.length - 1 ? (
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
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-2xl text-center">
              <SymbolIcon className="mb-sm text-4xl text-outline">playlist_add</SymbolIcon>
              <p className="font-title-lg text-title-lg">从右侧动作库添加训练动作</p>
            </div>
          )}
        </section>

        {showPreview ? (
          <section className="mb-lg rounded-2xl border border-primary-container/20 bg-primary/5 p-lg">
            <h2 className="mb-md font-title-lg text-title-lg">训练预览</h2>
            <div className="grid gap-sm md:grid-cols-2">
              {items.map((item, index) => (
                <div className="rounded-xl bg-white p-md font-label-md text-label-md" key={item.id}>
                  {index + 1}. {item.nameZh} · {item.mode === "duration" ? `${item.target}s` : `${item.target}次`} · {item.sets}组
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="sticky bottom-0 flex justify-center bg-background/80 py-md backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-center gap-xs rounded-2xl border border-outline-variant bg-white p-xs shadow-xl">
            <ToolbarButton icon="auto_awesome" label="自动排序" onClick={autoSort} />
            <ToolbarButton icon="more_time" label="插入休息" onClick={insertRest} />
            <ToolbarButton icon="sync_alt" label="生成循环训练" onClick={() => setPlanTitle("循环训练计划")} />
            <ToolbarButton icon="save" label="保存为模板" onClick={savePlan} primary />
          </div>
        </div>

        {saveStatus ? (
          <div className="fixed bottom-lg left-1/2 z-40 -translate-x-1/2 rounded-full bg-inverse-surface px-lg py-sm font-label-md text-label-md text-inverse-on-surface shadow-lg">
            {saveStatus}
          </div>
        ) : null}
      </main>

      <aside className="fixed right-0 top-0 z-30 hidden h-screen w-[300px] flex-col gap-md overflow-y-auto border-l border-outline-variant bg-white p-md xl:flex">
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
              className="w-full rounded-xl border-none bg-surface-container-low py-sm pl-10 pr-md font-label-md text-label-md outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="搜索训练动作..."
              value={libraryQuery}
            />
          </div>
          <div className="custom-scrollbar mb-sm flex gap-xs overflow-x-auto pb-xs">
            <button
              className={`whitespace-nowrap rounded-lg px-md py-xs text-[11px] transition-colors ${
                !libraryCategory
                  ? "bg-primary text-white"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
              onClick={() => setLibraryCategory("")}
              type="button"
            >
              全部
            </button>
            {libraryFacets.categories.slice(0, 8).map((category) => (
              <button
                className={`whitespace-nowrap rounded-lg px-md py-xs text-[11px] transition-colors ${
                  libraryCategory === category.value
                    ? "bg-primary text-white"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
                key={category.value}
                onClick={() => setLibraryCategory(category.value)}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="mb-sm grid grid-cols-2 gap-xs">
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
                <button
                  className={`flex w-full items-center gap-sm rounded-xl border p-sm text-left transition-all ${
                    isSelected
                      ? "border-primary-container bg-primary/5 ring-2 ring-primary-container/10"
                      : "border-outline-variant bg-surface-container-lowest hover:border-primary"
                  }`}
                  key={exercise.id}
                  onClick={() => setSelectedLibraryExerciseId(exercise.id)}
                  type="button"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-low">
                    <img alt="" className="h-full w-full object-cover" src={exercise.imageUrls[0] || placeholderImage} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-label-md text-label-md font-bold">{exercise.nameZh}</p>
                    <p className="truncate text-[10px] text-outline">
                      {(exercise.primaryMusclesZh[0] || exercise.categoryZh || "综合")} · {exercise.equipmentZh || "未标注"}
                    </p>
                  </div>
                  <span
                    className="rounded-full p-xs text-primary transition-colors hover:bg-primary/10"
                    onClick={(event) => {
                      event.stopPropagation();
                      addExercise(exercise);
                    }}
                  >
                    <SymbolIcon>add_circle</SymbolIcon>
                  </span>
                </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-surface-container-low p-md">
          <div className="mb-md flex items-start justify-between">
            <h2 className="font-label-md text-label-md font-bold">动作详情</h2>
            <SymbolIcon className="text-outline">info</SymbolIcon>
          </div>
          {detailName ? (
            <>
              <div className="relative mb-sm aspect-video overflow-hidden rounded-lg border border-outline-variant bg-surface-container-high">
                <img alt={`${detailName} 动作图`} className="h-full w-full object-cover" src={detailImageUrl} />
                <div className="absolute left-xs top-xs rounded-full bg-black/55 px-xs py-[2px] text-[10px] font-bold text-white">
                  {activeDetailImageIndex + 1} / {detailImageUrls.length}
                </div>
                {hasMultipleDetailImages ? (
                  <>
                    <button
                      aria-label="上一张动作分步图"
                      className="absolute left-xs top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeDetailImageIndex === 0}
                      onClick={() =>
                        setDetailImageSelection({
                          detailId,
                          index: Math.max(0, activeDetailImageIndex - 1),
                        })
                      }
                      type="button"
                    >
                      <SymbolIcon className="text-[18px]">chevron_left</SymbolIcon>
                    </button>
                    <button
                      aria-label="下一张动作分步图"
                      className="absolute right-xs top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeDetailImageIndex === detailImageUrls.length - 1}
                      onClick={() =>
                        setDetailImageSelection({
                          detailId,
                          index: Math.min(detailImageUrls.length - 1, activeDetailImageIndex + 1),
                        })
                      }
                      type="button"
                    >
                      <SymbolIcon className="text-[18px]">chevron_right</SymbolIcon>
                    </button>
                  </>
                ) : null}
              </div>
              {hasMultipleDetailImages ? (
                <div className="custom-scrollbar mb-md flex gap-xs overflow-x-auto pb-xs">
                  {detailImageUrls.map((imageUrl, index) => (
                    <button
                      aria-label={`查看第 ${index + 1} 步动作图`}
                      className={`shrink-0 rounded-full px-sm py-[2px] text-[10px] font-bold transition-colors ${
                        activeDetailImageIndex === index
                          ? "bg-primary text-white"
                          : "bg-white text-on-surface-variant hover:bg-surface-container"
                      }`}
                      key={`${imageUrl}-${index}`}
                      onClick={() => setDetailImageSelection({ detailId, index })}
                      type="button"
                    >
                      第 {index + 1} 步
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mb-sm flex items-center justify-between gap-sm">
                <h3 className="truncate font-body-lg text-body-lg font-bold">{detailName}</h3>
                <div className="flex text-primary">
                  <SymbolIcon className="text-sm" filled>star</SymbolIcon>
                  <SymbolIcon className="text-sm" filled>star</SymbolIcon>
                  <SymbolIcon className="text-sm">star</SymbolIcon>
                </div>
              </div>
              <p className="mb-md text-xs text-outline">
                目标部位：{detailMuscles.slice(0, 3).join("、") || "综合"}
              </p>
              <div className="custom-scrollbar max-h-44 space-y-sm overflow-y-auto pr-xs">
                {detailInstructions.length ? (
                  detailInstructions.map((instruction, index) => (
                  <div className="flex items-start gap-sm" key={`${instruction}-${index}`}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-container text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <p className="text-[11px] leading-relaxed text-on-surface-variant">{instruction}</p>
                  </div>
                  ))
                ) : (
                  <p className="rounded-lg bg-white p-sm text-[11px] text-on-surface-variant">
                    暂无详细步骤。
                  </p>
                )}
              </div>
              {selectedLibraryExercise ? (
                <button
                  className="mt-md flex w-full items-center justify-center gap-xs rounded-xl bg-primary-container py-sm font-label-md text-label-md text-white transition-opacity hover:opacity-90"
                  onClick={() => addExercise(selectedLibraryExercise)}
                  type="button"
                >
                  <SymbolIcon className="text-[18px]">playlist_add</SymbolIcon>
                  加入当前计划
                </button>
              ) : null}
            </>
          ) : (
            <p className="font-label-md text-label-md text-on-surface-variant">选择一个动作查看详情。</p>
          )}
        </section>

        <section className="rounded-2xl border border-primary/10 bg-primary/5 p-md">
          <h2 className="mb-md font-label-md text-label-md font-bold">训练概览</h2>
          <div className="grid grid-cols-2 gap-sm">
            <OverviewTile label="训练时长" value={`${totalMinutes}m`} />
            <OverviewTile label="总动作数" value={String(items.length)} />
            <OverviewTile label="预计组数" value={`${totalSets}组`} />
            <OverviewTile label="预估消耗" value={`${totalCalories}cal`} primary />
          </div>
        </section>
      </aside>
    </div>
  );
}

function SavedCompositionCard({
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
  workout: SavedWorkout;
}) {
  const minutes = estimateMinutes(workout.items.map(normalizeWorkoutItem));
  const calories = estimateCalories(workout.items.map(normalizeWorkoutItem));
  const icon = workout.title.includes("燃脂")
    ? "local_fire_department"
    : workout.title.includes("核心")
      ? "accessibility_new"
      : workout.title.includes("居家")
        ? "home"
        : "fitness_center";

  return (
    <div
      className={`group flex w-64 shrink-0 items-center gap-sm rounded-2xl border p-sm text-left transition-all ${
        isActive
          ? "border-primary-container bg-primary/5 shadow-md ring-2 ring-primary-container/20"
          : "border-outline-variant/70 bg-white hover:border-primary/40 hover:shadow-md"
      }`}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-sm text-left"
        onClick={onOpen}
        type="button"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isActive ? "bg-primary-container text-white" : "bg-tertiary-fixed text-tertiary"
          }`}
        >
          <SymbolIcon className="text-[20px]">{icon}</SymbolIcon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-label-md text-label-md font-bold">
            {workout.title}
          </span>
          <span className="block truncate text-[10px] text-secondary">
            {workout.items.length} 动作 · {minutes}min · {calories}kcal
          </span>
          <span className="block truncate text-[10px] text-outline">
            {workout.savedAt}
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

function Stat({ icon, label, value, primary = false }: { icon: string; label: string; value: number; primary?: boolean }) {
  return (
    <div className={`flex items-center gap-xs ${primary ? "text-primary" : "text-on-surface"}`}>
      <SymbolIcon className={`text-xl ${primary ? "text-primary" : "text-outline"}`}>{icon}</SymbolIcon>
      <span className="font-label-md text-label-md font-bold">
        {value} <span className="text-[10px] font-normal opacity-70">{label}</span>
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
  isSelected,
  item,
  onDelete,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onDuplicate,
  onSelect,
  onUpdate,
}: {
  dragState: "dragging" | "idle" | "over";
  index: number;
  isSelected: boolean;
  item: WorkoutItem;
  onDelete: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDuplicate: () => void;
  onSelect: () => void;
  onUpdate: (updater: (item: WorkoutItem) => WorkoutItem) => void;
}) {
  return (
    <div
      className={`relative flex flex-col gap-md rounded-2xl p-md transition-all md:flex-row md:items-center ${
        isSelected
          ? "border-2 border-primary-container bg-white shadow-lg"
          : "border border-outline-variant bg-surface-container-lowest hover:shadow-md"
      } ${dragState === "dragging" ? "opacity-50" : ""} ${
        dragState === "over" ? "ring-2 ring-primary-container ring-offset-2 ring-offset-background" : ""
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
        onDrop();
      }}
      onClick={onSelect}
    >
      {isSelected ? <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl bg-primary-container" /> : null}
      <div className="flex items-center gap-sm">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full font-label-md text-label-md font-bold ${
            isSelected ? "bg-primary-container text-white" : "border-2 border-outline-variant text-outline"
          }`}
        >
          {index + 1}
        </div>
        <button
          aria-label={`拖拽排序：${item.nameZh}`}
          className="cursor-grab rounded-md p-xs active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <SymbolIcon className={isSelected ? "text-primary" : "text-outline"}>
            drag_indicator
          </SymbolIcon>
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-md md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-md">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl ${isSelected ? "bg-primary/5" : "bg-surface-container-low"}`}>
            <img alt="" className="h-full w-full object-cover" src={item.imageUrl} />
          </div>
          <div className="min-w-0">
            <p className={`truncate font-body-lg text-body-lg font-bold ${isSelected ? "text-primary" : ""}`}>
              {item.nameZh} <span className="text-label-sm font-normal text-outline">{item.nameEn}</span>
            </p>
            <span className={`mt-xs inline-block rounded px-sm py-[2px] text-[10px] font-bold uppercase ${item.mode === "duration" ? "bg-primary-fixed text-on-primary-fixed-variant" : "bg-tertiary-fixed text-on-tertiary-fixed-variant"}`}>
              {item.mode === "duration" ? "时长模式" : "次数模式"}
            </span>
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
          <label className="min-w-[76px] text-center">
            <span className="mb-xs block text-[10px] text-outline">间歇</span>
            <select
              className={`h-9 w-full rounded-lg border bg-transparent px-xs text-center font-label-md text-label-md outline-none focus:ring-0 ${
                isSelected ? "border-primary-container/30 bg-primary/5" : "border-outline-variant"
              }`}
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
        </div>
      </div>
      <div className="flex gap-xs border-outline-variant md:border-l md:pl-md">
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
    <div className="flex items-center justify-center py-xs">
      <label className="group flex cursor-pointer items-center gap-xs rounded-full border border-dashed border-outline-variant bg-surface-container-low/50 px-md py-xs text-on-surface-variant transition-all hover:border-primary/50">
        <SymbolIcon className="text-[14px] text-outline transition-colors group-hover:text-primary">
          timer
        </SymbolIcon>
        <span className="text-[10px] font-medium">休息间隔</span>
        <select
          aria-label="休息间隔"
          className="ml-xs h-6 rounded-full border border-outline-variant bg-white px-sm py-0 text-[10px] font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
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

function OverviewTile({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="rounded-xl bg-white/70 p-sm">
      <p className="mb-xs text-[10px] text-outline">{label}</p>
      <p className={`font-body-md text-body-md font-bold ${primary ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
