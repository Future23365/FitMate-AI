import type { AgentTextChatEvent } from "@/features/chat/api/chat-client";
import type {
  AgentLoopPayload,
  AgentProgressPayload,
  AgentProgressStage,
} from "@/features/chat/types";
import { isKnownAgentProgressStage } from "@/features/chat/types";

export type AgentActivityDisplay = {
  label: string;
  icon: string;
  toneClass: string;
};

/** VisibleAgentActivity 保存当前请求的临时活动条状态，loopTurn 与 activityStage 分别来自独立 stream 事件。 */
export type VisibleAgentActivity = {
  loopTurn?: number;
  activityStage: AgentProgressPayload | null;
  pendingActivityStage?: AgentProgressPayload;
  pendingVisibleAtMs?: number;
  visibleSinceMs: number;
  holdUntilMs: number;
  lastActivitySequence: number;
  lastLoopSequence: number;
};

export const fallbackAgentActivityLabel = "正在处理请求...";
export const visibleAgentActivityMinimumMs = 1_000;
export const genericAgentActivityCooldownMs = 2_500;

const specificAgentActivityStages = new Set<string>([
  "querying_exercises",
  "reading_artifacts",
  "generating_workout",
  "validating_result",
  "saving_result",
  "writing_reply",
  "finalizing",
]);

const genericAgentActivityStages = new Set<string>([
  "preparing_context",
  "analyzing_request",
]);

const agentActivityDisplayByStage: Record<AgentProgressStage, AgentActivityDisplay> = {
  preparing_context: {
    label: "正在整理上下文...",
    icon: "dataset",
    toneClass: "text-primary",
  },
  analyzing_request: {
    label: "正在规划下一步...",
    icon: "psychology",
    toneClass: "text-primary",
  },
  querying_exercises: {
    label: "正在查询动作库...",
    icon: "exercise",
    toneClass: "text-primary",
  },
  reading_artifacts: {
    label: "正在读取已有训练内容...",
    icon: "folder_open",
    toneClass: "text-primary",
  },
  generating_workout: {
    label: "正在生成训练安排...",
    icon: "fitness_center",
    toneClass: "text-primary",
  },
  validating_result: {
    label: "正在校验训练内容...",
    icon: "fact_check",
    toneClass: "text-primary",
  },
  saving_result: {
    label: "正在保存训练结果...",
    icon: "save",
    toneClass: "text-primary",
  },
  writing_reply: {
    label: "正在整理回复...",
    icon: "rate_review",
    toneClass: "text-primary",
  },
  finalizing: {
    label: "正在收尾...",
    icon: "task_alt",
    toneClass: "text-primary",
  },
};

// createInitialAgentActivity 在请求刚发出时提供当前请求级兜底状态，不依赖历史消息。
export function createInitialAgentActivity(): AgentProgressPayload {
  return {
    stage: "preparing_context",
    status: "active",
    messageKey: "preparing_context",
    sequence: 0,
  };
}

export function createInitialVisibleAgentActivity(nowMs = Date.now()): VisibleAgentActivity {
  return createVisibleAgentActivity(
    createInitialAgentActivity(),
    nowMs,
    visibleAgentActivityMinimumMs,
    0,
    undefined,
  );
}

export type AgentActivityReductionOptions = {
  nowMs?: number;
  minimumStageMs?: number;
  genericCooldownMs?: number;
};

export function isSpecificAgentActivityStage(stage: string) {
  return specificAgentActivityStages.has(stage);
}

function isGenericAgentActivityStage(stage: string) {
  return genericAgentActivityStages.has(stage);
}

function createVisibleAgentActivity(
  activity: AgentProgressPayload,
  nowMs: number,
  minimumStageMs: number,
  lastActivitySequence: number,
  current: VisibleAgentActivity | undefined,
): VisibleAgentActivity {
  const holdUntilMs = nowMs + minimumStageMs;
  const loopTurn = typeof current?.loopTurn === "number" ? { loopTurn: current.loopTurn } : {};

  return {
    ...loopTurn,
    activityStage: activity,
    visibleSinceMs: nowMs,
    holdUntilMs,
    lastActivitySequence,
    lastLoopSequence: current?.lastLoopSequence ?? -1,
  };
}

function isSameVisibleActivity(
  currentActivity: AgentProgressPayload,
  nextActivity: AgentProgressPayload,
) {
  return currentActivity.stage === nextActivity.stage
    && currentActivity.status === nextActivity.status
    && currentActivity.messageKey === nextActivity.messageKey;
}

function rememberIgnoredActivitySequence(
  current: VisibleAgentActivity,
  lastActivitySequence: number,
): VisibleAgentActivity {
  return current.lastActivitySequence === lastActivitySequence
    ? current
    : {
      ...current,
      lastActivitySequence,
    };
}

function rememberCurrentActivitySequence(
  current: VisibleAgentActivity,
  lastActivitySequence: number,
): VisibleAgentActivity {
  if (
    current.lastActivitySequence === lastActivitySequence
    && !current.pendingActivityStage
    && typeof current.pendingVisibleAtMs !== "number"
  ) {
    return current;
  }

  return {
    ...current,
    pendingActivityStage: undefined,
    pendingVisibleAtMs: undefined,
    lastActivitySequence,
  };
}

function rememberPendingActivity(
  current: VisibleAgentActivity,
  pendingActivityStage: AgentProgressPayload,
  pendingVisibleAtMs: number,
  lastActivitySequence: number,
): VisibleAgentActivity {
  return {
    ...current,
    pendingActivityStage,
    pendingVisibleAtMs,
    lastActivitySequence,
  };
}

// reduceVisibleAgentActivity 是生产聊天页的展示仲裁器，只折叠用户可见文案，不修改 Agent Loop 轮次。
export function reduceVisibleAgentActivity(
  current: VisibleAgentActivity | null,
  next: AgentProgressPayload,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  const nowMs = options.nowMs ?? Date.now();
  const minimumStageMs = options.minimumStageMs ?? visibleAgentActivityMinimumMs;
  const genericCooldownMs = options.genericCooldownMs ?? genericAgentActivityCooldownMs;
  const lastActivitySequence = Math.max(current?.lastActivitySequence ?? -1, next.sequence);
  const currentActivity = current?.activityStage ?? null;

  if (current && next.sequence <= current.lastActivitySequence) {
    return current;
  }

  if (current && currentActivity && next.stage === "analyzing_request") {
    return rememberIgnoredActivitySequence(current, lastActivitySequence);
  }

  if (
    current &&
    currentActivity &&
    isSpecificAgentActivityStage(currentActivity.stage) &&
    isGenericAgentActivityStage(next.stage)
  ) {
    const genericBlockedUntilMs = Math.max(
      current.holdUntilMs,
      current.visibleSinceMs + genericCooldownMs,
    );

    if (nowMs < genericBlockedUntilMs) {
      return {
        ...current,
        lastActivitySequence,
      };
    }
  }

  if (current && currentActivity && isSameVisibleActivity(currentActivity, next)) {
    return rememberCurrentActivitySequence(current, lastActivitySequence);
  }

  if (current && currentActivity && nowMs < current.holdUntilMs) {
    // 新阶段先进入 pending，避免用户可见中文在短时间内连续跳变。
    return rememberPendingActivity(current, next, current.holdUntilMs, lastActivitySequence);
  }

  return createVisibleAgentActivity(next, nowMs, minimumStageMs, lastActivitySequence, current ?? undefined);
}

/** flushPendingAgentActivity 在最短展示时间结束后显示最近一次被延迟的活动阶段。 */
export function flushPendingAgentActivity(
  current: VisibleAgentActivity | null,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  if (!current?.pendingActivityStage || typeof current.pendingVisibleAtMs !== "number") {
    return current;
  }

  const nowMs = options.nowMs ?? Date.now();
  if (nowMs < current.pendingVisibleAtMs) {
    return current;
  }

  const minimumStageMs = options.minimumStageMs ?? visibleAgentActivityMinimumMs;

  return createVisibleAgentActivity(
    current.pendingActivityStage,
    nowMs,
    minimumStageMs,
    current.lastActivitySequence,
    current,
  );
}

/** reduceAgentLoopTurn 只消费合法 agent_loop 事件，禁止用 Activity sequence 推断轮次。 */
export function reduceAgentLoopTurn(
  current: VisibleAgentActivity | null,
  event: { type: "agent_loop" } & AgentLoopPayload,
  nowMs = Date.now(),
): VisibleAgentActivity | null {
  if (!Number.isSafeInteger(event.loopTurn) || event.loopTurn <= 0) {
    return current;
  }

  if (current && event.sequence <= current.lastLoopSequence) {
    return current;
  }

  if (current?.loopTurn && event.loopTurn < current.loopTurn) {
    return current;
  }

  return {
    activityStage: current?.activityStage ?? null,
    pendingActivityStage: current?.pendingActivityStage,
    pendingVisibleAtMs: current?.pendingVisibleAtMs,
    visibleSinceMs: current?.visibleSinceMs ?? nowMs,
    holdUntilMs: current?.holdUntilMs ?? nowMs,
    lastActivitySequence: current?.lastActivitySequence ?? -1,
    lastLoopSequence: event.sequence,
    loopTurn: event.loopTurn,
  };
}

// reduceAgentActivity 分别消费 agent_loop 与 agent_progress，保持轮次和活动文案两个状态独立。
export function reduceAgentActivity(
  current: VisibleAgentActivity | null,
  event: AgentTextChatEvent,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  if (event.type === "agent_loop") {
    return reduceAgentLoopTurn(current, event, options.nowMs);
  }

  if (event.type !== "agent_progress") {
    return current;
  }

  return reduceVisibleAgentActivity(current, {
    stage: event.stage,
    status: event.status,
    messageKey: event.messageKey,
    sequence: event.sequence,
  }, options);
}

export function createWritingReplyAgentActivity(
  current: VisibleAgentActivity | null,
): AgentProgressPayload {
  const previousSequence = Math.max(current?.activityStage?.sequence ?? 0, current?.lastActivitySequence ?? 0);

  return {
    stage: "writing_reply",
    status: "active",
    messageKey: "writing_reply",
    sequence: previousSequence + 1,
  };
}

export function shouldClearAgentActivityForStreamEvent(event: AgentTextChatEvent) {
  return event.type === "done" || event.type === "error";
}

// getAgentActivityDisplay 是 UI 文案白名单，未知 stage 统一展示不泄漏内部信息的兜底文案。
export function getAgentActivityDisplay(
  activity: Pick<AgentProgressPayload, "stage" | "status"> | Pick<VisibleAgentActivity, "activityStage">,
): AgentActivityDisplay {
  const activityStage = "activityStage" in activity ? activity.activityStage : activity;

  if (activityStage && typeof activityStage.stage === "string" && isKnownAgentProgressStage(activityStage.stage)) {
    return agentActivityDisplayByStage[activityStage.stage];
  }

  return {
    label: fallbackAgentActivityLabel,
    icon: "auto_awesome",
    toneClass: "text-primary",
  };
}
