import type { WorkoutPlanDraft, WorkoutRoutineDraft } from "@/lib/shared/workout-plans/draft-schema";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { ConversationSummaryContext, FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
import type { WorkoutPatchDiffEntry } from "@/lib/shared/workout-patches/schema";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 消息创建时间，是聊天历史展示和排序的事实来源。 */
  createdAt?: string;
  reasoningContent?: string;
  /** 仅用于前端加载态，不保存或展示模型原始推理内容 */
  isReasoning?: boolean;
  /** 模型显式给出的用户视角一键回复，点击后自动作为用户消息发送 */
  suggestedReplies?: string[];
  /** @deprecated 旧历史兼容字段；新消息使用 suggestedReplies */
  suggestedQuestions?: string[];
};

export type ApiChatMessage = Pick<ChatMessage, "role" | "content">;

export type AssistantActionEvent = {
  action: "exercise_recommendation" | "workout_routine" | "workout_plan";
  intent: unknown;
  referenceResolution?: Extract<ReferenceResolution, { status: "resolved" }>;
};

export type ChatStreamEvent = {
  type:
    | "reasoning"
    | "content"
    | "done"
    | "error"
    | "assistant_action"
    | "workout_patch"
    | "suggested_replies"
    | "suggested_questions";
  delta?: string;
  action?: AssistantActionEvent["action"];
  intent?: unknown;
  referenceResolution?: AssistantActionEvent["referenceResolution"];
  artifactKind?: "routine" | "plan";
  artifactId?: string;
  sourceArtifactId?: string;
  payload?: WorkoutRoutineDraft | WorkoutPlanDraft;
  diff?: WorkoutPatchDiffEntry[];
  suggestedReplies?: string[];
  /** @deprecated 旧流事件兼容字段；新事件使用 suggestedReplies */
  suggestedQuestions?: string[];
  /** 服务端 Trace ID，用于把后续自动计划生成追加到同一条开发日志 */
  traceId?: string;
  /** 服务端更新后的自然语言聊天总结，是下一轮模型可见历史上下文 */
  conversationSummary?: string;
};

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
  /** 服务端维护的自然语言上下文总结，是模型可见历史上下文 */
  conversationSummary?: Pick<ConversationSummaryContext, "summary">;
  /** @deprecated 仅用于旧历史迁移和服务端确定性兜底，不再作为模型可见协议 */
  conversationContext?: FitnessConversationContext;
};
