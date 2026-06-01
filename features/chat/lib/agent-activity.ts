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

export const fallbackAgentActivityLabel = "正在推进 Agent 编排...";

const agentActivityDisplayByStage: Record<AgentActivityStage, AgentActivityDisplay> = {
  preparing_context: {
    label: "正在整理上下文...",
    icon: "dataset",
    toneClass: "text-primary",
  },
  analyzing_request: {
    label: "正在分析...",
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

// createInitialAgentActivity 在请求刚发出时提供兜底状态，避免等待首个服务端事件期间没有反馈。
export function createInitialAgentActivity(): AgentActivityPayload {
  return {
    stage: "preparing_context",
    status: "active",
    messageKey: "preparing_context",
    sequence: 0,
  };
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

// reduceAgentActivity 使用 sequence 防止乱序 stream 事件把 UI 倒退到旧阶段。
export function reduceAgentActivity(
  current: AgentActivityPayload | null,
  event: ChatStreamEvent,
): AgentActivityPayload | null {
  const next = readAgentActivityFromStreamEvent(event);

  if (!next) {
    return current;
  }

  if (current && next.sequence < current.sequence) {
    return current;
  }

  return next;
}

export function createWritingReplyAgentActivity(
  current: AgentActivityPayload | null,
): AgentActivityPayload {
  return {
    stage: "writing_reply",
    status: "active",
    messageKey: "writing_reply",
    sequence: (current?.sequence ?? 0) + 1,
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
