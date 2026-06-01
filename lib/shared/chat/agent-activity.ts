export const agentActivityStageValues = [
  "preparing_context",
  "analyzing_request",
  "querying_exercises",
  "reading_artifacts",
  "generating_workout",
  "validating_result",
  "saving_result",
  "writing_reply",
  "finalizing",
] as const;

export type AgentActivityStage = (typeof agentActivityStageValues)[number];

export const agentActivityStatusValues = [
  "active",
  "completed",
  "skipped",
  "failed",
] as const;

export type AgentActivityStatus = (typeof agentActivityStatusValues)[number];

export type KnownAgentActivityMessageKey = AgentActivityStage;

export type AgentActivityPayload = {
  stage: AgentActivityStage | (string & {});
  status: AgentActivityStatus;
  messageKey?: KnownAgentActivityMessageKey;
  sequence: number;
};

const knownAgentActivityStages = new Set<string>(agentActivityStageValues);
const knownAgentActivityStatuses = new Set<string>(agentActivityStatusValues);

// Agent 活动阶段是生产 UI 合同，只允许粗粒度、用户安全的阶段枚举进入展示层。
export function isKnownAgentActivityStage(stage: string): stage is AgentActivityStage {
  return knownAgentActivityStages.has(stage);
}

// Agent 活动状态只表达当前请求生命周期，不代表可持久化业务结果。
export function isKnownAgentActivityStatus(status: string): status is AgentActivityStatus {
  return knownAgentActivityStatuses.has(status);
}
