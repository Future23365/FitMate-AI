import "server-only";

import { conversationSummaryContextSchema } from "@/lib/shared/chat/fitness-conversation-context";

type SummaryUpdateInput = {
  previousSummary: string;
  latestUserMessage: string;
  assistantReply: string;
  internalActionSummary?: string;
};

// updateConversationSummary 保留为非 AI 的会话摘要边界，不再调用模型或旧 Prompt module。
export async function updateConversationSummary(input: SummaryUpdateInput) {
  return {
    summary: buildFallbackConversationSummary(input),
    source: "deterministic" as const,
  };
}

// buildFallbackConversationSummary 使用确定性裁剪维护历史摘要，不承担自然语言理解或 Agent 执行职责。
export function buildFallbackConversationSummary(input: {
  previousSummary?: string;
  latestUserMessage: string;
  assistantReply?: string;
  internalActionSummary?: string;
}) {
  const lines = [
    input.previousSummary?.trim(),
    input.latestUserMessage.trim() ? `最近用户消息：${input.latestUserMessage.trim()}` : "",
    input.assistantReply?.trim() ? `最近助手回复：${input.assistantReply.trim()}` : "",
    input.internalActionSummary?.trim() ? `服务端内部动作：${input.internalActionSummary.trim()}` : "",
  ].filter(Boolean);
  const summary = lines.join("\n");

  return conversationSummaryContextSchema.shape.summary.parse(truncateText(summary, 2000));
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}
