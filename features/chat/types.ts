import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
  /** 模型显式给出的下一步问题建议，点击后自动作为用户消息发送 */
  suggestedQuestions?: string[];
};

export type ApiChatMessage = Pick<ChatMessage, "role" | "content">;

export type ChatStreamEvent = {
  type: "reasoning" | "content" | "done" | "error";
  delta?: string;
  /** 服务端 Trace ID，用于把后续自动计划生成追加到同一条开发日志 */
  traceId?: string;
};

export type ChatConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** 消息气泡内嵌的训练计划草稿，key 为 messageId */
  plans?: Record<string, WorkoutPlanDraft>;
  /** 消息气泡内嵌的动作推荐卡片，key 为 messageId */
  exerciseRecommendations?: Record<string, ExerciseRecommendationCard>;
};
