import "server-only";

import type { Prisma } from "@prisma/client";

import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import { buildFitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

type ChatSessionWithMessages = Prisma.ChatSessionGetPayload<{
  include: {
    messages: {
      orderBy: { createdAt: "asc" };
    };
  };
}>;

export async function listChatConversations() {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const sessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    include: chatSessionInclude,
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  return sessions.map(mapChatSessionToConversation);
}

export async function getChatConversationById(id: string) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const session = await prisma.chatSession.findFirst({
    where: { id, userId: user.id },
    include: chatSessionInclude,
  });

  return session ? mapChatSessionToConversation(session) : null;
}

export async function saveChatConversation(rawConversation: ChatConversation) {
  const conversation = normalizeConversation(rawConversation);

  if (!conversation.messages.some((message) => message.role === "user")) {
    return conversation;
  }

  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const existingSession = await prisma.chatSession.findUnique({
    where: { id: conversation.id },
    select: { userId: true },
  });

  if (existingSession && existingSession.userId !== user.id) {
    throw new Error("Chat conversation belongs to another user.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.chatSession.upsert({
      where: { id: conversation.id },
      update: {
        title: conversation.title,
        metadata: {
          conversationContext: conversation.conversationContext,
        },
      },
      create: {
        id: conversation.id,
        userId: user.id,
        title: conversation.title,
        metadata: {
          conversationContext: conversation.conversationContext,
        },
      },
    });

    await tx.chatMessage.deleteMany({
      where: {
        chatSessionId: conversation.id,
        chatSession: { userId: user.id },
      },
    });
    await tx.chatMessage.createMany({
      data: conversation.messages.map((message, index) => ({
        id: message.id,
        chatSessionId: conversation.id,
        role: message.role,
        content: message.content,
        createdAt: new Date(Date.now() + index),
        metadata: {
          suggestedReplies: message.suggestedReplies,
          plan: conversation.plans?.[message.id],
          exerciseRecommendation: conversation.exerciseRecommendations?.[message.id],
        },
      })),
    });

    const savedSession = await tx.chatSession.findFirstOrThrow({
      where: { id: conversation.id, userId: user.id },
      include: chatSessionInclude,
    });

    return mapChatSessionToConversation(savedSession);
  });
}

export async function deleteChatConversation(id: string) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  await prisma.chatSession.deleteMany({ where: { id, userId: user.id } });
}

const chatSessionInclude = {
  messages: {
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ChatSessionInclude;

function normalizeConversation(conversation: ChatConversation): ChatConversation {
  const messages = conversation.messages
    .map(({ isReasoning: _isReasoning, reasoningContent: _reasoningContent, suggestedQuestions, ...message }) => ({
      ...message,
      suggestedReplies: message.suggestedReplies ?? suggestedQuestions,
    }))
    .filter((message) => message.role === "user" || message.role === "assistant");
  const messageIds = new Set(messages.map((message) => message.id));
  const plans = filterMessageRecord(conversation.plans, messageIds);
  const exerciseRecommendations = filterMessageRecord(conversation.exerciseRecommendations, messageIds);
  const conversationContext =
    conversation.conversationContext ??
    buildFitnessConversationContext(messages.map(({ role, content }) => ({ role, content })));

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    messages,
    plans: Object.keys(plans).length ? plans : undefined,
    exerciseRecommendations: Object.keys(exerciseRecommendations).length
      ? exerciseRecommendations
      : undefined,
    conversationContext,
  };
}

function mapChatSessionToConversation(session: ChatSessionWithMessages): ChatConversation {
  const messages: ChatMessage[] = [];
  const plans: NonNullable<ChatConversation["plans"]> = {};
  const exerciseRecommendations: NonNullable<ChatConversation["exerciseRecommendations"]> = {};

  for (const dbMessage of session.messages) {
    const metadata = readObject(dbMessage.metadata);
    const suggestedReplies = readStringArray(metadata?.suggestedReplies);
    const message: ChatMessage = {
      id: dbMessage.id,
      role: dbMessage.role === "assistant" ? "assistant" : "user",
      content: dbMessage.content,
      suggestedReplies: suggestedReplies.length ? suggestedReplies : undefined,
    };

    messages.push(message);

    if (metadata?.plan) {
      plans[message.id] = metadata.plan as NonNullable<ChatConversation["plans"]>[string];
    }

    if (metadata?.exerciseRecommendation) {
      exerciseRecommendations[message.id] =
        metadata.exerciseRecommendation as NonNullable<ChatConversation["exerciseRecommendations"]>[string];
    }
  }

  const sessionMetadata = readObject(session.metadata);
  const conversationContext =
    (sessionMetadata?.conversationContext as ChatConversation["conversationContext"]) ??
    buildFitnessConversationContext(messages);

  return {
    id: session.id,
    title: session.title ?? createConversationTitle(messages),
    updatedAt: session.updatedAt.toISOString(),
    messages,
    plans: Object.keys(plans).length ? plans : undefined,
    exerciseRecommendations: Object.keys(exerciseRecommendations).length
      ? exerciseRecommendations
      : undefined,
    conversationContext,
  };
}

function createConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "新对话";

  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

function filterMessageRecord<T>(record: Record<string, T> | undefined, messageIds: Set<string>) {
  const filtered: Record<string, T> = {};

  for (const [messageId, value] of Object.entries(record ?? {})) {
    if (messageIds.has(messageId)) {
      filtered[messageId] = value;
    }
  }

  return filtered;
}

function readObject(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
