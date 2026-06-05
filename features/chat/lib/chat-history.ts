"use client";

import { clientRequest } from "@/lib/client/http/client-request";
import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import type { ConversationSummaryContext, FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

type ChatHistoryResponse = {
  items: ChatConversation[];
};

type ChatConversationResponse = {
  item: ChatConversation;
};

export async function readChatHistory(): Promise<ChatConversation[]> {
  const data = await clientRequest<ChatHistoryResponse>("/api/chat/conversations", {
    errorMessage: "聊天历史加载失败",
  });

  return data.items;
}

export async function readChatConversation(id: string): Promise<ChatConversation | null> {
  try {
    const data = await clientRequest<ChatConversationResponse>(
      `/api/chat/conversations/${encodeURIComponent(id)}`,
      { errorMessage: "聊天记录加载失败" },
    );

    return data.item;
  } catch {
    return null;
  }
}

export async function deleteChatConversation(id: string) {
  await clientRequest(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    responseType: "raw",
    errorMessage: "删除对话失败",
  });
}

export function createConversationTitle(nextMessages: ChatMessage[]) {
  const firstUserMessage = nextMessages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "新对话";

  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

// createChatConversationSavePayload 显式白名单持久化字段，避免请求态 UI 字段进入聊天历史。
export function createChatConversationSavePayload(
  conversationId: string,
  messages: ChatMessage[],
  conversationSummary?: Pick<ConversationSummaryContext, "summary">,
  conversationContext?: FitnessConversationContext,
) {
  const messagesToSave = messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    suggestedQuestions: message.suggestedQuestions,
    visibleOutputs: message.visibleOutputs,
  }));

  if (!messagesToSave.some((message) => message.role === "user")) {
    return null;
  }

  return {
    id: conversationId,
    title: createConversationTitle(messagesToSave),
    updatedAt: new Date().toISOString(),
    messages: messagesToSave,
    conversationSummary,
    conversationContext,
  };
}

export async function saveChatConversation(
  conversationId: string,
  messages: ChatMessage[],
  conversationSummary?: Pick<ConversationSummaryContext, "summary">,
  conversationContext?: FitnessConversationContext,
) {
  const payload = createChatConversationSavePayload(
    conversationId,
    messages,
    conversationSummary,
    conversationContext,
  );

  if (!payload) {
    return null;
  }

  const data = await clientRequest<ChatConversationResponse>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PUT",
      errorMessage: "保存对话失败",
      body: payload,
    },
  );

  window.dispatchEvent(new Event("fitmate:chat-history-updated"));
  return data.item;
}
