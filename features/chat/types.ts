import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
};

export type ApiChatMessage = Pick<ChatMessage, "role" | "content">;

export type ChatStreamEvent = {
  type: "reasoning" | "content" | "done" | "error";
  delta?: string;
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
