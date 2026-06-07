export type WorkoutMode = "duration" | "reps";
export type WorkoutSection = "warmup" | "training" | "stretch";

// 训练执行层的动作项，独立于数据库 routine item 命名，供时间线和页面播放复用。
export type WorkoutItem = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  categoryZh: string;
  equipmentZh: string;
  musclesZh: string[];
  instructionsZh: string[];
  imageUrl: string;
  imageUrls?: string[];
  mode: WorkoutMode;
  target: number;
  sets: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
  restSeconds?: number;
  section?: WorkoutSection;
};

// WorkoutRoutine 表示用户可复用的一套动作编排。
export type WorkoutRoutine = {
  id: string;
  title: string;
  updatedAt: string;
  /** 聊天卡片保存为 routine 后，服务端用来源消息回写 ConversationArtifact。 */
  sourceChatMessageId?: string;
  sourceArtifactKind?: "routine" | "plan";
  items: WorkoutItem[];
  trainingLoopRounds?: number;
  trainingLoopRestSeconds?: number;
  warmupToTrainingRestSeconds?: number;
  trainingToStretchRestSeconds?: number;
};

export type WorkoutScheduleStatus = "cancelled" | "completed" | "missed" | "planned" | "rest";

// WorkoutSchedule 表示日历上的一次训练安排或休息日。
export type WorkoutSchedule = {
  id: string;
  date: string;
  routineId?: string;
  /** 聊天 plan 卡片导入日历后，服务端用来源消息回写 ConversationArtifact。 */
  sourceChatMessageId?: string;
  sourceArtifactKind?: "plan";
  title: string;
  status: WorkoutScheduleStatus;
  minutes: number;
  calories: number;
  items: WorkoutItem[];
  trainingLoopRounds?: number;
  trainingLoopRestSeconds?: number;
  warmupToTrainingRestSeconds?: number;
  trainingToStretchRestSeconds?: number;
  sourceRoutineTitle?: string;
};

// WorkoutSessionResult 保存一次训练完成后的摘要结果。
export type WorkoutSessionResult = {
  id: string;
  scheduleId: string;
  routineId?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completedStepCount: number;
  totalStepCount: number;
  completedExerciseCount: number;
  totalExerciseCount: number;
  estimatedCalories: number;
  actualCalories?: number;
  status: "completed" | "abandoned";
  // 训练完成反馈为后续推荐递进提供输入，不直接代表长期偏好。
  feedback?: {
    completionRate: number;
    skippedExerciseIds: string[];
    actualDurationSeconds: number;
    subjectiveFatigue?: number;
  };
};

export type WorkoutTimelineExerciseStep = {
  id: string;
  type: "exercise";
  item: WorkoutItem;
  itemIndex: number;
  setIndex: number;
  totalSets: number;
  durationSeconds: number;
};

export type WorkoutTimelineRestStep = {
  id: string;
  type: "rest";
  reason: "between_exercises" | "between_loops" | "between_sections" | "between_sets";
  durationSeconds: number;
  label: string;
  afterItem?: WorkoutItem;
  nextItem?: WorkoutItem;
};

export type WorkoutTimelineStep = WorkoutTimelineExerciseStep | WorkoutTimelineRestStep;

export type WorkoutSectionConfig = {
  id: WorkoutSection;
  title: string;
  subtitle: string;
  icon: string;
};

export const workoutSectionConfigs: WorkoutSectionConfig[] = [
  {
    id: "warmup",
    title: "热身",
    subtitle: "激活关节、提升心率，为主训练做准备",
    icon: "local_fire_department",
  },
  {
    id: "training",
    title: "训练",
    subtitle: "主训练动作，可按循环次数重复执行",
    icon: "fitness_center",
  },
  {
    id: "stretch",
    title: "拉伸",
    subtitle: "降低心率、放松目标肌群",
    icon: "self_improvement",
  },
];

export const restOptions = [15, 20, 30, 45, 60, 90, 120];
export const loopRoundOptions = [1, 2, 3, 4, 5, 6];
export const defaultSetRestSeconds = 30;
export const defaultTransitionRestSeconds = 20;
export const defaultTrainingLoopRounds = 3;
export const defaultTrainingLoopRestSeconds = 120;
export const defaultWarmupToTrainingRestSeconds = 60;
export const defaultTrainingToStretchRestSeconds = 60;
export const defaultRepIntervalSeconds = 2;

// 根据动作名称和分类为编排项补齐训练阶段。
export function inferWorkoutSection(item: Pick<WorkoutItem, "categoryZh" | "nameZh">): WorkoutSection {
  const text = `${item.categoryZh} ${item.nameZh}`;

  if (/拉伸|伸展|放松/.test(text)) {
    return "stretch";
  }

  if (/热身|激活|动态/.test(text)) {
    return "warmup";
  }

  return "training";
}

// 统一训练执行项的默认休息、图片和阶段字段。
export function normalizeWorkoutItem(item: WorkoutItem): WorkoutItem {
  const legacyRestSeconds = item.restSeconds ?? defaultSetRestSeconds;
  const imageUrls = getWorkoutItemImageUrls(item);

  return {
    ...item,
    imageUrl: imageUrls[0] ?? "",
    imageUrls,
    setRestSeconds: item.setRestSeconds ?? legacyRestSeconds,
    transitionRestSeconds: item.transitionRestSeconds ?? item.restSeconds ?? defaultTransitionRestSeconds,
    section: item.section ?? inferWorkoutSection(item),
  };
}

// 兼容旧单图字段和新多图字段，只返回真实可展示图片。
export function getWorkoutItemImageUrls(item: Pick<WorkoutItem, "imageUrl" | "imageUrls">) {
  const imageUrls = [...(item.imageUrls ?? []), item.imageUrl]
    .map((imageUrl) => imageUrl.trim())
    .filter(Boolean);

  return Array.from(new Set(imageUrls));
}

// 统一 routine 的循环配置和动作项，作为保存、排期和执行前的共同入口。
export function normalizeWorkoutRoutine(routine: WorkoutRoutine): WorkoutRoutine {
  return {
    ...routine,
    items: routine.items.map(normalizeWorkoutItem),
    trainingLoopRounds: clampLoopRounds(routine.trainingLoopRounds ?? 1),
    trainingLoopRestSeconds: routine.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds,
    warmupToTrainingRestSeconds: routine.warmupToTrainingRestSeconds ?? defaultWarmupToTrainingRestSeconds,
    trainingToStretchRestSeconds: routine.trainingToStretchRestSeconds ?? defaultTrainingToStretchRestSeconds,
  };
}

// 按阶段读取动作项，供编排页展示和执行时间线构建复用。
export function getSectionItems(items: WorkoutItem[], section: WorkoutSection) {
  return items.filter((item) => (item.section ?? inferWorkoutSection(item)) === section);
}

// 限制训练循环轮数，避免异常输入生成过长时间线。
export function clampLoopRounds(value: number) {
  return Math.min(12, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1));
}

// 读取 routine 的循环配置，保证估算和执行时间线使用同一组默认值。
export function getWorkoutLoopConfig(routine: Pick<WorkoutRoutine, "trainingLoopRestSeconds" | "trainingLoopRounds">) {
  return {
    trainingLoopRounds: clampLoopRounds(routine.trainingLoopRounds ?? 1),
    trainingLoopRestSeconds: routine.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds,
  };
}

// 读取 routine 的完整时间配置，保证阶段间休息、循环和估算共用同一组默认值。
export function getWorkoutTimingConfig(
  routine: Pick<
    WorkoutRoutine,
    | "trainingLoopRestSeconds"
    | "trainingLoopRounds"
    | "trainingToStretchRestSeconds"
    | "warmupToTrainingRestSeconds"
  >,
) {
  return {
    ...getWorkoutLoopConfig(routine),
    warmupToTrainingRestSeconds: routine.warmupToTrainingRestSeconds ?? defaultWarmupToTrainingRestSeconds,
    trainingToStretchRestSeconds: routine.trainingToStretchRestSeconds ?? defaultTrainingToStretchRestSeconds,
  };
}

// 计算单个动作步骤的执行秒数，计次动作按默认节奏估算。
export function getStepDuration(item: WorkoutItem) {
  return Math.max(5, item.mode === "duration" ? item.target : item.target * getRepIntervalSeconds(item));
}

// 计次动作的默认节奏用于估算和自动推进。
export function getRepIntervalSeconds(item: WorkoutItem) {
  return item.mode === "duration" ? 1 : defaultRepIntervalSeconds;
}

// 展开热身、循环训练和拉伸动作，用于统计和热量估算。
export function expandWorkoutItems(
  items: WorkoutItem[],
  trainingLoopRounds = 1,
): WorkoutItem[] {
  const normalizedItems = items.map(normalizeWorkoutItem);
  const warmupItems = getSectionItems(normalizedItems, "warmup");
  const trainingItems = getSectionItems(normalizedItems, "training");
  const stretchItems = getSectionItems(normalizedItems, "stretch");
  const loopedTrainingItems = Array.from({ length: clampLoopRounds(trainingLoopRounds) }, () => trainingItems).flat();

  return [...warmupItems, ...loopedTrainingItems, ...stretchItems];
}

// 将 routine items 转成训练执行页可播放的步骤时间线。
export function buildWorkoutTimeline(
  items: WorkoutItem[],
  options: {
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
    trainingToStretchRestSeconds?: number;
    warmupToTrainingRestSeconds?: number;
  } = {},
): WorkoutTimelineStep[] {
  const normalizedItems = items.map(normalizeWorkoutItem);
  const warmupItems = getSectionItems(normalizedItems, "warmup");
  const trainingItems = getSectionItems(normalizedItems, "training");
  const stretchItems = getSectionItems(normalizedItems, "stretch");
  const rounds = clampLoopRounds(options.trainingLoopRounds ?? 1);
  const loopRestSeconds = options.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds;
  const warmupToTrainingRestSeconds = options.warmupToTrainingRestSeconds ?? defaultWarmupToTrainingRestSeconds;
  const trainingToStretchRestSeconds = options.trainingToStretchRestSeconds ?? defaultTrainingToStretchRestSeconds;
  const sequence = [
    ...warmupItems,
    ...Array.from({ length: rounds }, () => trainingItems).flat(),
    ...stretchItems,
  ];
  const steps: WorkoutTimelineStep[] = [];
  let exerciseIndex = 0;
  let trainingExerciseIndex = 0;

  // Build the executable timeline once so estimates, previews, and training execution stay aligned.
  sequence.forEach((item, index) => {
    const totalSets = Math.max(1, item.sets);
    const section = item.section ?? "training";
    const trainingPosition = section === "training" ? trainingExerciseIndex : -1;

    Array.from({ length: totalSets }, (_, setIndex) => {
      steps.push({
        id: `${item.id}-${index}-set-${setIndex + 1}`,
        type: "exercise",
        item,
        itemIndex: exerciseIndex,
        setIndex: setIndex + 1,
        totalSets,
        durationSeconds: getStepDuration(item),
      });

      if (setIndex < totalSets - 1 && item.setRestSeconds > 0) {
        steps.push({
          id: `${item.id}-${index}-set-rest-${setIndex + 1}`,
          type: "rest",
          reason: "between_sets",
          durationSeconds: item.setRestSeconds,
          label: "组间休息",
          afterItem: item,
          nextItem: item,
        });
      }
    });

    const nextItem = sequence[index + 1];

    if (nextItem) {
      const nextSection = nextItem.section ?? "training";
      const isLoopBoundary =
        section === "training" &&
        nextSection === "training" &&
        trainingItems.length > 0 &&
        (trainingPosition + 1) % trainingItems.length === 0;
      const isWarmupToTrainingBoundary = section === "warmup" && nextSection === "training";
      const isTrainingToStretchBoundary = section === "training" && nextSection === "stretch";
      const isSectionBoundary = isWarmupToTrainingBoundary || isTrainingToStretchBoundary;
      const restSeconds = isLoopBoundary
        ? loopRestSeconds
        : isWarmupToTrainingBoundary
          ? warmupToTrainingRestSeconds
          : isTrainingToStretchBoundary
            ? trainingToStretchRestSeconds
            : item.transitionRestSeconds;

      if (restSeconds > 0) {
        steps.push({
          id: `${item.id}-${index}-${
            isLoopBoundary ? "loop-rest" : isSectionBoundary ? "section-rest" : "transition-rest"
          }`,
          type: "rest",
          reason: isLoopBoundary ? "between_loops" : isSectionBoundary ? "between_sections" : "between_exercises",
          durationSeconds: restSeconds,
          label: isLoopBoundary ? "循环间隙" : isSectionBoundary ? "阶段间休息" : "动作间休息",
          afterItem: item,
          nextItem,
        });
      }
    }

    if (section === "training") {
      trainingExerciseIndex += 1;
    }
    exerciseIndex += 1;
  });

  return steps;
}

// 基于执行时间线估算整套 routine 的训练秒数。
export function estimateWorkoutSeconds(
  items: WorkoutItem[],
  options: {
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
    trainingToStretchRestSeconds?: number;
    warmupToTrainingRestSeconds?: number;
  } = {},
) {
  return buildWorkoutTimeline(items, options).reduce((total, step) => total + step.durationSeconds, 0);
}

// 基于执行时间线估算整套 routine 的训练分钟数。
export function estimateWorkoutMinutes(
  items: WorkoutItem[],
  options: {
    minimumMinutes?: number;
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
    trainingToStretchRestSeconds?: number;
    warmupToTrainingRestSeconds?: number;
  } = {},
) {
  const minimumMinutes = options.minimumMinutes ?? 1;
  return Math.max(minimumMinutes, Math.round(estimateWorkoutSeconds(items, options) / 60));
}

// 使用训练时长和动作数量估算整套 routine 的热量消耗。
export function estimateWorkoutCalories(
  items: WorkoutItem[],
  options: {
    minimumCalories?: number;
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
    trainingToStretchRestSeconds?: number;
    warmupToTrainingRestSeconds?: number;
  } = {},
) {
  const expandedItems = expandWorkoutItems(items, options.trainingLoopRounds ?? 1);
  const minimumCalories = options.minimumCalories ?? 0;

  return Math.max(
    minimumCalories,
    Math.round(estimateWorkoutMinutes(items, options) * 7.2 + expandedItems.length * 12),
  );
}

// 统计展开循环后的总组数，供摘要和测试校验使用。
export function getTotalWorkoutSets(items: WorkoutItem[], trainingLoopRounds = 1) {
  return expandWorkoutItems(items, trainingLoopRounds).reduce((total, item) => total + Math.max(1, item.sets), 0);
}
