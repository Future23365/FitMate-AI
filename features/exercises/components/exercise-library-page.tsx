"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { clientRequest } from "@/lib/client/http/client-request";
import type { Exercise, ExerciseFacets, ExerciseSort } from "@/lib/shared/exercises/types";

type ExerciseFacet = {
  value: string;
  label: string;
  count: number;
};

type ActiveFilter = {
  key: string;
  label: string;
  onClear: () => void;
};

type ExerciseApiResponse = {
  items: Exercise[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  facets: {
    categories: ExerciseFacet[];
    levels: ExerciseFacet[];
    force: ExerciseFacet[];
    mechanics: ExerciseFacet[];
    equipment: ExerciseFacet[];
    homeRequirements: ExerciseFacet[];
    muscles: ExerciseFacet[];
    goalTags: ExerciseFacet[];
    riskTags: ExerciseFacet[];
  };
};

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

const exerciseSortOptions: Array<{ value: ExerciseSort; label: string }> = [
  { value: "name_asc", label: "名称 A-Z" },
  { value: "name_desc", label: "名称 Z-A" },
  { value: "level_asc", label: "难度由低到高" },
  { value: "level_desc", label: "难度由高到低" },
  { value: "category_asc", label: "分类升序" },
  { value: "category_desc", label: "分类降序" },
];

const pageSizeOptions = [12, 24, 48, 96];
const drawerTransitionMs = 500;

function getExerciseImage(exercise?: Exercise) {
  return (
    exercise?.imageUrls[0] ||
    "/images/exercise-placeholder.svg"
  );
}

function getDifficultyDot(level?: string | null) {
  if (level === "expert" || level === "advanced") {
    return "bg-red-500";
  }

  if (level === "intermediate") {
    return "bg-yellow-500";
  }

  return "bg-green-500";
}

function getFacetLabel(facets: ExerciseFacet[], value: string) {
  return facets.find((facet) => facet.value === value)?.label ?? value;
}

// 核心筛选在抽屉内保留高频选项和当前已选项，避免默认页面被筛选区占满。
function getVisibleFacetOptions(options: ExerciseFacet[], value: string, limit = 10) {
  const visibleOptions = options.slice(0, limit);

  if (!value || visibleOptions.some((option) => option.value === value)) {
    return visibleOptions;
  }

  const selectedOption = options.find((option) => option.value === value);

  return selectedOption ? [selectedOption, ...visibleOptions].slice(0, limit) : visibleOptions;
}

// 统一动作库高频筛选的 chip 行，保证肌群、分类、器械和目标使用同一种交互。
function ChipFilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ExerciseFacet[];
  value: string;
  onChange: (value: string) => void;
}) {
  const visibleOptions = getVisibleFacetOptions(options, value);

  return (
    <div className="grid gap-sm md:grid-cols-[64px_minmax(0,1fr)]">
      <span className="font-label-md text-label-md text-muted md:pt-1.5">{label}</span>
      <div className="flex min-w-0 gap-sm overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          aria-pressed={!value}
          className={`shrink-0 whitespace-nowrap rounded-lg px-lg py-xs font-label-md text-label-md transition-colors ${
            !value
              ? "bg-primary text-white"
              : "bg-panel-soft text-muted hover:bg-primary-soft hover:text-primary"
          }`}
          onClick={() => onChange("")}
          type="button"
        >
          全部
        </button>
        {visibleOptions.map((facet) => {
          const isActive = value === facet.value;

          return (
            <button
              aria-pressed={isActive}
              className={`shrink-0 whitespace-nowrap rounded-lg px-lg py-xs font-label-md text-label-md transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "bg-panel-soft text-muted hover:bg-primary-soft hover:text-primary"
              }`}
              key={facet.value}
              onClick={() => onChange(facet.value)}
              type="button"
            >
              {facet.label}
              <span className="ml-xs opacity-70">{facet.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 已选筛选条件在工具栏中保持可见，支持快速移除而不占用列表纵向空间。
function ActiveFilterChips({
  activeFilters,
  onReset,
}: {
  activeFilters: ActiveFilter[];
  onReset: () => void;
}) {
  if (!activeFilters.length) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-sm overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {activeFilters.map((filter) => (
        <button
          aria-label={`移除${filter.label}`}
          className="inline-flex shrink-0 items-center gap-xs rounded-lg bg-primary-soft px-md py-xs font-label-sm text-label-sm font-bold text-primary transition-colors hover:bg-primary/15"
          key={filter.key}
          onClick={filter.onClear}
          type="button"
        >
          {filter.label}
          <SymbolIcon className="text-[16px]">close</SymbolIcon>
        </button>
      ))}
      <button
        className="shrink-0 rounded-lg border border-line bg-white px-md py-xs font-label-sm text-label-sm text-muted transition-colors hover:bg-panel-soft"
        onClick={onReset}
        type="button"
      >
        清空筛选
      </button>
    </div>
  );
}

function SelectFilter({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  options: ExerciseFacet[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-xs">
      <span className="font-label-md text-label-md text-muted">{label}:</span>
      <select
        className="h-10 w-full cursor-pointer rounded-lg border border-line bg-white px-md font-label-md text-label-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterDrawer({
  activeFilters,
  category,
  equipment,
  facets,
  force,
  goalTag,
  homeRequirement,
  level,
  mechanic,
  moreFilterCount,
  muscle,
  onCategoryChange,
  onClose,
  onEquipmentChange,
  onForceChange,
  onGoalTagChange,
  onHomeRequirementChange,
  onLevelChange,
  onMechanicChange,
  onMuscleChange,
  onPublishedChange,
  onReset,
  onRiskTagChange,
  isOpen,
  published,
  riskTag,
}: {
  activeFilters: ActiveFilter[];
  category: string;
  equipment: string;
  facets: ExerciseFacets;
  force: string;
  goalTag: string;
  homeRequirement: string;
  level: string;
  mechanic: string;
  moreFilterCount: number;
  muscle: string;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onEquipmentChange: (value: string) => void;
  onForceChange: (value: string) => void;
  onGoalTagChange: (value: string) => void;
  onHomeRequirementChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  onMechanicChange: (value: string) => void;
  onMuscleChange: (value: string) => void;
  onPublishedChange: (value: string) => void;
  onReset: () => void;
  onRiskTagChange: (value: string) => void;
  isOpen: boolean;
  published: string;
  riskTag: string;
}) {
  return (
    <div
      aria-modal="true"
      className={`fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px] drawer-backdrop-transition ${
        isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={onClose}
      role="dialog"
    >
      <aside
        className={`relative flex h-full w-full max-w-[440px] flex-col border-l border-line bg-white shadow-2xl drawer-panel-transition ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-lg py-md">
          <div>
            <h2 className="font-title-lg text-title-lg font-extrabold">筛选动作</h2>
            <p className="mt-[2px] font-label-sm text-label-sm text-muted">
              {activeFilters.length ? `已选 ${activeFilters.length} 项` : "选择动作属性快速缩小范围"}
            </p>
          </div>
          <button
            aria-label="关闭筛选面板"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:bg-panel-soft hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <SymbolIcon className="text-[22px]">close</SymbolIcon>
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-lg py-lg">
          {activeFilters.length ? (
            <div className="mb-lg">
              <ActiveFilterChips activeFilters={activeFilters} onReset={onReset} />
            </div>
          ) : null}

          <section className="mb-xl">
            <h3 className="mb-md font-title-md text-title-md font-extrabold">常用筛选</h3>
            <div className="flex flex-col gap-md">
              <ChipFilterRow
                label="肌群"
                onChange={onMuscleChange}
                options={facets.muscles}
                value={muscle}
              />
              <ChipFilterRow
                label="分类"
                onChange={onCategoryChange}
                options={facets.categories}
                value={category}
              />
              <ChipFilterRow
                label="器械"
                onChange={onEquipmentChange}
                options={facets.equipment}
                value={equipment}
              />
              <ChipFilterRow
                label="目标"
                onChange={onGoalTagChange}
                options={facets.goalTags}
                value={goalTag}
              />
            </div>
          </section>

          <section>
            <div className="mb-md flex items-center justify-between">
              <h3 className="font-title-md text-title-md font-extrabold">更多筛选</h3>
              {moreFilterCount ? (
                <span className="rounded-full bg-primary-soft px-sm py-[2px] font-label-sm text-label-sm font-bold text-primary">
                  {moreFilterCount} 项
                </span>
              ) : null}
            </div>
            <div className="grid gap-md">
              <SelectFilter
                label="难度"
                onChange={onLevelChange}
                options={facets.levels}
                placeholder="全部难度"
                value={level}
              />
              <SelectFilter
                label="居家条件"
                onChange={onHomeRequirementChange}
                options={facets.homeRequirements}
                placeholder="全部条件"
                value={homeRequirement}
              />
              <SelectFilter
                label="发力"
                onChange={onForceChange}
                options={facets.force}
                placeholder="全部发力"
                value={force}
              />
              <SelectFilter
                label="机制"
                onChange={onMechanicChange}
                options={facets.mechanics}
                placeholder="全部机制"
                value={mechanic}
              />
              <SelectFilter
                label="风险"
                onChange={onRiskTagChange}
                options={facets.riskTags}
                placeholder="全部风险"
                value={riskTag}
              />
              <label className="flex min-w-0 flex-col gap-xs">
                <span className="font-label-md text-label-md text-muted">状态:</span>
                <select
                  className="h-10 w-full cursor-pointer rounded-lg border border-line bg-white px-md font-label-md text-label-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  onChange={(event) => onPublishedChange(event.target.value)}
                  value={published}
                >
                  <option value="">全部状态</option>
                  <option value="true">已发布</option>
                  <option value="false">未发布</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="flex items-center gap-sm border-t border-line px-lg py-md">
          <button
            className="flex-1 rounded-xl border border-line bg-white px-lg py-sm font-label-md text-label-md font-bold text-ink transition-colors hover:bg-panel-soft"
            onClick={onReset}
            type="button"
          >
            清空
          </button>
          <button
            className="flex-1 rounded-xl bg-primary px-lg py-sm font-label-md text-label-md font-bold text-white transition-colors hover:bg-primary-deep"
            onClick={onClose}
            type="button"
          >
            查看结果
          </button>
        </div>
      </aside>
    </div>
  );
}

export function ExerciseLibraryPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [muscle, setMuscle] = useState("");
  const [level, setLevel] = useState("");
  const [equipment, setEquipment] = useState("");
  const [homeRequirement, setHomeRequirement] = useState("");
  const [force, setForce] = useState("");
  const [mechanic, setMechanic] = useState("");
  const [goalTag, setGoalTag] = useState("");
  const [riskTag, setRiskTag] = useState("");
  const [published, setPublished] = useState("");
  const [sortBy, setSortBy] = useState<ExerciseSort>("name_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [items, setItems] = useState<Exercise[]>([]);
  const [facets, setFacets] = useState<ExerciseFacets>(defaultExerciseFacets);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLoadingExercises, setIsLoadingExercises] = useState(true);
  const [exerciseError, setExerciseError] = useState("");
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [isFilterDrawerMounted, setIsFilterDrawerMounted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort: sortBy,
    });

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (category) {
      params.set("category", category);
    }

    if (muscle) {
      params.set("muscle", muscle);
    }

    if (level) {
      params.set("level", level);
    }

    if (equipment) {
      params.set("equipment", equipment);
    }

    if (homeRequirement) {
      params.set("homeRequirement", homeRequirement);
    }

    if (force) {
      params.set("force", force);
    }

    if (mechanic) {
      params.set("mechanic", mechanic);
    }

    if (goalTag) {
      params.set("goalTag", goalTag);
    }

    if (riskTag) {
      params.set("riskTag", riskTag);
    }

    if (published) {
      params.set("published", published);
    }

    clientRequest<ExerciseApiResponse>(`/api/exercises?${params.toString()}`, {
      signal: controller.signal,
      errorMessage: "动作库加载失败，请稍后重试。",
    })
      .then((data) => {
        setItems(data.items);
        setFacets(data.facets);
        setTotal(data.total);
        setTotalPages(Math.max(1, data.totalPages));
        setHasNextPage(data.hasNextPage);
        setHasPreviousPage(data.hasPreviousPage);
        setExerciseError("");
        setSelectedId((current) => current || data.items[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setExerciseError(error instanceof Error ? error.message : "动作库加载失败，请稍后重试。");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingExercises(false);
        }
      });

    return () => controller.abort();
  }, [
    category,
    equipment,
    force,
    goalTag,
    homeRequirement,
    level,
    mechanic,
    muscle,
    page,
    pageSize,
    published,
    query,
    riskTag,
    sortBy,
  ]);

  useEffect(() => {
    if (!isMoreFiltersOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreFiltersOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreFiltersOpen]);

  useEffect(() => {
    if (isMoreFiltersOpen) {
      document.body.style.overflow = "hidden";
      document.body.classList.add("drawer-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("drawer-open");
    }

    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("drawer-open");
    };
  }, [isMoreFiltersOpen]);

  useEffect(() => {
    if (isMoreFiltersOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsFilterDrawerMounted(false);
    }, drawerTransitionMs);

    return () => window.clearTimeout(timer);
  }, [isMoreFiltersOpen]);

  function updateFilter(updater: () => void) {
    setIsLoadingExercises(true);
    setPage(1);
    updater();
  }

  function resetFilters() {
    setIsLoadingExercises(true);
    setQuery("");
    setCategory("");
    setMuscle("");
    setLevel("");
    setEquipment("");
    setHomeRequirement("");
    setForce("");
    setMechanic("");
    setGoalTag("");
    setRiskTag("");
    setPublished("");
    setPage(1);
  }

  function openFilterDrawer() {
    setIsFilterDrawerMounted(true);
    window.requestAnimationFrame(() => {
      setIsMoreFiltersOpen(true);
    });
  }

  function closeFilterDrawer() {
    setIsMoreFiltersOpen(false);
  }

  const activeFilters: ActiveFilter[] = [
    query
      ? {
          key: "query",
          label: `搜索：${query}`,
          onClear: () => updateFilter(() => setQuery("")),
        }
      : null,
    category
      ? {
          key: "category",
          label: `分类：${getFacetLabel(facets.categories, category)}`,
          onClear: () => updateFilter(() => setCategory("")),
        }
      : null,
    muscle
      ? {
          key: "muscle",
          label: `肌群：${getFacetLabel(facets.muscles, muscle)}`,
          onClear: () => updateFilter(() => setMuscle("")),
        }
      : null,
    equipment
      ? {
          key: "equipment",
          label: `器械：${getFacetLabel(facets.equipment, equipment)}`,
          onClear: () => updateFilter(() => setEquipment("")),
        }
      : null,
    goalTag
      ? {
          key: "goalTag",
          label: `目标：${getFacetLabel(facets.goalTags, goalTag)}`,
          onClear: () => updateFilter(() => setGoalTag("")),
        }
      : null,
    level
      ? {
          key: "level",
          label: `难度：${getFacetLabel(facets.levels, level)}`,
          onClear: () => updateFilter(() => setLevel("")),
        }
      : null,
    homeRequirement
      ? {
          key: "homeRequirement",
          label: `居家条件：${getFacetLabel(facets.homeRequirements, homeRequirement)}`,
          onClear: () => updateFilter(() => setHomeRequirement("")),
        }
      : null,
    force
      ? {
          key: "force",
          label: `发力：${getFacetLabel(facets.force, force)}`,
          onClear: () => updateFilter(() => setForce("")),
        }
      : null,
    mechanic
      ? {
          key: "mechanic",
          label: `机制：${getFacetLabel(facets.mechanics, mechanic)}`,
          onClear: () => updateFilter(() => setMechanic("")),
        }
      : null,
    riskTag
      ? {
          key: "riskTag",
          label: `风险：${getFacetLabel(facets.riskTags, riskTag)}`,
          onClear: () => updateFilter(() => setRiskTag("")),
        }
      : null,
    published
      ? {
          key: "published",
          label: `状态：${published === "true" ? "已发布" : "未发布"}`,
          onClear: () => updateFilter(() => setPublished("")),
        }
      : null,
  ].filter((filter): filter is ActiveFilter => Boolean(filter));
  const moreFilterCount = [level, homeRequirement, force, mechanic, riskTag, published].filter(Boolean).length;
  const effectiveSelectedId = items.some((exercise) => exercise.id === selectedId)
    ? selectedId
    : items[0]?.id || "";
  const selectedExercise = items.find((exercise) => exercise.id === effectiveSelectedId);
  const relatedExercises = selectedExercise
    ? items
        .filter(
          (exercise) =>
            exercise.id !== selectedExercise.id &&
            exercise.primaryMuscles.some((muscleName) =>
              selectedExercise.primaryMuscles.includes(muscleName),
            ),
        )
        .slice(0, 5)
    : [];

  return (
    <div className="app-mesh-bg min-h-screen text-ink md:pl-[260px]">
      <main className="custom-scrollbar h-screen overflow-y-auto p-lg xl:pr-[364px] xl:p-xl">
        <header className="mb-lg flex flex-col gap-xs">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-extrabold tracking-[-0.03em]">动作库</h1>
            <p className="mt-xs font-body-md text-body-md text-muted">
              查找标准动作教学，构建你的专属训练方案
            </p>
          </div>
        </header>

        <section className="-mx-lg mb-lg border-y border-line/80 bg-[#F6F8FB]/92 px-lg py-md backdrop-blur-xl xl:-mx-xl xl:px-xl">
          <div className="flex flex-col gap-sm xl:flex-row xl:items-center">
            <div className="flex min-h-11 flex-1 items-center gap-md rounded-xl border border-line bg-white px-lg py-sm shadow-card transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <SymbolIcon className="text-muted">search</SymbolIcon>
              <input
                className="w-full border-none bg-transparent font-body-md text-body-md text-ink outline-none placeholder:text-muted focus:ring-0"
                onChange={(event) => updateFilter(() => setQuery(event.target.value))}
                placeholder="搜索动作名称，如：深蹲、硬拉..."
                type="text"
                value={query}
              />
            </div>
            <div className="flex items-center gap-sm">
              <button
                aria-expanded={isMoreFiltersOpen}
                className="inline-flex h-11 items-center gap-xs rounded-xl border border-line bg-white px-lg font-label-md text-label-md font-bold text-ink shadow-card transition-colors hover:bg-panel-soft"
                onClick={openFilterDrawer}
                type="button"
              >
                <SymbolIcon className="text-[20px]">tune</SymbolIcon>
                筛选
                {activeFilters.length ? (
                  <span className="rounded-full bg-primary px-xs text-label-xs font-bold text-white">
                    {activeFilters.length}
                  </span>
                ) : null}
              </button>
              {activeFilters.length ? (
                <button
                  className="hidden h-11 rounded-xl border border-line bg-white px-lg font-label-md text-label-md font-bold text-muted shadow-card transition-colors hover:bg-panel-soft sm:block"
                  onClick={resetFilters}
                  type="button"
                >
                  清空
                </button>
              ) : null}
            </div>
          </div>

          {activeFilters.length ? (
            <div className="mt-sm">
              <ActiveFilterChips activeFilters={activeFilters} onReset={resetFilters} />
            </div>
          ) : null}
        </section>

        {isFilterDrawerMounted ? (
          <FilterDrawer
            activeFilters={activeFilters}
            category={category}
            equipment={equipment}
            facets={facets}
            force={force}
            goalTag={goalTag}
            homeRequirement={homeRequirement}
            isOpen={isMoreFiltersOpen}
            level={level}
            mechanic={mechanic}
            moreFilterCount={moreFilterCount}
            muscle={muscle}
            onCategoryChange={(value) => updateFilter(() => setCategory(value))}
            onClose={closeFilterDrawer}
            onEquipmentChange={(value) => updateFilter(() => setEquipment(value))}
            onForceChange={(value) => updateFilter(() => setForce(value))}
            onGoalTagChange={(value) => updateFilter(() => setGoalTag(value))}
            onHomeRequirementChange={(value) => updateFilter(() => setHomeRequirement(value))}
            onLevelChange={(value) => updateFilter(() => setLevel(value))}
            onMechanicChange={(value) => updateFilter(() => setMechanic(value))}
            onMuscleChange={(value) => updateFilter(() => setMuscle(value))}
            onPublishedChange={(value) => updateFilter(() => setPublished(value))}
            onReset={resetFilters}
            onRiskTagChange={(value) => updateFilter(() => setRiskTag(value))}
            published={published}
            riskTag={riskTag}
          />
        ) : null}

        <section>
          <div className="mb-lg flex flex-col gap-md border-b border-line pb-md xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="font-title-lg text-title-lg font-extrabold">所有动作</h2>
              <p className="mt-xs font-label-sm text-label-sm text-muted">
                共 {total} 条 · 第 {page} / {totalPages} 页 · 当前 {items.length} 条
              </p>
            </div>
            <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
              <label className="flex items-center gap-sm">
                <span className="shrink-0 font-label-md text-label-md text-muted">排序:</span>
                <select
                  className="h-10 cursor-pointer rounded-lg border border-line bg-white px-md font-label-md text-label-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  onChange={(event) =>
                    updateFilter(() => setSortBy(event.target.value as ExerciseSort))
                  }
                  value={sortBy}
                >
                  {exerciseSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-sm">
                <span className="shrink-0 font-label-md text-label-md text-muted">每页:</span>
                <select
                  className="h-10 cursor-pointer rounded-lg border border-line bg-white px-md font-label-md text-label-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  onChange={(event) => {
                    setIsLoadingExercises(true);
                    setPage(1);
                    setPageSize(Number(event.target.value));
                  }}
                  value={pageSize}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} 条
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {exerciseError ? (
            <div className="rounded-lg border border-error-container bg-error-container/40 p-lg font-label-md text-label-md text-on-error-container">
              {exerciseError}
            </div>
          ) : null}

          {isLoadingExercises ? (
            <div className="grid grid-cols-2 gap-lg md:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="rounded-xl border border-line bg-white p-sm shadow-card" key={index}>
                  <div className="mb-sm aspect-square animate-pulse rounded-md bg-surface-container" />
                  <div className="mb-xs h-4 w-2/3 animate-pulse rounded bg-surface-container" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-surface-container" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {items.length ? (
                <div className="grid grid-cols-2 gap-lg md:grid-cols-3 2xl:grid-cols-4">
                  {items.map((exercise) => {
                    const isSelected = exercise.id === effectiveSelectedId;

                    return (
                      <button
                        className={`rounded-xl p-sm text-left transition-all ${
                          isSelected
                            ? "border-2 border-primary bg-primary/5 ring-2 ring-primary/10"
                            : "border border-line bg-white shadow-card hover:border-primary hover:shadow-lift"
                        }`}
                        key={exercise.id}
                        onClick={() => setSelectedId(exercise.id)}
                        type="button"
                      >
                        <div className="relative mb-sm aspect-square overflow-hidden rounded-lg bg-panel-soft">
                          <Image
                            alt={`${exercise.nameZh} 动作示意图`}
                            className="object-cover transition duration-500 hover:scale-105"
                            fill
                            sizes="(min-width: 1536px) 220px, (min-width: 768px) 30vw, 45vw"
                            src={getExerciseImage(exercise)}
                          />
                        </div>
                        <div className="mb-[2px] flex min-w-0 items-center gap-xs">
                          <p
                            className={`min-w-0 flex-1 truncate font-label-md text-label-md ${
                              isSelected ? "text-primary" : ""
                            }`}
                          >
                            {exercise.nameZh}
                          </p>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 font-label-xs text-[12px] leading-tight ${
                              isSelected
                                ? "text-primary"
                                : "text-muted"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${getDifficultyDot(exercise.level)}`}
                            />
                            {exercise.levelZh || "未标注"}
                          </span>
                        </div>
                        <p className="flex items-center gap-1 font-label-sm text-label-sm text-primary">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isSelected ? "bg-primary" : "bg-primary/70"
                            }`}
                          />
                          <span className="truncate">
                            {exercise.primaryMusclesZh[0] || "未标注肌群"}
                          </span>
                        </p>
                        <p className="mt-xs truncate font-label-sm text-label-sm text-muted">
                          {exercise.categoryZh || "未分类"} ·{" "}
                          {exercise.equipmentZh || "未标注器械"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line bg-white p-2xl text-center shadow-card">
                  <SymbolIcon className="mb-sm text-4xl text-muted">
                    search_off
                  </SymbolIcon>
                  <p className="font-title-lg text-title-lg">没有找到匹配动作</p>
                  <p className="mt-xs font-label-md text-label-md text-muted">
                    调整关键词或清空部分筛选后再试。
                  </p>
                </div>
              )}

              <div className="mt-xl flex flex-col gap-md border-t border-line pt-lg md:flex-row md:items-center md:justify-between">
                <span className="font-label-md text-label-md text-muted">
                  共 {total} 条 · 第 {page} / {totalPages} 页
                </span>
                <div className="flex items-center gap-sm">
                  <button
                    className="rounded-xl border border-line bg-white px-lg py-sm font-label-md text-label-md font-bold transition-colors hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasPreviousPage || isLoadingExercises}
                    onClick={() => {
                      setIsLoadingExercises(true);
                      setPage((current) => Math.max(1, current - 1));
                    }}
                    type="button"
                  >
                    上一页
                  </button>
                  <button
                    className="rounded-xl border border-line bg-white px-lg py-sm font-label-md text-label-md font-bold transition-colors hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasNextPage || isLoadingExercises}
                    onClick={() => {
                      setIsLoadingExercises(true);
                      setPage((current) => Math.min(totalPages, current + 1));
                    }}
                    type="button"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      <ExerciseDetailPanel
        exercise={selectedExercise}
        onSelectExercise={setSelectedId}
        relatedExercises={relatedExercises}
      />
    </div>
  );
}

function ExerciseDetailPanel({
  exercise,
  onSelectExercise,
  relatedExercises,
}: {
  exercise?: Exercise;
  onSelectExercise: (id: string) => void;
  relatedExercises: Exercise[];
}) {
  const [selectedImage, setSelectedImage] = useState({
    exerciseId: "",
    index: 0,
  });
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const imageUrls = exercise?.imageUrls.length
    ? exercise.imageUrls
    : ["/images/exercise-placeholder.svg"];
  const activeImageIndex =
    selectedImage.exerciseId === exercise?.id ? Math.min(selectedImage.index, imageUrls.length - 1) : 0;
  const activeImageUrl = imageUrls[activeImageIndex];
  const hasMultipleImages = imageUrls.length > 1;

  useEffect(() => {
    if (!exercise || !hasMultipleImages || !isAutoPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      setSelectedImage((current) => {
        const currentIndex = current.exerciseId === exercise.id ? current.index : 0;

        return {
          exerciseId: exercise.id,
          index: (currentIndex + 1) % imageUrls.length,
        };
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [exercise, hasMultipleImages, imageUrls.length, isAutoPlaying]);

  function selectImage(index: number) {
    setSelectedImage({
      exerciseId: exercise?.id ?? "",
      index,
    });
  }

  return (
    <aside className="fixed right-0 top-0 z-30 hidden h-screen w-[340px] flex-col border-l border-line/70 bg-white/68 shadow-nav backdrop-blur-2xl xl:flex">
      <div className="custom-scrollbar flex h-full flex-col overflow-y-auto p-lg">
        {exercise ? (
          <>
            <div className="mb-lg flex flex-col gap-md">
              <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-[#EEF2F6] shadow-card ring-1 ring-line/70">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(230,236,255,0.95),rgba(246,248,251,0.76)_48%,rgba(238,242,246,0.96))]" />
                <Image
                  alt={`${exercise.nameZh} 第 ${activeImageIndex + 1} 步示意图`}
                  className="object-cover mix-blend-multiply contrast-[1.05] saturate-[0.98]"
                  fill
                  sizes="340px"
                  src={activeImageUrl}
                />
                <div className="absolute left-sm top-sm rounded-full bg-black/55 px-sm py-xs font-label-sm text-label-sm text-white">
                  {activeImageIndex + 1} / {imageUrls.length}
                </div>
                {hasMultipleImages ? (
                  <>
                    <button
                      aria-label={isAutoPlaying ? "暂停自动播放" : "自动播放动作图"}
                      className="absolute right-sm top-sm flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70"
                      onClick={() => setIsAutoPlaying((current) => !current)}
                      title={isAutoPlaying ? "暂停自动播放" : "自动播放动作图"}
                      type="button"
                    >
                      <SymbolIcon className="text-[20px]">
                        {isAutoPlaying ? "pause" : "play_arrow"}
                      </SymbolIcon>
                    </button>
                    <button
                      aria-label="上一张动作图"
                      className="absolute left-sm top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeImageIndex === 0}
                      onClick={() => selectImage(Math.max(0, activeImageIndex - 1))}
                      type="button"
                    >
                      <SymbolIcon className="text-[20px]">chevron_left</SymbolIcon>
                    </button>
                    <button
                      aria-label="下一张动作图"
                      className="absolute right-sm top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeImageIndex === imageUrls.length - 1}
                      onClick={() => selectImage(Math.min(imageUrls.length - 1, activeImageIndex + 1))}
                      type="button"
                    >
                      <SymbolIcon className="text-[20px]">chevron_right</SymbolIcon>
                    </button>
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-sm">
                {imageUrls.map((imageUrl, index) => (
                  <button
                    aria-label={`查看第 ${index + 1} 步动作图`}
                    className={`flex items-center gap-xs rounded-full px-md py-xs font-label-sm text-label-sm transition-colors ${
                      activeImageIndex === index
                        ? "bg-primary text-white"
                        : "bg-panel-soft text-muted hover:bg-primary-soft hover:text-primary"
                    }`}
                    key={`${imageUrl}-${index}`}
                    onClick={() => selectImage(index)}
                    type="button"
                  >
                    第 {index + 1} 步
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-lg">
              <div>
                <h2 className="mb-xs font-headline-md text-headline-md">{exercise.nameZh}</h2>
                <div className="flex flex-wrap gap-sm">
                  {exercise.primaryMusclesZh.slice(0, 2).map((muscleName) => (
                    <span
                      className="rounded-lg bg-primary-soft px-sm py-[2px] font-label-sm text-label-sm font-bold text-primary"
                      key={muscleName}
                    >
                      {muscleName}
                    </span>
                  ))}
                  <span className="rounded-lg bg-panel-soft px-sm py-[2px] font-label-sm text-label-sm text-muted">
                    难度：{exercise.levelZh || "未标注"}
                  </span>
                  <span className="rounded-lg bg-panel-soft px-sm py-[2px] font-label-sm text-label-sm text-muted">
                    {exercise.equipmentZh || "器械未标注"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-md rounded-xl bg-panel-soft p-md">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-muted">
                    建议组数
                  </span>
                  <span className="font-title-lg text-title-lg">3-4 组</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-muted">
                    目标类型
                  </span>
                  <span className="truncate font-title-lg text-title-lg">
                    {exercise.categoryZh || "训练"}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="mb-md font-title-lg text-title-lg">动作步骤</h3>
                <div className="flex flex-col gap-md">
                  {exercise.instructionsZh.slice(0, 5).map((instruction, index) => (
                    <div className="flex gap-md" key={`${exercise.id}-${index}`}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary font-label-md text-label-md text-white">
                        {index + 1}
                      </span>
                      <p className="font-body-md text-body-md">{instruction}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-md font-title-lg text-title-lg">相关动作</h3>
                <div className="custom-scrollbar flex gap-md overflow-x-auto pb-sm">
                  {relatedExercises.length ? (
                    relatedExercises.map((relatedExercise) => (
                      <button
                        className="w-24 shrink-0 text-left"
                        key={relatedExercise.id}
                        onClick={() => onSelectExercise(relatedExercise.id)}
                        type="button"
                      >
                        <div className="relative mb-xs aspect-square overflow-hidden rounded-md bg-surface-container">
                          <Image
                            alt={`${relatedExercise.nameZh} 预览`}
                            className="object-cover"
                            fill
                            sizes="96px"
                            src={getExerciseImage(relatedExercise)}
                          />
                        </div>
                        <p className="truncate font-label-sm text-label-sm">
                          {relatedExercise.nameZh}
                        </p>
                      </button>
                    ))
                  ) : (
            <p className="font-label-md text-label-md text-muted">
                      暂无相关动作
                    </p>
                  )}
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted">
            <SymbolIcon className="mb-md text-5xl">fitness_center</SymbolIcon>
            <p className="font-label-md text-label-md">选择一个动作查看教学详情</p>
          </div>
        )}
      </div>
    </aside>
  );
}
