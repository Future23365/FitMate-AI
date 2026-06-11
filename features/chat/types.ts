import type {
  WorkoutPlanDraft,
  WorkoutPlanIntent,
  WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { ConversationSummaryContext, FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 消息创建时间，是聊天历史展示和排序的事实来源。 */
  createdAt?: string;
  reasoningContent?: string;
  /** 仅用于前端加载态，不保存或展示模型原始推理内容 */
  isReasoning?: boolean;
  /** 建议提问按钮文本，点击后会作为下一轮普通用户消息原文发送。 */
  suggestedQuestions?: string[];
  /** 用户可见结构化输出，后续训练卡片只从这里读取事实，正文只作为解释文本 */
  visibleOutputs?: ChatVisibleOutput[];
};

export type ChatVisibleOutput = {
  outputType: string;
  schemaVersion: string;
  payload: unknown;
  content?: unknown;
};

export type ApiChatMessage = Pick<ChatMessage, "role" | "content">;

export const agentProgressStageValues = [
  "preparing_context",
  "analyzing_request",
  "model_activity",
  "querying_exercises",
  "reading_artifacts",
  "generating_workout",
  "validating_result",
  "saving_result",
  "writing_reply",
  "finalizing",
] as const;

export type AgentProgressStage = (typeof agentProgressStageValues)[number];

export const agentProgressStatusValues = [
  "active",
  "completed",
  "skipped",
  "failed",
] as const;

export type AgentProgressStatus = (typeof agentProgressStatusValues)[number];

/** AgentProgressPayload 是当前请求级临时 UI 状态，不写入 ChatMessage 或聊天历史。 */
export type AgentProgressPayload = {
  stage: AgentProgressStage | (string & {});
  status: AgentProgressStatus;
  messageKey?: AgentProgressStage;
  /** activitySummary 是服务端投影的短活动摘要，只用于当前请求展示，不写入消息或历史。 */
  activitySummary?: string;
  sequence: number;
};

/** AgentLoopPayload 是当前请求内的后端 runtime loop 轮次，不写入 ChatMessage 或聊天历史。 */
export type AgentLoopPayload = {
  loopTurn: number;
  sequence: number;
};

const knownAgentProgressStages = new Set<string>(agentProgressStageValues);
const knownAgentProgressStatuses = new Set<string>(agentProgressStatusValues);

/** isKnownAgentProgressStage 只服务前端展示白名单，未知 stage 不直接渲染给用户。 */
export function isKnownAgentProgressStage(stage: string): stage is AgentProgressStage {
  return knownAgentProgressStages.has(stage);
}

/** isKnownAgentProgressStatus 限定 stream progress 状态，避免内部错误态原文进入 UI。 */
export function isKnownAgentProgressStatus(status: string): status is AgentProgressStatus {
  return knownAgentProgressStatuses.has(status);
}

export type ChatConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** 消息气泡内嵌的训练计划草稿，key 为 messageId */
  plans?: Record<string, WorkoutPlanDraft>;
  /** 消息气泡内嵌的单次训练编排草稿，key 为 messageId */
  routines?: Record<string, WorkoutRoutineDraft>;
  /** 消息气泡内嵌的动作推荐卡片，key 为 messageId */
  exerciseRecommendations?: Record<string, ExerciseRecommendationCard>;
  /** 动作推荐卡片生成时使用的结构化意图，供历史回读和多轮上下文恢复使用 */
  recommendationIntents?: Record<string, WorkoutPlanIntent>;
  /** 服务端维护的自然语言上下文总结，是模型可见历史上下文 */
  conversationSummary?: Pick<ConversationSummaryContext, "summary">;
  /** @deprecated 仅用于旧历史迁移和服务端确定性兜底，不再作为模型可见协议 */
  conversationContext?: FitnessConversationContext;
};
