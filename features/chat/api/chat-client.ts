import { clientRequest } from "@/lib/client/http/client-request";

import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

export function requestChatStream(
  conversationId: string,
  responseMessageId: string,
  latestUserMessage: string,
  conversationSummary: string,
  conversationContext: FitnessConversationContext,
  thinkingEnabled: boolean,
  signal: AbortSignal,
) {
  return clientRequest("/api/chat", {
    method: "POST",
    responseType: "raw",
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
