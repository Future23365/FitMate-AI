import type {
  AgentActivityPayload,
  AgentActivityStage,
  ChatStreamEvent,
} from "@/features/chat/types";
import {
  isKnownAgentActivityStage,
  isKnownAgentActivityStatus,
} from "@/lib/shared/chat/agent-activity";

export type AgentActivityDisplay = {
  label: string;
  icon: string;
  toneClass: string;
};

export type VisibleAgentActivity = AgentActivityPayload & {
  visibleSinceMs: number;
  holdUntilMs: number;
  lastSequence: number;
};

export const fallbackAgentActivityLabel = "正在推进 Agent 编排...";
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

const agentActivityDisplayByStage: Record<AgentActivityStage, AgentActivityDisplay> = {
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
    label: "正在完善训练结果...",
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

// createInitialAgentActivity 在请求刚发出时提供兜底状态，避免等待首个服务端事件期间没有反馈。
export function createInitialAgentActivity(): AgentActivityPayload {
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
  );
}

// readAgentActivityFromStreamEvent 只读取 stream 白名单字段，忽略任何额外内部诊断字段。
export function readAgentActivityFromStreamEvent(
  event: ChatStreamEvent,
): AgentActivityPayload | null {
  if (event.type !== "agent_activity" || typeof event.stage !== "string") {
    return null;
  }

  const status = typeof event.status === "string" && isKnownAgentActivityStatus(event.status)
    ? event.status
    : "active";
  const messageKey =
    typeof event.messageKey === "string" && isKnownAgentActivityStage(event.messageKey)
      ? event.messageKey
      : undefined;

  return {
    stage: event.stage,
    status,
    messageKey,
    sequence: typeof event.sequence === "number" && Number.isFinite(event.sequence)
      ? event.sequence
      : 0,
  };
}

export type AgentActivityReductionOptions = {
  nowMs?: number;
  minimumSpecificStageMs?: number;
  genericCooldownMs?: number;
};

export function isSpecificAgentActivityStage(stage: string) {
  return specificAgentActivityStages.has(stage);
}

function isGenericAgentActivityStage(stage: string) {
  return genericAgentActivityStages.has(stage);
}

function createVisibleAgentActivity(
  activity: AgentActivityPayload,
  nowMs: number,
  minimumSpecificStageMs: number,
  lastSequence: number,
): VisibleAgentActivity {
  const holdUntilMs = isSpecificAgentActivityStage(activity.stage)
    ? nowMs + minimumSpecificStageMs
    : nowMs;

  return {
    ...activity,
    visibleSinceMs: nowMs,
    holdUntilMs,
    lastSequence,
  };
}

function rememberIgnoredSequence(
  current: VisibleAgentActivity,
  lastSequence: number,
): VisibleAgentActivity {
  return current.lastSequence === lastSequence
    ? current
    : {
      ...current,
      lastSequence,
    };
}

// reduceVisibleAgentActivity 是生产聊天页的展示仲裁器，只折叠用户可见文案，不推断 Agent 业务流程。
export function reduceVisibleAgentActivity(
  current: VisibleAgentActivity | null,
  next: AgentActivityPayload,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  const nowMs = options.nowMs ?? Date.now();
  const minimumSpecificStageMs = options.minimumSpecificStageMs ?? visibleAgentActivityMinimumMs;
  const genericCooldownMs = options.genericCooldownMs ?? genericAgentActivityCooldownMs;
  const lastSequence = Math.max(current?.lastSequence ?? -1, next.sequence);

  if (current && next.sequence < current.lastSequence) {
    return current;
  }

  if (current && !isKnownAgentActivityStage(next.stage)) {
    return rememberIgnoredSequence(current, lastSequence);
  }

  if (
    current &&
    isSpecificAgentActivityStage(current.stage) &&
    isGenericAgentActivityStage(next.stage)
  ) {
    const genericBlockedUntilMs = Math.max(
      current.holdUntilMs,
      current.visibleSinceMs + genericCooldownMs,
    );

    if (nowMs < genericBlockedUntilMs) {
      return rememberIgnoredSequence(current, lastSequence);
    }
  }

  if (
    current &&
    current.stage === next.stage &&
    current.status === next.status &&
    current.messageKey === next.messageKey
  ) {
    return rememberIgnoredSequence(current, lastSequence);
  }

  return createVisibleAgentActivity(next, nowMs, minimumSpecificStageMs, lastSequence);
}

// reduceAgentActivity 使用 sequence 和展示权重防止动态 Agent loop 把 UI 倒退到低信息量阶段。
export function reduceAgentActivity(
  current: VisibleAgentActivity | null,
  event: ChatStreamEvent,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  const next = readAgentActivityFromStreamEvent(event);

  if (!next) {
    return current;
  }

  return reduceVisibleAgentActivity(current, next, options);
}

export function createWritingReplyAgentActivity(
  current: Pick<AgentActivityPayload, "sequence"> & { lastSequence?: number } | null,
): AgentActivityPayload {
  const previousSequence = Math.max(current?.sequence ?? 0, current?.lastSequence ?? 0);

  return {
    stage: "writing_reply",
    status: "active",
    messageKey: "writing_reply",
    sequence: previousSequence + 1,
  };
}

export function shouldClearAgentActivityForStreamEvent(event: ChatStreamEvent) {
  return event.type === "done" || event.type === "error";
}

// getAgentActivityDisplay 是 UI 文案白名单，未知 stage 统一展示不泄漏内部信息的兜底文案。
export function getAgentActivityDisplay(
  activity: Pick<AgentActivityPayload, "stage" | "status">,
): AgentActivityDisplay {
  if (activity.status === "failed") {
    return {
      label: "Agent 编排遇到问题，正在整理可恢复结果...",
      icon: "warning",
      toneClass: "text-error",
    };
  }

  if (typeof activity.stage === "string" && isKnownAgentActivityStage(activity.stage)) {
    return agentActivityDisplayByStage[activity.stage];
  }

  return {
    label: fallbackAgentActivityLabel,
    icon: "auto_awesome",
    toneClass: "text-primary",
  };
}
