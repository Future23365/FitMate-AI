import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

export type WorkoutExecutionActiveStatus =
  | "idle"
  | "preparing_intro"
  | "preparing_countdown"
  | "running_exercise"
  | "running_rest"
  | "completed"
  | "loading_error";

export type WorkoutExecutionPausedFromStatus = Exclude<WorkoutExecutionActiveStatus, "idle" | "completed" | "loading_error">;

export type WorkoutExecutionStatus = WorkoutExecutionActiveStatus | "paused";

export type WorkoutExecutionState = {
  errorMessage?: string;
  pausedFromStatus?: WorkoutExecutionPausedFromStatus;
  preparationCountdown: number;
  status: WorkoutExecutionStatus;
  stepIndex: number;
  stepKey: string;
  version: number;
};

export const workoutPreparationCountdownStart = 3;

// 训练执行状态机是页面计时、暂停、跳步和完成态的唯一事实源。
export function createIdleWorkoutExecutionState(version = 0): WorkoutExecutionState {
  return {
    preparationCountdown: 0,
    status: "idle",
    stepIndex: 0,
    stepKey: "",
    version,
  };
}

// 加载错误也是训练执行状态的一种，避免页面继续沿旧步骤计时。
export function createWorkoutExecutionLoadError(errorMessage: string, version = 0): WorkoutExecutionState {
  return {
    errorMessage,
    preparationCountdown: 0,
    status: "loading_error",
    stepIndex: 0,
    stepKey: "",
    version,
  };
}

// 步骤 key 绑定 session、timeline step 和 index，用于忽略旧步骤异步回调。
export function buildWorkoutExecutionStepKey(
  sessionId: string,
  step: WorkoutTimelineStep | undefined,
  stepIndex: number,
) {
  return step ? `${sessionId}:${step.id}:${stepIndex}` : "";
}

// 进入新步骤时只在事件入口初始化执行状态，effect 只能推进当前 key 对应的状态。
export function createWorkoutStepExecutionState({
  preparationCountdownStart = workoutPreparationCountdownStart,
  sessionId,
  step,
  stepIndex,
  version,
}: {
  preparationCountdownStart?: number;
  sessionId: string;
  step: WorkoutTimelineStep | undefined;
  stepIndex: number;
  version: number;
}): WorkoutExecutionState {
  const stepKey = buildWorkoutExecutionStepKey(sessionId, step, stepIndex);

  if (!step || !stepKey) {
    return createIdleWorkoutExecutionState(version);
  }

  if (step.type === "rest") {
    return {
      preparationCountdown: 0,
      status: "running_rest",
      stepIndex,
      stepKey,
      version,
    };
  }

  return {
    preparationCountdown: preparationCountdownStart,
    status: "preparing_intro",
    stepIndex,
    stepKey,
    version,
  };
}

// 语音准备提示完成只能推进仍属于当前步骤的准备状态。
export function markWorkoutPreparationIntroComplete(
  state: WorkoutExecutionState,
  stepKey: string,
  preparationCountdownStart = workoutPreparationCountdownStart,
): WorkoutExecutionState {
  if (state.status !== "preparing_intro" || state.stepKey !== stepKey) {
    return state;
  }

  return {
    ...state,
    preparationCountdown: state.preparationCountdown || preparationCountdownStart,
    status: "preparing_countdown",
  };
}

// 准备倒计时归零后由页面状态机确定性进入动作运行态。
export function tickWorkoutPreparationCountdown(
  state: WorkoutExecutionState,
  stepKey: string,
): WorkoutExecutionState {
  if (state.status !== "preparing_countdown" || state.stepKey !== stepKey || state.preparationCountdown <= 0) {
    return state;
  }

  const nextCountdown = Math.max(0, state.preparationCountdown - 1);

  return {
    ...state,
    preparationCountdown: nextCountdown,
    status: nextCountdown === 0 ? "running_exercise" : "preparing_countdown",
  };
}

// 暂停保留原始运行阶段，继续时不会把已运行步骤退回准备态。
export function pauseWorkoutExecution(state: WorkoutExecutionState): WorkoutExecutionState {
  if (
    state.status === "idle" ||
    state.status === "paused" ||
    state.status === "completed" ||
    state.status === "loading_error"
  ) {
    return state;
  }

  return {
    ...state,
    pausedFromStatus: state.status,
    status: "paused",
  };
}

// 继续训练只恢复暂停前阶段，不重新创建准备 key。
export function resumeWorkoutExecution(state: WorkoutExecutionState): WorkoutExecutionState {
  if (state.status !== "paused") {
    return state;
  }

  return {
    ...state,
    pausedFromStatus: undefined,
    status: state.pausedFromStatus ?? "idle",
  };
}

// 完成态先服务于当前页面反馈，持久化成功与否不反向改变它。
export function completeWorkoutExecution(state: WorkoutExecutionState): WorkoutExecutionState {
  return {
    ...state,
    pausedFromStatus: undefined,
    preparationCountdown: 0,
    status: "completed",
    stepKey: "",
  };
}

export function isWorkoutExecutionPaused(state: WorkoutExecutionState) {
  return state.status === "paused";
}

export function isWorkoutExecutionPreparingForStep(state: WorkoutExecutionState, stepKey: string) {
  return Boolean(
    stepKey &&
    state.stepKey === stepKey &&
    (state.status === "preparing_intro" ||
      state.status === "preparing_countdown" ||
      (state.status === "paused" &&
        (state.pausedFromStatus === "preparing_intro" || state.pausedFromStatus === "preparing_countdown"))),
  );
}

export function isWorkoutPreparationCountdownActive(state: WorkoutExecutionState, stepKey: string) {
  return Boolean(
    stepKey &&
    state.stepKey === stepKey &&
    state.status === "preparing_countdown",
  );
}

export function canWorkoutExecutionRunStep(
  state: WorkoutExecutionState,
  stepKey: string,
  stepType: WorkoutTimelineStep["type"] | undefined,
) {
  if (!stepKey || state.stepKey !== stepKey) {
    return false;
  }

  if (stepType === "exercise") {
    return state.status === "running_exercise";
  }

  if (stepType === "rest") {
    return state.status === "running_rest";
  }

  return false;
}
