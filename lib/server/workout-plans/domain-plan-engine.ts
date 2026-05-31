import "server-only";

import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
import type { ConversationArtifactPayload } from "@/lib/shared/conversation-artifacts/schema";
import type { ResolvedFieldSources } from "@/lib/shared/chat/resolved-intent";
import { shouldUseConservativeProgression } from "@/lib/server/user-feedback-memory/user-feedback-memory-service";
import type { ConversationMemoryState } from "@/lib/shared/user-feedback-memory/schema";
import {
  planStrategySchema,
  type PlanIntensityBias,
  type PlanProgressionPolicy,
  type PlanStrategy,
  type PlanStrategyType,
} from "@/lib/shared/workout-plans/plan-strategy-schema";
import type {
  WorkoutDayDraft,
  WorkoutPlanDaySectionDraft,
  WorkoutPlanDraft,
  WorkoutPlanIntent,
  WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";

type SourceTrainingTemplate = {
  title: string;
  focus: string;
  estimatedMinutes: number;
  sections: WorkoutPlanDaySectionDraft[];
};

export type DomainPlanEngineInput = {
  strategy: PlanStrategy;
  memoryState?: ConversationMemoryState;
  sourceArtifact?: {
    artifactId: string;
    kind: "routine" | "plan";
    payload: ConversationArtifactPayload;
  };
};

export type DomainPlanEngineResult =
  | {
      ok: true;
      strategy: PlanStrategy;
      draft: WorkoutPlanDraft;
      sourceExerciseIds: string[];
    }
  | {
      ok: false;
      code: "missing_source_artifact" | "unsupported_source_artifact" | "empty_source_training_days" | "strategy_draft_conflict";
      message: string;
      strategy: PlanStrategy;
    };

// 从聊天意图和引用解析结果生成 PlanStrategy，确保后续长期计划只由领域引擎展开。
export function buildPlanStrategyFromChatIntent(input: {
  intent: WorkoutPlanIntent;
  latestUserMessage: string;
  referenceResolution?: Extract<ReferenceResolution, { status: "resolved" }>;
  fieldSources?: ResolvedFieldSources;
}): PlanStrategy {
  const intensityBias = inferIntensityBias(input.latestUserMessage);
  const strategy = inferStrategy(input.latestUserMessage, input.referenceResolution?.artifactKind);
  const progressionPolicy = inferProgressionPolicy(input.latestUserMessage, strategy, intensityBias);

  return planStrategySchema.parse({
    goal: input.intent.goal,
    horizonDays: resolveStrategyHorizonDays(input),
    weeklyFrequency: resolveStrategyWeeklyFrequency(input),
    sessionMinutes: input.intent.sessionMinutes,
    strategy,
    sourceArtifactId: input.referenceResolution?.artifactId,
    progressionPolicy,
    intensityBias,
    constraints: inferConstraints(input.latestUserMessage),
    fieldSources: {
      ...input.fieldSources,
      calendarHorizonDays: input.fieldSources?.calendarHorizonDays ?? (input.intent.calendarHorizonDays ? "llm_inferred" : "default"),
      weeklyFrequency: input.fieldSources?.weeklyFrequency ?? "llm_inferred",
      sessionMinutes: input.fieldSources?.sessionMinutes ?? "llm_inferred",
      sourceArtifactId: input.referenceResolution?.artifactId ? "artifact" : input.fieldSources?.sourceArtifactId,
    },
    defaultAssumptions: buildDefaultAssumptions(input),
  });
}

// DomainPlanEngine 将 PlanStrategy 和 artifact payload 展开成可解释 plan draft，不写入真实日历。
export function expandDomainPlan(input: DomainPlanEngineInput): DomainPlanEngineResult {
  const parsedStrategy = planStrategySchema.parse(input.strategy);
  const strategy = shouldUseConservativeProgression(input.memoryState)
    ? planStrategySchema.parse({
        ...parsedStrategy,
        intensityBias: "conservative",
        progressionPolicy: "none",
        constraints: [
          ...parsedStrategy.constraints,
          "最近训练完成率或疲劳反馈提示需要保守递进",
        ],
      })
    : parsedStrategy;

  if (strategy.sourceArtifactId && !input.sourceArtifact) {
    return {
      ok: false,
      code: "missing_source_artifact",
      message: "PlanStrategy 引用了 sourceArtifactId，但没有提供可校验的 artifact payload。",
      strategy,
    };
  }

  const sourceTemplates = input.sourceArtifact ? getSourceTrainingTemplates(input.sourceArtifact.payload) : [];
  if (strategy.sourceArtifactId && sourceTemplates.length === 0) {
    return {
      ok: false,
      code: "empty_source_training_days",
      message: "引用 artifact 中没有可展开的训练日。",
      strategy,
    };
  }

  if (sourceTemplates.length === 0) {
    return {
      ok: false,
      code: "missing_source_artifact",
      message: "第一版 DomainPlanEngine 需要 routine 或 plan artifact 作为长期计划来源。",
      strategy,
    };
  }

  const trainingDayIndexes = buildTrainingDayIndexes(strategy.horizonDays, strategy.weeklyFrequency);
  const trainingDaySet = new Set(trainingDayIndexes);
  const days: WorkoutDayDraft[] = [];
  let trainingOrdinal = 0;

  for (let dayIndex = 1; dayIndex <= strategy.horizonDays; dayIndex += 1) {
    if (!trainingDaySet.has(dayIndex)) {
      days.push(createRestDay(dayIndex));
      continue;
    }

    const weekIndex = Math.ceil(dayIndex / 7);
    const template = pickTemplate(sourceTemplates, strategy.strategy, trainingOrdinal);
    days.push(createTrainingDay({
      dayIndex,
      weekIndex,
      trainingOrdinal,
      template,
      strategy,
      memoryState: input.memoryState,
    }));
    trainingOrdinal += 1;
  }

  const draft: WorkoutPlanDraft = {
    kind: "plan",
    title: buildPlanTitle(strategy),
    goal: strategy.goal,
    summary: buildPlanSummary(strategy, trainingDayIndexes.length),
    cycleLengthDays: strategy.horizonDays,
    trainingDayCount: trainingDayIndexes.length,
    restDayCount: strategy.horizonDays - trainingDayIndexes.length,
    cycleRepeatable: false,
    weeklyFrequency: strategy.weeklyFrequency,
    calendarHorizonDays: strategy.horizonDays,
    estimatedSessionMinutes: strategy.sessionMinutes,
    progression: describeProgression(strategy.progressionPolicy, strategy.intensityBias),
    recoveryStrategy: describeRecovery(strategy),
    schedulePattern: days.map((day) => ({
      cycleDayIndex: day.cycleDayIndex,
      title: day.title,
      dayType: day.dayType,
      focus: day.focus,
      isRestDay: day.isRestDay,
    })),
    planStrategy: strategy,
    schedulePreview: days.map((day) => ({
      dayIndex: day.cycleDayIndex,
      weekIndex: Math.ceil(day.cycleDayIndex / 7),
      weekdayIndex: ((day.cycleDayIndex - 1) % 7) + 1,
      isTrainingDay: !day.isRestDay,
      title: day.title,
      focus: day.focus,
      sourceArtifactId: strategy.sourceArtifactId,
      intensity: strategy.intensityBias,
      recoveryNotes: day.recoveryNotes,
    })),
    days,
    safetyNotes: [
      "计划为预览草稿，导入日历前仍需确认。",
      ...(shouldUseConservativeProgression(input.memoryState)
        ? ["已根据近期训练完成率或疲劳反馈保守处理递进。"]
        : []),
    ],
  };

  const consistency = validatePlanDraftAgainstStrategy(draft, strategy);
  if (!consistency.valid) {
    return {
      ok: false,
      code: "strategy_draft_conflict",
      message: `DomainPlanEngine 输出与 PlanStrategy 冲突：${consistency.issues.join("；")}`,
      strategy,
    };
  }

  return {
    ok: true,
    strategy,
    draft,
    sourceExerciseIds: getDraftExerciseIds(draft),
  };
}

function resolveStrategyHorizonDays(input: {
  intent: WorkoutPlanIntent;
  latestUserMessage: string;
  fieldSources?: ResolvedFieldSources;
}) {
  if (input.intent.calendarHorizonDays && input.fieldSources?.calendarHorizonDays !== "default") {
    return input.intent.calendarHorizonDays;
  }

  return inferHorizonDays(input.latestUserMessage, input.intent.calendarHorizonDays);
}

function resolveStrategyWeeklyFrequency(input: {
  intent: WorkoutPlanIntent;
  latestUserMessage: string;
  fieldSources?: ResolvedFieldSources;
}) {
  if (input.fieldSources?.weeklyFrequency && input.fieldSources.weeklyFrequency !== "default") {
    return input.intent.weeklyFrequency;
  }

  return inferWeeklyFrequency(input.latestUserMessage, input.intent.weeklyFrequency);
}

function buildDefaultAssumptions(input: {
  intent: WorkoutPlanIntent;
  fieldSources?: ResolvedFieldSources;
}) {
  const assumptions: string[] = [];

  if (!input.intent.calendarHorizonDays || input.fieldSources?.calendarHorizonDays === "default") {
    assumptions.push("未明确计划周期时，默认按 21 天预览生成。");
  }

  if (input.fieldSources?.weeklyFrequency === "default") {
    assumptions.push(`未明确周频率时，默认按每周 ${input.intent.weeklyFrequency} 练生成。`);
  }

  if (input.fieldSources?.sessionMinutes === "default") {
    assumptions.push(`未明确单次时长时，默认按 ${input.intent.sessionMinutes} 分钟生成。`);
  }

  return assumptions;
}

// 输出契约校验保证 DomainPlanEngine 不把与 PlanStrategy 冲突的草稿当作成功结果。
export function validatePlanDraftAgainstStrategy(draft: WorkoutPlanDraft, strategy: PlanStrategy) {
  const issues: string[] = [];

  if (draft.cycleLengthDays !== strategy.horizonDays) {
    issues.push(`cycleLengthDays=${draft.cycleLengthDays} 与 horizonDays=${strategy.horizonDays} 不一致`);
  }

  if (draft.calendarHorizonDays && draft.calendarHorizonDays !== strategy.horizonDays) {
    issues.push(`calendarHorizonDays=${draft.calendarHorizonDays} 与 horizonDays=${strategy.horizonDays} 不一致`);
  }

  if (draft.weeklyFrequency && draft.weeklyFrequency !== strategy.weeklyFrequency) {
    issues.push(`weeklyFrequency=${draft.weeklyFrequency} 与 strategy.weeklyFrequency=${strategy.weeklyFrequency} 不一致`);
  }

  const wrongSource = draft.schedulePreview?.find(
    (entry) => strategy.sourceArtifactId && entry.sourceArtifactId !== strategy.sourceArtifactId,
  );
  if (wrongSource) {
    issues.push(`schedulePreview 引用 ${wrongSource.sourceArtifactId ?? "empty"}，预期 ${strategy.sourceArtifactId}`);
  }

  return { valid: issues.length === 0, issues };
}

export function getDraftExerciseIds(draft: WorkoutPlanDraft) {
  return unique(
    draft.days.flatMap((day) =>
      day.sections.flatMap((section) => section.items.map((item) => item.exerciseId)),
    ),
  );
}

function getSourceTrainingTemplates(payload: ConversationArtifactPayload): SourceTrainingTemplate[] {
  if ("sections" in payload) {
    const routine = payload as WorkoutRoutineDraft;

    return [{
      title: routine.title,
      focus: routine.goal,
      estimatedMinutes: routine.estimatedSessionMinutes,
      sections: routine.sections,
    }];
  }

  if ("days" in payload) {
    return payload.days
      .filter((day) => !day.isRestDay && day.sections.length > 0)
      .map((day) => ({
        title: day.title,
        focus: day.focus,
        estimatedMinutes: day.estimatedMinutes,
        sections: day.sections,
      }));
  }

  return [];
}

function createTrainingDay(input: {
  dayIndex: number;
  weekIndex: number;
  trainingOrdinal: number;
  template: SourceTrainingTemplate;
  strategy: PlanStrategy;
  memoryState?: ConversationMemoryState;
}): WorkoutDayDraft {
  const sections = applyProgressionAndIntensity(
    input.template.sections,
    input.weekIndex,
    input.strategy.progressionPolicy,
    input.strategy.intensityBias,
  );

  return {
    title: `第 ${input.dayIndex} 天 ${input.template.title}`,
    focus: input.template.focus,
    cycleDayIndex: input.dayIndex,
    dayType: input.strategy.intensityBias === "conservative" ? "mixed" : "strength",
    isRestDay: false,
    estimatedMinutes: Math.min(input.strategy.sessionMinutes, input.template.estimatedMinutes),
    recoveryNotes: buildTrainingRecoveryNotes(input.strategy),
    sections,
    safetyNotes: [
      ...(input.strategy.intensityBias === "conservative"
        ? ["本日按保守强度展开，优先保证恢复。"]
        : ["保持动作质量，疲劳明显时降低训练量。"]),
      ...(shouldUseConservativeProgression(input.memoryState)
        ? ["近期训练反馈显示可能需要降负荷，本日不主动增加训练量。"]
        : []),
    ],
  };
}

function createRestDay(dayIndex: number): WorkoutDayDraft {
  return {
    title: `第 ${dayIndex} 天 恢复日`,
    focus: "恢复与活动度",
    cycleDayIndex: dayIndex,
    dayType: "rest",
    isRestDay: true,
    estimatedMinutes: 0,
    recoveryNotes: ["安排低强度活动、拉伸或完整休息。"],
    sections: [],
    safetyNotes: [],
  };
}

function applyProgressionAndIntensity(
  sections: WorkoutPlanDaySectionDraft[],
  weekIndex: number,
  progressionPolicy: PlanProgressionPolicy,
  intensityBias: PlanIntensityBias,
): WorkoutPlanDaySectionDraft[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (section.section !== "training") {
        return { ...item };
      }

      const conservativeSets = intensityBias === "conservative" ? Math.min(item.sets, 2) : item.sets;
      const setRestSeconds = intensityBias === "conservative"
        ? Math.max(item.setRestSeconds, 45)
        : item.setRestSeconds;

      if (progressionPolicy === "volume_small_increase" && intensityBias !== "conservative") {
        return {
          ...item,
          sets: weekIndex >= 3 && intensityBias === "challenging"
            ? Math.min(conservativeSets + 1, 6)
            : conservativeSets,
          target: item.mode === "reps" ? Math.min(item.target + weekIndex - 1, item.target + 4) : item.target,
          setRestSeconds,
          notes: appendNote(item.notes, `第 ${weekIndex} 周小幅递进。`),
        };
      }

      return {
        ...item,
        sets: conservativeSets,
        setRestSeconds,
        notes: intensityBias === "conservative" ? appendNote(item.notes, "保守强度，避免累积疲劳。") : item.notes,
      };
    }),
  }));
}

function buildTrainingDayIndexes(horizonDays: number, weeklyFrequency: number) {
  const pattern = getWeeklyPattern(weeklyFrequency);
  const indexes: number[] = [];

  for (let weekStart = 1; weekStart <= horizonDays; weekStart += 7) {
    const daysInWeek = Math.min(7, horizonDays - weekStart + 1);

    for (const weekday of pattern) {
      if (weekday <= daysInWeek) {
        indexes.push(weekStart + weekday - 1);
      }
    }
  }

  return indexes;
}

function getWeeklyPattern(weeklyFrequency: number) {
  const patterns: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 3, 5, 7],
    5: [1, 2, 4, 5, 7],
    6: [1, 2, 3, 4, 5, 6],
    7: [1, 2, 3, 4, 5, 6, 7],
  };

  return patterns[weeklyFrequency] ?? patterns[3];
}

function pickTemplate(
  templates: SourceTrainingTemplate[],
  strategy: PlanStrategyType,
  trainingOrdinal: number,
) {
  if (strategy === "alternating_ab") {
    return templates[trainingOrdinal % Math.min(templates.length, 2)];
  }

  if (strategy === "weekly_split" || strategy === "custom") {
    return templates[trainingOrdinal % templates.length];
  }

  return templates[0];
}

function inferHorizonDays(message: string, fallback?: number) {
  const normalized = message.replace(/\s+/g, "");
  const weekMatch = normalized.match(/([一二两三四五六七八九十\d]+)(?:周|星期|礼拜)/);
  const dayMatch = normalized.match(/([一二两三四五六七八九十\d]+)天/);
  const containsWeeklyFrequency = /(?:一周|每周)[一二两三四五六七\d]+(?:练|次|天)/.test(normalized);

  if (weekMatch && !containsWeeklyFrequency) {
    return parseChineseNumber(weekMatch[1]) * 7;
  }

  if (/一个月|1个月/.test(normalized)) {
    return 28;
  }

  if (dayMatch) {
    return parseChineseNumber(dayMatch[1]);
  }

  return fallback ?? 21;
}

function inferWeeklyFrequency(message: string, fallback: number) {
  const normalized = message.replace(/\s+/g, "");
  const match = normalized.match(/(?:一周|每周)([一二两三四五六七\d]+)(?:练|次|天)/);

  return match ? parseChineseNumber(match[1]) : fallback;
}

function inferStrategy(message: string, artifactKind?: string): PlanStrategyType {
  const normalized = message.toLowerCase();

  if (/ab|a\/b|交替/.test(normalized)) {
    return "alternating_ab";
  }

  if (/分化|拆分|周计划/.test(normalized) || (artifactKind === "plan" && /一周|每周|周频率/.test(normalized))) {
    return "weekly_split";
  }

  if (artifactKind === "routine" && /递进|进阶|三周|四周|几周|都练|继续练|重复/.test(normalized)) {
    return "repeat_same_routine_with_progression";
  }

  if (artifactKind === "routine") {
    return "repeat_previous_routine";
  }

  return "custom";
}

function inferProgressionPolicy(
  message: string,
  strategy: PlanStrategyType,
  intensityBias: PlanIntensityBias,
): PlanProgressionPolicy {
  if (/不递进|不加量|保持/.test(message) || intensityBias === "conservative") {
    return "none";
  }

  if (/难度|进阶/.test(message)) {
    return "difficulty_small_increase";
  }

  if (strategy === "repeat_same_routine_with_progression") {
    return "volume_small_increase";
  }

  return "none";
}

function inferIntensityBias(message: string): PlanIntensityBias {
  if (/别太累|保守|轻松|低强度|恢复/.test(message)) {
    return "conservative";
  }

  if (/挑战|高强度|冲刺|强化/.test(message)) {
    return "challenging";
  }

  return "normal";
}

function inferConstraints(message: string) {
  const constraints: string[] = [];

  if (/别太累|保守|轻松|低强度/.test(message)) {
    constraints.push("控制疲劳，避免连续高负荷。");
  }

  if (/一周|每周/.test(message)) {
    constraints.push("按用户指定周频率展开。");
  }

  if (/三周|四周|一个月|\d+天/.test(message)) {
    constraints.push("按用户指定周期生成预览。");
  }

  return constraints;
}

function buildPlanTitle(strategy: PlanStrategy) {
  const weeks = strategy.horizonDays % 7 === 0 ? `${strategy.horizonDays / 7} 周` : `${strategy.horizonDays} 天`;

  return `${weeks}${strategy.goal}计划`;
}

function buildPlanSummary(strategy: PlanStrategy, trainingDayCount: number) {
  return `按 ${strategy.horizonDays} 天、每周 ${strategy.weeklyFrequency} 练展开，共 ${trainingDayCount} 个训练日；强度倾向为 ${strategy.intensityBias}。`;
}

function describeProgression(policy: PlanProgressionPolicy, intensityBias: PlanIntensityBias) {
  if (policy === "volume_small_increase") {
    return "后续周在可恢复范围内小幅增加次数或训练量。";
  }

  if (policy === "difficulty_small_increase") {
    return "后续周仅在动作质量稳定时小幅提升难度。";
  }

  return intensityBias === "conservative"
    ? "保持原动作结构，优先控制疲劳。"
    : "保持稳定训练量，不主动增加负荷。";
}

function describeRecovery(strategy: PlanStrategy) {
  return strategy.intensityBias === "conservative"
    ? "训练日之间优先安排恢复日；如出现连续训练，自动降低单日容量。"
    : "按周频率均匀分布训练日，非训练日用于恢复。";
}

function buildTrainingRecoveryNotes(strategy: PlanStrategy) {
  return strategy.intensityBias === "conservative"
    ? ["控制主训练组数，避免连续高疲劳。"]
    : ["训练后安排恢复，下一训练日前观察疲劳状态。"];
}

function appendNote(current: string | undefined, addition: string) {
  return current ? `${current} ${addition}` : addition;
}

function parseChineseNumber(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };

  if (value === "十") {
    return 10;
  }

  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (left ? map[left] : 1) * 10 + (right ? map[right] : 0);
  }

  return map[value] ?? 1;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
