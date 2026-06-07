import type { ChatVisibleOutput } from "@/features/chat/types";
import {
  exerciseRecommendationCardSchema,
  type ExerciseRecommendationCard,
} from "@/lib/shared/exercise-recommendations/schema";
import {
  workoutPlanDraftSchema,
  workoutRoutineDraftSchema,
  type WorkoutMode,
  type WorkoutPlanDraft,
  type WorkoutPlanItemDraft,
  type WorkoutRoutineDraft,
  type WorkoutRoutineDraftItem,
  type WorkoutRoutineDraftSection,
  type WorkoutRoutineSection,
} from "@/lib/shared/workout-plans/draft-schema";

const visibleTrainingProposalOutputType = "visibleTrainingProposal";
const visibleTrainingProposalSchemaVersion = "1";
const orderedSections = ["warmup", "training", "stretch"] as const;
const sectionTitles: Record<WorkoutRoutineSection, string> = {
  warmup: "热身激活",
  training: "主训练",
  stretch: "拉伸放松",
};
const sectionSummaryLabels: Record<WorkoutRoutineSection, string> = {
  warmup: "热身",
  training: "主训练",
  stretch: "拉伸",
};

type VisibleTrainingProposalKind = "exercise_selection" | "routine" | "plan";
type ScheduleAssignment = { cycleDayIndex: number; type: "training" | "rest" };
type VisibleTrainingSchedule = {
  cycleLengthDays: number;
  assignments: ScheduleAssignment[];
};

type VisibleTrainingPrescription = {
  mode: WorkoutMode;
  sets: number;
  target: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
};

type VisibleTrainingExerciseItem = {
  exerciseId: string;
  section: WorkoutRoutineSection;
  order: number;
  prescription?: VisibleTrainingPrescription;
};

type VisibleTrainingProposalPayload = {
  kind: VisibleTrainingProposalKind;
  exerciseItems: VisibleTrainingExerciseItem[];
  schedule?: VisibleTrainingSchedule;
};

type VisibleExerciseDetail = {
  exerciseId: string;
  nameZh?: string;
  nameEn?: string;
  categoryZh?: string;
  levelZh?: string;
  equipmentZh?: string | null;
  primaryMusclesZh?: string[];
  secondaryMusclesZh?: string[];
  imageUrl?: string | null;
};

export type VisibleTrainingProposalRichCard =
  | {
      kind: "exerciseRecommendation";
      card: ExerciseRecommendationCard;
    }
  | {
      kind: "routine";
      draft: WorkoutRoutineDraft;
    }
  | {
      kind: "plan";
      draft: WorkoutPlanDraft;
    };

// adaptVisibleTrainingProposalToRichCard 是 visibleOutputs 到旧三张训练富卡片的唯一前端投影入口。
export function adaptVisibleTrainingProposalToRichCard(
  output: ChatVisibleOutput,
): VisibleTrainingProposalRichCard | null {
  const payload = parseVisibleTrainingProposalPayload(output);

  if (!payload) {
    return null;
  }

  const detailMap = collectContentExerciseDetails(output.content);

  if (payload.kind === "exercise_selection") {
    return createExerciseRecommendationCardView(payload, detailMap);
  }

  if (payload.kind === "routine") {
    return createRoutineCardView(payload);
  }

  return createPlanCardView(payload);
}

function createExerciseRecommendationCardView(
  payload: VisibleTrainingProposalPayload,
  detailMap: Map<string, VisibleExerciseDetail>,
): VisibleTrainingProposalRichCard | null {
  const trainingItems = payload.exerciseItems
    .filter((item) => item.section === "training")
    .sort(compareExerciseItems);
  const card: ExerciseRecommendationCard = {
    title: "推荐训练动作",
    goal: createExerciseRecommendationGoal(trainingItems.length),
    summary: createExerciseRecommendationSummary(trainingItems, detailMap),
    items: trainingItems.map((item) => {
      const detail = detailMap.get(item.exerciseId);
      return {
        exerciseId: item.exerciseId,
        nameZh: nonEmptyString(detail?.nameZh) ?? nonEmptyString(detail?.nameEn) ?? item.exerciseId,
        nameEn: nonEmptyString(detail?.nameEn),
        categoryZh: nonEmptyString(detail?.categoryZh) ?? "训练",
        levelZh: nonEmptyString(detail?.levelZh) ?? "未标注",
        equipmentZh: nonEmptyString(detail?.equipmentZh) ?? "未标注器械",
        primaryMusclesZh: normalizeStringList(detail?.primaryMusclesZh, ["综合"]),
        secondaryMusclesZh: normalizeStringList(detail?.secondaryMusclesZh, []),
        imageUrl: nonEmptyString(detail?.imageUrl),
        reasons: ["适合当前训练条件。"],
      };
    }),
    safetyNotes: [],
  };
  const parsed = exerciseRecommendationCardSchema.safeParse(card);

  return parsed.success ? { kind: "exerciseRecommendation", card: parsed.data } : null;
}

function createRoutineCardView(
  payload: VisibleTrainingProposalPayload,
): VisibleTrainingProposalRichCard | null {
  const sections = createRoutineSections(payload.exerciseItems);

  if (!sections) {
    return null;
  }

  const routineItems = sections.flatMap((section) => section.items);
  const estimatedSessionMinutes = estimateSessionMinutes(routineItems);
  const draft: WorkoutRoutineDraft = {
    kind: "routine",
    title: "本次训练编排",
    goal: createRoutineGoal(routineItems.length),
    summary: createRoutineSummary(sections, routineItems.length, estimatedSessionMinutes),
    estimatedSessionMinutes,
    trainingLoopRounds: 1,
    trainingLoopRestSeconds: 60,
    sections,
    safetyNotes: [],
  };
  const parsed = workoutRoutineDraftSchema.safeParse(draft);

  return parsed.success ? { kind: "routine", draft: parsed.data } : null;
}

function createPlanCardView(
  payload: VisibleTrainingProposalPayload,
): VisibleTrainingProposalRichCard | null {
  if (!payload.schedule) {
    return null;
  }

  const routineSections = createRoutineSections(payload.exerciseItems);

  if (!routineSections) {
    return null;
  }

  const assignments = [...payload.schedule.assignments].sort((left, right) => (
    left.cycleDayIndex - right.cycleDayIndex
  ));
  const estimatedSessionMinutes = estimateSessionMinutes(routineSections.flatMap((section) => section.items));
  const days = assignments.map((assignment) => {
    if (assignment.type === "rest") {
      return {
        title: `Day ${assignment.cycleDayIndex} 恢复`,
        focus: "恢复与调整",
        cycleDayIndex: assignment.cycleDayIndex,
        dayType: "rest" as const,
        isRestDay: true,
        estimatedMinutes: 0,
        recoveryNotes: ["安排低强度活动、补水并保证睡眠。"],
        sections: [],
        safetyNotes: [],
      };
    }

    return {
      title: `Day ${assignment.cycleDayIndex} 训练`,
      focus: "完整训练",
      cycleDayIndex: assignment.cycleDayIndex,
      dayType: "mixed" as const,
      isRestDay: false,
      estimatedMinutes: estimatedSessionMinutes,
      recoveryNotes: [],
      sections: cloneRoutineSectionsForPlan(routineSections),
      safetyNotes: [],
    };
  });
  const trainingDayCount = days.filter((day) => !day.isRestDay).length;
  const restDayCount = days.length - trainingDayCount;
  const draft: WorkoutPlanDraft = {
    kind: "plan",
    title: `${payload.schedule.cycleLengthDays} 天训练计划`,
    goal: createPlanGoal(trainingDayCount),
    summary: createPlanSummary(payload.schedule.cycleLengthDays, trainingDayCount, restDayCount, estimatedSessionMinutes),
    cycleLengthDays: payload.schedule.cycleLengthDays,
    trainingDayCount,
    restDayCount,
    cycleRepeatable: true,
    weeklyFrequency: trainingDayCount > 0 ? Math.min(7, trainingDayCount) : undefined,
    estimatedSessionMinutes,
    progression: "先稳定完成动作质量，再逐步增加训练量或缩短休息。",
    recoveryStrategy: "休息日保持低强度活动、补水和睡眠，训练日之间留出恢复窗口。",
    schedulePattern: days.map((day) => ({
      cycleDayIndex: day.cycleDayIndex,
      title: day.title,
      dayType: day.dayType,
      focus: day.focus,
      isRestDay: day.isRestDay,
    })),
    days,
    safetyNotes: [],
  };
  const parsed = workoutPlanDraftSchema.safeParse(draft);

  return parsed.success ? { kind: "plan", draft: parsed.data } : null;
}

function createRoutineSections(items: VisibleTrainingExerciseItem[]): WorkoutRoutineDraftSection[] | null {
  const sections = orderedSections.map((section) => {
    const sectionItems = items
      .filter((item) => item.section === section)
      .sort(compareExerciseItems)
      .flatMap((item): WorkoutRoutineDraftItem[] => {
        if (!item.prescription) {
          return [];
        }

        return [{
          exerciseId: item.exerciseId,
          section: item.section,
          mode: item.prescription.mode,
          sets: item.prescription.sets,
          target: item.prescription.target,
          setRestSeconds: item.prescription.setRestSeconds,
          transitionRestSeconds: item.prescription.transitionRestSeconds,
        }];
      });

    return {
      section,
      title: sectionTitles[section],
      items: sectionItems,
    };
  }).filter((section) => section.items.length > 0);

  return sections.some((section) => section.section === "training") ? sections : null;
}

function cloneRoutineSectionsForPlan(sections: WorkoutRoutineDraftSection[]) {
  return sections.map((section) => ({
    section: section.section,
    title: section.title,
    items: section.items.map((item): WorkoutPlanItemDraft => ({ ...item })),
  }));
}

function parseVisibleTrainingProposalPayload(output: ChatVisibleOutput): VisibleTrainingProposalPayload | null {
  if (
    output.outputType !== visibleTrainingProposalOutputType ||
    output.schemaVersion !== visibleTrainingProposalSchemaVersion ||
    !isRecord(output.payload)
  ) {
    return null;
  }

  const kind = readProposalKind(output.payload.kind);
  const exerciseItems = Array.isArray(output.payload.exerciseItems)
    ? output.payload.exerciseItems.flatMap(parseExerciseItem)
    : [];

  if (!kind || exerciseItems.length === 0) {
    return null;
  }

  return {
    kind,
    exerciseItems,
    schedule: parseSchedule(output.payload.schedule),
  };
}

function parseExerciseItem(value: unknown): VisibleTrainingExerciseItem[] {
  if (!isRecord(value)) {
    return [];
  }

  const exerciseId = nonEmptyString(value.exerciseId);
  const section = readSection(value.section);
  const order = readInteger(value.order, 1, 200);

  if (!exerciseId || !section || order === null) {
    return [];
  }

  return [{
    exerciseId,
    section,
    order,
    prescription: parsePrescription(value.prescription),
  }];
}

function parsePrescription(value: unknown): VisibleTrainingPrescription | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const mode = value.mode === "duration" || value.mode === "reps" ? value.mode : null;
  const sets = readInteger(value.sets, 1, 8);
  const target = readInteger(value.target, 1, 600);
  const setRestSeconds = readInteger(value.setRestSeconds, 0, 300);
  const transitionRestSeconds = readInteger(value.transitionRestSeconds, 0, 600);

  if (!mode || sets === null || target === null || setRestSeconds === null || transitionRestSeconds === null) {
    return undefined;
  }

  return {
    mode,
    sets,
    target,
    setRestSeconds,
    transitionRestSeconds,
  };
}

function parseSchedule(value: unknown): VisibleTrainingSchedule | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const cycleLengthDays = readInteger(value.cycleLengthDays, 1, 90);
  const assignments = Array.isArray(value.assignments)
    ? value.assignments.flatMap(parseScheduleAssignment)
    : [];

  if (cycleLengthDays === null || assignments.length === 0) {
    return undefined;
  }

  return { cycleLengthDays, assignments };
}

function parseScheduleAssignment(value: unknown): ScheduleAssignment[] {
  if (!isRecord(value)) {
    return [];
  }

  const cycleDayIndex = readInteger(value.cycleDayIndex, 1, 90);
  const type = value.type === "training" || value.type === "rest" ? value.type : null;

  return cycleDayIndex !== null && type ? [{ cycleDayIndex, type }] : [];
}

function collectContentExerciseDetails(content: unknown) {
  const detailMap = new Map<string, VisibleExerciseDetail>();

  if (!isRecord(content) || !Array.isArray(content.sections)) {
    return detailMap;
  }

  for (const section of content.sections) {
    if (!isRecord(section) || !Array.isArray(section.items)) {
      continue;
    }

    for (const item of section.items) {
      const detail = parseExerciseDetailFromContentItem(item);

      if (detail) {
        detailMap.set(detail.exerciseId, detail);
      }
    }
  }

  return detailMap;
}

function parseExerciseDetailFromContentItem(value: unknown): VisibleExerciseDetail | null {
  if (!isRecord(value)) {
    return null;
  }

  const itemExerciseId = nonEmptyString(value.exerciseId);
  const exercise = isRecord(value.exercise) ? value.exercise : null;
  const exerciseId = nonEmptyString(exercise?.exerciseId) ?? itemExerciseId;

  if (!exerciseId || !exercise) {
    return null;
  }

  return {
    exerciseId,
    nameZh: nonEmptyString(exercise.nameZh),
    nameEn: nonEmptyString(exercise.nameEn),
    categoryZh: nonEmptyString(exercise.categoryZh),
    levelZh: nonEmptyString(exercise.levelZh),
    equipmentZh: typeof exercise.equipmentZh === "string" || exercise.equipmentZh === null
      ? exercise.equipmentZh
      : undefined,
    primaryMusclesZh: Array.isArray(exercise.primaryMusclesZh)
      ? exercise.primaryMusclesZh.filter((item): item is string => typeof item === "string")
      : undefined,
    secondaryMusclesZh: Array.isArray(exercise.secondaryMusclesZh)
      ? exercise.secondaryMusclesZh.filter((item): item is string => typeof item === "string")
      : undefined,
    imageUrl: typeof exercise.imageUrl === "string" || exercise.imageUrl === null
      ? exercise.imageUrl
      : undefined,
  };
}

// 卡片摘要只表达 visibleOutputs 里的结构化训练事实，避免把自然语言正文复制进富卡片。
function createExerciseRecommendationGoal(itemCount: number) {
  return itemCount > 0 ? `推荐 ${itemCount} 个训练动作` : "推荐训练动作";
}

function createExerciseRecommendationSummary(
  items: Pick<VisibleTrainingExerciseItem, "exerciseId">[],
  detailMap: Map<string, VisibleExerciseDetail>,
) {
  const muscles = uniqueLimitedStrings(
    items.flatMap((item) => detailMap.get(item.exerciseId)?.primaryMusclesZh ?? []),
    4,
  );
  const equipment = uniqueLimitedStrings(
    items.flatMap((item) => {
      const value = nonEmptyString(detailMap.get(item.exerciseId)?.equipmentZh);
      return value && value !== "未标注器械" ? [value] : [];
    }),
    3,
  );
  const muscleText = muscles.length > 0 ? `，主要覆盖${muscles.join("、")}` : "";
  const equipmentText = equipment.length > 0 ? `，器械需求：${equipment.join("、")}` : "";

  return limitText(`共 ${items.length} 个训练动作${muscleText}${equipmentText}。`, 260);
}

function createRoutineGoal(itemCount: number) {
  return itemCount > 0 ? `完成 ${itemCount} 个动作的本次训练` : "完成本次训练";
}

function createRoutineSummary(
  sections: Pick<WorkoutRoutineDraftSection, "section">[],
  itemCount: number,
  estimatedSessionMinutes: number,
) {
  const sectionText = sections
    .map((section) => sectionSummaryLabels[section.section])
    .reduce((text, label, index, labels) => {
      if (index === 0) {
        return label;
      }
      return index === labels.length - 1 ? `${text}和${label}` : `${text}、${label}`;
    }, "");

  return limitText(`包含${sectionText}，共 ${itemCount} 个动作，预估 ${estimatedSessionMinutes} 分钟。`, 400);
}

function createPlanGoal(trainingDayCount: number) {
  return trainingDayCount > 0 ? `完成 ${trainingDayCount} 个训练日的周期计划` : "完成周期训练计划";
}

function createPlanSummary(
  cycleLengthDays: number,
  trainingDayCount: number,
  restDayCount: number,
  estimatedSessionMinutes: number,
) {
  return limitText(
    `${cycleLengthDays} 天周期，训练 ${trainingDayCount} 天、休息 ${restDayCount} 天，单次训练预估 ${estimatedSessionMinutes} 分钟。`,
    400,
  );
}

function estimateSessionMinutes(items: Array<WorkoutRoutineDraftItem | WorkoutPlanItemDraft>) {
  const totalSeconds = items.reduce((sum, item) => {
    const workSeconds = item.mode === "duration" ? item.target : 30;
    return sum + item.sets * workSeconds + Math.max(0, item.sets - 1) * item.setRestSeconds + item.transitionRestSeconds;
  }, 0);

  return Math.min(240, Math.max(5, Math.ceil(totalSeconds / 60)));
}

function compareExerciseItems(left: Pick<VisibleTrainingExerciseItem, "order">, right: Pick<VisibleTrainingExerciseItem, "order">) {
  return left.order - right.order;
}

function normalizeStringList(value: string[] | undefined, fallback: string[]) {
  const normalized = value?.map((item) => item.trim()).filter(Boolean) ?? [];

  return normalized.length > 0 ? normalized : fallback;
}

function uniqueLimitedStrings(values: string[], maxLength: number) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, maxLength);
}

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function readProposalKind(value: unknown): VisibleTrainingProposalKind | null {
  return value === "exercise_selection" || value === "routine" || value === "plan" ? value : null;
}

function readSection(value: unknown): WorkoutRoutineSection | null {
  return value === "warmup" || value === "training" || value === "stretch" ? value : null;
}

function readInteger(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
