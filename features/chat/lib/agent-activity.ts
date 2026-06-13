import type { AgentTextChatEvent } from "@/features/chat/api/chat-client";
import type {
  AgentLoopPayload,
  AgentProgressPayload,
  AgentProgressStage,
} from "@/features/chat/types";
import { isKnownAgentProgressStage } from "@/features/chat/types";
import { sanitizeAgentActivitySummary } from "@/lib/shared/agent-activity-summary";

export type AgentActivityDisplay = {
  label: string;
  icon: string;
  toneClass: string;
};

/** VisibleAgentActivity 保存当前请求的临时活动条状态，loopTurn 与 activityStage 分别来自独立 stream 事件。 */
export type VisibleAgentActivity = {
  loopTurn?: number;
  activityStage: AgentProgressPayload | null;
  lastActivitySequence: number;
  lastLoopSequence: number;
};

export const fallbackAgentActivityLabel = "正在思考...";

const genericAgentActivityStages = new Set<string>([
  "preparing_context",
  "analyzing_request",
]);

const agentActivityDisplayByStage: Record<AgentProgressStage, AgentActivityDisplay> = {
  preparing_context: {
    label: "正在思考...",
    icon: "dataset",
    toneClass: "text-primary",
  },
  analyzing_request: {
    label: "正在思考...",
    icon: "psychology",
    toneClass: "text-primary",
  },
  querying_exercises: {
    label: "正在思考...",
    icon: "exercise",
    toneClass: "text-primary",
  },
  reading_artifacts: {
    label: "正在思考...",
    icon: "folder_open",
    toneClass: "text-primary",
  },
  generating_workout: {
    label: "正在思考...",
    icon: "fitness_center",
    toneClass: "text-primary",
  },
  validating_result: {
    label: "正在思考...",
    icon: "fact_check",
    toneClass: "text-primary",
  },
  saving_result: {
    label: "正在思考...",
    icon: "save",
    toneClass: "text-primary",
  },
  writing_reply: {
    label: "正在思考...",
    icon: "rate_review",
    toneClass: "text-primary",
  },
  finalizing: {
    label: "正在思考...",
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
  void nowMs;

  return createVisibleAgentActivity(
    createInitialAgentActivity(),
    0,
    undefined,
  );
}

export type AgentActivityReductionOptions = {
  nowMs?: number;
};

function createVisibleAgentActivity(
  activity: AgentProgressPayload,
  lastActivitySequence: number,
  current: VisibleAgentActivity | undefined,
): VisibleAgentActivity {
  const loopTurn = typeof current?.loopTurn === "number" ? { loopTurn: current.loopTurn } : {};

  return {
    ...loopTurn,
    activityStage: activity,
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
    && currentActivity.messageKey === nextActivity.messageKey
    && currentActivity.activitySummary === nextActivity.activitySummary;
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
  if (current.lastActivitySequence === lastActivitySequence) {
    return current;
  }

  return {
    ...current,
    lastActivitySequence,
  };
}

function hasActivitySummary(activity: Pick<AgentProgressPayload, "activitySummary"> | null | undefined) {
  return sanitizeAgentActivitySummary(activity?.activitySummary).ok;
}

// reduceVisibleAgentActivity 是生产聊天页的即时展示仲裁器，只处理用户可见文案优先级，不延迟 Agent Loop 轮次。
export function reduceVisibleAgentActivity(
  current: VisibleAgentActivity | null,
  next: AgentProgressPayload,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  void options.nowMs;

  const lastActivitySequence = Math.max(current?.lastActivitySequence ?? -1, next.sequence);
  const currentActivity = current?.activityStage ?? null;
  const currentHasActivitySummary = hasActivitySummary(currentActivity);
  const nextHasActivitySummary = hasActivitySummary(next);

  if (current && next.sequence <= current.lastActivitySequence) {
    return current;
  }

  if (current && currentActivity && currentHasActivitySummary && !nextHasActivitySummary) {
    return rememberIgnoredActivitySequence(current, lastActivitySequence);
  }

  if (current && currentActivity && next.stage === "analyzing_request" && !nextHasActivitySummary) {
    return rememberIgnoredActivitySequence(current, lastActivitySequence);
  }

  if (
    current &&
    currentActivity &&
    !nextHasActivitySummary &&
    currentActivity.stage !== next.stage &&
    genericAgentActivityStages.has(next.stage)
  ) {
    return rememberIgnoredActivitySequence(current, lastActivitySequence);
  }

  if (current && currentActivity && isSameVisibleActivity(currentActivity, next)) {
    return rememberCurrentActivitySequence(current, lastActivitySequence);
  }

  return createVisibleAgentActivity(next, lastActivitySequence, current ?? undefined);
}

/** reduceAgentLoopTurn 只消费合法 agent_loop 事件，禁止用 Activity sequence 推断轮次。 */
export function reduceAgentLoopTurn(
  current: VisibleAgentActivity | null,
  event: { type: "agent_loop" } & AgentLoopPayload,
  nowMs = Date.now(),
): VisibleAgentActivity | null {
  void nowMs;

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
    ...projectSafeActivitySummary(event.activitySummary),
    sequence: event.sequence,
  }, options);
}

function projectSafeActivitySummary(value: unknown): Pick<AgentProgressPayload, "activitySummary"> {
  if (value === undefined) {
    return {};
  }

  const sanitized = sanitizeAgentActivitySummary(value);

  return sanitized.ok ? { activitySummary: sanitized.summary } : {};
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
  activity: Pick<AgentProgressPayload, "stage" | "status" | "activitySummary"> | Pick<VisibleAgentActivity, "activityStage">,
): AgentActivityDisplay {
  const activityStage = "activityStage" in activity ? activity.activityStage : activity;
  const sanitizedActivitySummary = sanitizeAgentActivitySummary(activityStage?.activitySummary);

  if (sanitizedActivitySummary.ok) {
    return {
      label: sanitizedActivitySummary.summary,
      icon: "auto_awesome",
      toneClass: "text-primary",
    };
  }

  if (activityStage && typeof activityStage.stage === "string" && isKnownAgentProgressStage(activityStage.stage)) {
    return agentActivityDisplayByStage[activityStage.stage];
  }

  return {
    label: fallbackAgentActivityLabel,
    icon: "auto_awesome",
    toneClass: "text-primary",
  };
}
