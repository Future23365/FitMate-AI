import { clientRequest } from "@/lib/client/http/client-request";

import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

export type DisabledChatResponse = {
  ok: false;
  code: "chat_ai_disabled" | string;
  error?: string;
  message?: string;
  conversationId?: string;
  responseMessageId?: string;
};

// requestDisabledChatResponse 保留首页聊天的 HTTP 边界，但当前只消费普通 JSON 禁用响应。
export function requestDisabledChatResponse(
  conversationId: string,
  responseMessageId: string,
  latestUserMessage: string,
  conversationSummary: string,
  conversationContext: FitnessConversationContext,
  thinkingEnabled: boolean,
  signal: AbortSignal,
) {
  return clientRequest<DisabledChatResponse>("/api/chat", {
    method: "POST",
    throwOnError: false,
    signal,
    body: {
      conversationId,
      responseMessageId,
      latestUserMessage,
      conversationSummary,
      conversationContext,
      thinkingEnabled,
    },
  });
}
