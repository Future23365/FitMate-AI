import type { WorkoutItem, WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

export type WorkoutVoiceCueType =
  | "activation"
  | "step-intro"
  | "preparation-intro"
  | "preparation-countdown"
  | "rep-count";

export type WorkoutVoiceOverflowPolicy = "drop-low-priority" | "drop-newest";

export type WorkoutVoiceCuePolicy = {
  enqueue: boolean;
  interruptCurrent: boolean;
  priority: number;
  staleAfterMs: number;
};

export type WorkoutVoiceTemplateContext = {
  isFirstExercise?: boolean;
  item?: WorkoutItem;
  overviewLimit?: number;
  second?: number;
  step?: WorkoutTimelineStep;
  totalItems?: number;
};

// 训练语音播报的统一配置源；页面设置、自检和运行时播报都应先合成这个结构再执行。
export type WorkoutVoiceBroadcastConfig = {
  // Web Audio 短促节奏音配置，只影响计时动作中的 beep，不影响 Web Speech 口播音量。
  beep: {
    durationMs: number;
    frequencyHz: number;
    intervalMs: number;
    unlockDurationMs: number;
    volume: number;
  };
  // 浏览器语音事件不稳定时的兜底时长，决定等待 voice、onstart、onend 和静音推进的边界。
  fallback: {
    silentPreparationDelayMs: number;
    speechCompletionFallbackMaxMs: number;
    speechCompletionFallbackMinMs: number;
    speechCompletionFallbackMsPerChar: number;
    speechStartTimeoutMs: number;
    speechVoiceLoadTimeoutMs: number;
    speechUnavailablePreparationDelayMs: number;
  };
  // 播报任务队列控制，避免倒计时、计次和动作提示在浏览器队列中无限堆积。
  queue: {
    maxSize: number;
    overflowPolicy: WorkoutVoiceOverflowPolicy;
  };
  // Web Speech API 参数；voiceURI 为空时会自动优先匹配中文 voice，再回退浏览器默认 voice。
  speech: {
    lang: string;
    pitch: number;
    rate: number;
    voiceURI: string;
    volume: number;
  };
  // 训练流程触发节奏，控制准备倒计时口播间隔和计次口播的最短间隔。
  timing: {
    preparationCountdownIntervalMs: number;
    repetitionCueMinIntervalMs: number;
  };
  // 不同类型口播的优先级和插队策略，保证动作准备提示优先于低价值计次提示。
  cuePolicies: Record<WorkoutVoiceCueType, WorkoutVoiceCuePolicy>;
  // 口播文案模板；需要调整播报内容时改这里，不要从 UI 文案反推语音内容。
  templates: {
    activation: string;
    emptyOverview: string;
    firstActionFallback: string;
    nonExercisePreparation: string;
    overview: (items: WorkoutItem[], context: WorkoutVoiceTemplateContext) => string;
    preparationCountdown: (context: WorkoutVoiceTemplateContext) => string;
    preparationTarget: (item: WorkoutItem) => string;
    repetitionCount: (count: number) => string;
    stepPreparation: (step: WorkoutTimelineStep, context: WorkoutVoiceTemplateContext) => string;
    stepVoice: (step: WorkoutTimelineStep) => string;
  };
};

const defaultOverviewLimit = 5;

// 默认配置是训练语音的产品基线，用户设置只覆盖 voiceURI、语速、音调、口播音量和 beep 音量。
export const workoutVoiceBroadcastConfig = validateWorkoutVoiceBroadcastConfig({
  beep: {
    durationMs: 140,
    frequencyHz: 880,
    intervalMs: 1000,
    unlockDurationMs: 20,
    volume: 0.18,
  },
  fallback: {
    silentPreparationDelayMs: 0,
    speechCompletionFallbackMaxMs: 8000,
    speechCompletionFallbackMinMs: 1600,
    speechCompletionFallbackMsPerChar: 220,
    speechStartTimeoutMs: 3500,
    speechVoiceLoadTimeoutMs: 800,
    speechUnavailablePreparationDelayMs: 1200,
  },
  queue: {
    maxSize: 4,
    overflowPolicy: "drop-low-priority",
  },
  speech: {
    lang: "zh-CN",
    pitch: 1,
    rate: 1,
    voiceURI: "",
    volume: 1,
  },
  timing: {
    preparationCountdownIntervalMs: 1000,
    repetitionCueMinIntervalMs: 1800,
  },
  cuePolicies: {
    activation: {
      enqueue: false,
      interruptCurrent: true,
      priority: 100,
      staleAfterMs: 10000,
    },
    "step-intro": {
      enqueue: true,
      interruptCurrent: true,
      priority: 80,
      staleAfterMs: 10000,
    },
    "preparation-intro": {
      enqueue: true,
      interruptCurrent: true,
      priority: 90,
      staleAfterMs: 10000,
    },
    "preparation-countdown": {
      enqueue: true,
      interruptCurrent: false,
      priority: 70,
      staleAfterMs: 4000,
    },
    "rep-count": {
      enqueue: false,
      interruptCurrent: false,
      priority: 20,
      staleAfterMs: 1600,
    },
  },
  templates: {
    activation: "语音播报已开启。",
    emptyOverview: "准备开始训练。",
    firstActionFallback: "准备开始第一组动作。",
    nonExercisePreparation: "准备进入下一步。",
    overview: (items, context) => {
      if (items.length === 0) {
        return "准备开始训练。";
      }

      const limit = context.overviewLimit ?? defaultOverviewLimit;
      const names = items.map((item) => item.nameZh).filter(Boolean);
      const visibleNames = names.slice(0, Math.max(1, limit));
      const suffix = names.length > visibleNames.length ? "等" : "";

      return `本次训练 ${items.length} 个动作：${visibleNames.join("、")}${suffix}。准备开始。`;
    },
    preparationCountdown: (context) => {
      const second = Math.max(1, Math.min(3, Math.floor(context.second ?? 1)));

      return second === 1 ? "1，开始" : String(second);
    },
    preparationTarget: formatDefaultPreparationTarget,
    repetitionCount: (count) => String(Math.max(1, Math.floor(count))),
    stepPreparation: (step, context) => {
      if (step.type !== "exercise") {
        return "准备进入下一步。";
      }

      const prefix = context.isFirstExercise ? "第一组动作" : "下一组";

      return `${prefix}，${step.item.nameZh}，${formatDefaultPreparationTarget(step.item)}。`;
    },
    stepVoice: (step) => {
      if (step.type === "rest") {
        const nextActionText = step.nextItem ? `，下一组动作 ${step.nextItem.nameZh}` : "";

        return `${step.label} ${step.durationSeconds} 秒${nextActionText}。`;
      }

      const targetText = step.item.mode === "duration" ? `${step.item.target} 秒` : `${step.item.target} 次`;

      return `开始 ${step.item.nameZh}，第 ${step.setIndex} 组，共 ${step.totalSets} 组，目标 ${targetText}。`;
    },
  },
});

export function validateWorkoutVoiceBroadcastConfig(config: WorkoutVoiceBroadcastConfig) {
  assertPositive(config.beep.durationMs, "beep.durationMs");
  assertPositive(config.beep.frequencyHz, "beep.frequencyHz");
  assertPositive(config.beep.intervalMs, "beep.intervalMs");
  assertPositive(config.beep.unlockDurationMs, "beep.unlockDurationMs");
  assertRange(config.beep.volume, "beep.volume", 0, 1);
  assertPositive(config.fallback.silentPreparationDelayMs, "fallback.silentPreparationDelayMs", true);
  assertPositive(config.fallback.speechCompletionFallbackMaxMs, "fallback.speechCompletionFallbackMaxMs");
  assertPositive(config.fallback.speechCompletionFallbackMinMs, "fallback.speechCompletionFallbackMinMs");
  assertPositive(config.fallback.speechCompletionFallbackMsPerChar, "fallback.speechCompletionFallbackMsPerChar");
  assertPositive(config.fallback.speechStartTimeoutMs, "fallback.speechStartTimeoutMs");
  assertPositive(config.fallback.speechVoiceLoadTimeoutMs, "fallback.speechVoiceLoadTimeoutMs");
  assertPositive(config.fallback.speechUnavailablePreparationDelayMs, "fallback.speechUnavailablePreparationDelayMs");
  assertPositive(config.queue.maxSize, "queue.maxSize");
  assertRange(config.speech.pitch, "speech.pitch", 0.1, 2);
  assertRange(config.speech.rate, "speech.rate", 0.1, 2);
  assertRange(config.speech.volume, "speech.volume", 0, 1);
  assertPositive(config.timing.preparationCountdownIntervalMs, "timing.preparationCountdownIntervalMs");
  assertPositive(config.timing.repetitionCueMinIntervalMs, "timing.repetitionCueMinIntervalMs");

  if (config.fallback.speechCompletionFallbackMaxMs < config.fallback.speechCompletionFallbackMinMs) {
    throw new Error("Invalid workout voice config: fallback max must be greater than min.");
  }

  Object.entries(config.cuePolicies).forEach(([cueType, policy]) => {
    assertPositive(policy.priority, `cuePolicies.${cueType}.priority`, true);
    assertPositive(policy.staleAfterMs, `cuePolicies.${cueType}.staleAfterMs`);
  });

  return config;
}

export type WorkoutVoiceBroadcastUserSettings = {
  // 计时训练里的 Web Audio beep 音量，范围 0-1。
  beepVolume: number;
  // SpeechSynthesisUtterance.pitch，当前 UI 限制在 0.5-1.5，避免过尖或过低。
  pitch: number;
  // SpeechSynthesisUtterance.rate，当前 UI 限制在 0.65-1.35，避免口令过快或过慢。
  rate: number;
  // 用户选择的浏览器 voiceURI；为空表示自动选择中文 voice 或默认 voice。
  voiceURI: string;
  // SpeechSynthesisUtterance.volume，只影响语音口播，范围 0-1。
  volume: number;
};

// 语音设置弹窗的重置值必须来自默认运行时配置，避免 UI 默认值和实际播报基线分叉。
export const defaultWorkoutVoiceBroadcastUserSettings: WorkoutVoiceBroadcastUserSettings = {
  beepVolume: workoutVoiceBroadcastConfig.beep.volume,
  pitch: workoutVoiceBroadcastConfig.speech.pitch,
  rate: workoutVoiceBroadcastConfig.speech.rate,
  voiceURI: workoutVoiceBroadcastConfig.speech.voiceURI,
  volume: workoutVoiceBroadcastConfig.speech.volume,
};

// 将用户本地设置收敛到安全范围，避免异常 localStorage 数据影响训练播报。
export function normalizeWorkoutVoiceBroadcastUserSettings(
  input: Partial<WorkoutVoiceBroadcastUserSettings> = {},
): WorkoutVoiceBroadcastUserSettings {
  return {
    beepVolume: clampNumber(input.beepVolume, 0, 1, defaultWorkoutVoiceBroadcastUserSettings.beepVolume),
    pitch: clampNumber(input.pitch, 0.5, 1.5, defaultWorkoutVoiceBroadcastUserSettings.pitch),
    rate: clampNumber(input.rate, 0.65, 1.35, defaultWorkoutVoiceBroadcastUserSettings.rate),
    voiceURI: typeof input.voiceURI === "string" ? input.voiceURI : defaultWorkoutVoiceBroadcastUserSettings.voiceURI,
    volume: clampNumber(input.volume, 0, 1, defaultWorkoutVoiceBroadcastUserSettings.volume),
  };
}

// 基于默认播报策略生成运行时配置，训练播报和自检共用这条入口。
export function buildWorkoutVoiceBroadcastConfig(
  userSettings: Partial<WorkoutVoiceBroadcastUserSettings> = {},
) {
  const settings = normalizeWorkoutVoiceBroadcastUserSettings(userSettings);

  return validateWorkoutVoiceBroadcastConfig({
    ...workoutVoiceBroadcastConfig,
    beep: {
      ...workoutVoiceBroadcastConfig.beep,
      volume: settings.beepVolume,
    },
    speech: {
      ...workoutVoiceBroadcastConfig.speech,
      pitch: settings.pitch,
      rate: settings.rate,
      voiceURI: settings.voiceURI,
      volume: settings.volume,
    },
  });
}

function formatDefaultPreparationTarget(item: WorkoutItem) {
  return item.mode === "duration" ? `${item.target} 秒` : `${item.target} 个`;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function assertPositive(value: number, field: string, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`Invalid workout voice config: ${field} must be ${allowZero ? "zero or positive" : "positive"}.`);
  }
}

function assertRange(value: number, field: string, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid workout voice config: ${field} must be between ${min} and ${max}.`);
  }
}
