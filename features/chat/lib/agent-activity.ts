import type { AgentTextChatEvent } from "@/features/chat/api/chat-client";
import type {
  AgentProgressPayload,
  AgentProgressStage,
} from "@/features/chat/types";
import { isKnownAgentProgressStage } from "@/features/chat/types";

export type AgentActivityDisplay = {
  label: string;
  icon: string;
  toneClass: string;
};

export type VisibleAgentActivity = AgentProgressPayload & {
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
  );
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
  activity: AgentProgressPayload,
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
  next: AgentProgressPayload,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
  const nowMs = options.nowMs ?? Date.now();
  const minimumSpecificStageMs = options.minimumSpecificStageMs ?? visibleAgentActivityMinimumMs;
  const genericCooldownMs = options.genericCooldownMs ?? genericAgentActivityCooldownMs;
  const lastSequence = Math.max(current?.lastSequence ?? -1, next.sequence);

  if (current && next.sequence < current.lastSequence) {
    return current;
  }

  if (current && !isKnownAgentProgressStage(next.stage)) {
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

// reduceAgentActivity 只接受 agent_progress 白名单事件，避免旧 stream 合同回流。
export function reduceAgentActivity(
  current: VisibleAgentActivity | null,
  event: AgentTextChatEvent,
  options: AgentActivityReductionOptions = {},
): VisibleAgentActivity | null {
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
  current: Pick<AgentProgressPayload, "sequence"> & { lastSequence?: number } | null,
): AgentProgressPayload {
  const previousSequence = Math.max(current?.sequence ?? 0, current?.lastSequence ?? 0);

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
  activity: Pick<AgentProgressPayload, "stage" | "status">,
): AgentActivityDisplay {
  if (activity.status === "failed") {
    return {
      label: "Agent 编排遇到问题，正在整理可恢复结果...",
      icon: "warning",
      toneClass: "text-error",
    };
  }

  if (typeof activity.stage === "string" && isKnownAgentProgressStage(activity.stage)) {
    return agentActivityDisplayByStage[activity.stage];
  }

  return {
    label: fallbackAgentActivityLabel,
    icon: "auto_awesome",
    toneClass: "text-primary",
  };
}
