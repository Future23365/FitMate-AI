import "server-only";

import type { Prisma } from "@prisma/client";

import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import { createOrUpdateConversationArtifact } from "@/lib/server/conversation-artifacts/artifact-service";
import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import type { CurrentUser } from "@/lib/server/users/current-user";
import type { ConversationArtifactKind } from "@/lib/shared/conversation-artifacts/schema";
import {
  buildFitnessConversationContext,
  initializeConversationSummary,
} from "@/lib/shared/chat/fitness-conversation-context";
import { assistantSuggestionListSchema } from "@/lib/shared/chat/assistant-suggestions";
import { parseUtcDateTimeInput, toUtcISOString } from "@/lib/shared/time/utc-date-time";

type ChatSessionWithMessages = Prisma.ChatSessionGetPayload<{
  include: {
    messages: {
      orderBy: { createdAt: "asc" };
    };
  };
}>;

export async function listChatConversations(currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const sessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    include: chatSessionInclude,
    orderBy: { updatedAt: "desc" },
  });

  return sessions
    .map(mapChatSessionToConversation)
    .sort((a, b) => getTimeSafe(b.updatedAt) - getTimeSafe(a.updatedAt))
    .slice(0, 30);
}

export async function getChatConversationById(id: string, currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const session = await prisma.chatSession.findFirst({
    where: { id, userId: user.id },
    include: chatSessionInclude,
  });

  return session ? mapChatSessionToConversation(session) : null;
}

export async function saveChatConversation(rawConversation: ChatConversation, currentUser?: CurrentUser) {
  const conversation = normalizeConversation(rawConversation);

  if (!conversation.messages.some((message) => message.role === "user")) {
    return conversation;
  }

  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
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
      },
      create: {
        id: conversation.id,
        userId: user.id,
        title: conversation.title,
      },
    });

    await tx.chatMessage.deleteMany({
      where: {
        chatSessionId: conversation.id,
        chatSession: { userId: user.id },
      },
    });
    const savedAtMs = Date.now();
    await tx.chatMessage.createMany({
      // 历史消息时间是侧边栏排序事实；旧消息保留原时间，新消息才按当前保存时刻补齐。
      data: conversation.messages.map((message, index) => {
        const fallbackCreatedAt = new Date(savedAtMs + index);
        const createdAt = message.createdAt ? parseUtcDateTimeInput(message.createdAt) : fallbackCreatedAt;
        const isLastMessage = index === conversation.messages.length - 1;

        return {
          id: message.id,
          chatSessionId: conversation.id,
          role: message.role,
          content: message.content,
          createdAt,
          metadata: {
            assistantSuggestions: message.assistantSuggestions,
            suggestedReplies: message.suggestedReplies,
            plan: conversation.plans?.[message.id],
            routine: conversation.routines?.[message.id],
            exerciseRecommendation: conversation.exerciseRecommendations?.[message.id],
            recommendationIntent: conversation.recommendationIntents?.[message.id],
            conversationSummary: isLastMessage ? conversation.conversationSummary : undefined,
            conversationContext: isLastMessage ? conversation.conversationContext : undefined,
          },
        };
      }),
    });
    await createConversationArtifactsFromMessages({
      tx,
      userId: user.id,
      sessionId: conversation.id,
      messages: conversation.messages,
      plans: conversation.plans,
      routines: conversation.routines,
      exerciseRecommendations: conversation.exerciseRecommendations,
    });

    const savedSession = await tx.chatSession.findFirstOrThrow({
      where: { id: conversation.id, userId: user.id },
      include: chatSessionInclude,
    });

    return mapChatSessionToConversation(savedSession);
  });
}

export async function deleteChatConversation(id: string, currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
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
  const routines = filterMessageRecord(conversation.routines, messageIds);
  const exerciseRecommendations = filterMessageRecord(conversation.exerciseRecommendations, messageIds);
  const recommendationIntents = filterMessageRecord(conversation.recommendationIntents, messageIds);
  const conversationContext =
    conversation.conversationContext ??
    buildFitnessConversationContext(messages.map(({ role, content }) => ({ role, content })));
  const conversationSummary =
    conversation.conversationSummary ??
    initializeConversationSummary(messages.map(({ role, content }) => ({ role, content })), conversationContext);

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    messages,
    plans: Object.keys(plans).length ? plans : undefined,
    routines: Object.keys(routines).length ? routines : undefined,
    exerciseRecommendations: Object.keys(exerciseRecommendations).length
      ? exerciseRecommendations
      : undefined,
    recommendationIntents: Object.keys(recommendationIntents).length
      ? recommendationIntents
      : undefined,
    conversationSummary,
    conversationContext,
  };
}

function mapChatSessionToConversation(session: ChatSessionWithMessages): ChatConversation {
  const messages: ChatMessage[] = [];
  const plans: NonNullable<ChatConversation["plans"]> = {};
  const routines: NonNullable<ChatConversation["routines"]> = {};
  const exerciseRecommendations: NonNullable<ChatConversation["exerciseRecommendations"]> = {};
  const recommendationIntents: NonNullable<ChatConversation["recommendationIntents"]> = {};

  for (const dbMessage of session.messages) {
    const metadata = readObject(dbMessage.metadata);
    const assistantSuggestions = assistantSuggestionListSchema.safeParse(metadata?.assistantSuggestions);
    const suggestedReplies = readStringArray(metadata?.suggestedReplies);
    const message: ChatMessage = {
      id: dbMessage.id,
      role: dbMessage.role === "assistant" ? "assistant" : "user",
      content: dbMessage.content,
      createdAt: toUtcISOString(dbMessage.createdAt),
      assistantSuggestions: assistantSuggestions.success && assistantSuggestions.data.length
        ? assistantSuggestions.data
        : undefined,
      suggestedReplies: suggestedReplies.length ? suggestedReplies : undefined,
    };

    messages.push(message);

    if (metadata?.plan) {
      plans[message.id] = metadata.plan as NonNullable<ChatConversation["plans"]>[string];
    }

    if (metadata?.routine) {
      routines[message.id] = metadata.routine as NonNullable<ChatConversation["routines"]>[string];
    }

    if (metadata?.exerciseRecommendation) {
      exerciseRecommendations[message.id] =
        metadata.exerciseRecommendation as NonNullable<ChatConversation["exerciseRecommendations"]>[string];
    }

    if (metadata?.recommendationIntent) {
      recommendationIntents[message.id] =
        metadata.recommendationIntent as NonNullable<ChatConversation["recommendationIntents"]>[string];
    }
  }

  const latestMessageMetadata = readObject(session.messages.at(-1)?.metadata);
  const legacyConversationContext = latestMessageMetadata?.conversationContext as ChatConversation["conversationContext"];
  const conversationSummary =
    (latestMessageMetadata?.conversationSummary as ChatConversation["conversationSummary"]) ??
    initializeConversationSummary(messages, legacyConversationContext);
  const conversationContext =
    legacyConversationContext ??
    buildFitnessConversationContext(messages);

  return {
    id: session.id,
    title: session.title ?? createConversationTitle(messages),
    updatedAt: toUtcISOString(getConversationDisplayTime(session)),
    messages,
    plans: Object.keys(plans).length ? plans : undefined,
    routines: Object.keys(routines).length ? routines : undefined,
    exerciseRecommendations: Object.keys(exerciseRecommendations).length
      ? exerciseRecommendations
      : undefined,
    recommendationIntents: Object.keys(recommendationIntents).length
      ? recommendationIntents
      : undefined,
    conversationSummary,
    conversationContext,
  };
}

async function createConversationArtifactsFromMessages({
  tx,
  userId,
  sessionId,
  messages,
  plans,
  routines,
  exerciseRecommendations,
}: {
  tx: Prisma.TransactionClient;
  userId: string;
  sessionId: string;
  messages: ChatMessage[];
  plans?: ChatConversation["plans"];
  routines?: ChatConversation["routines"];
  exerciseRecommendations?: ChatConversation["exerciseRecommendations"];
}) {
  const messageIds = new Set(messages.map((message) => message.id));
  const candidates: Array<{
    messageId: string;
    kind: ConversationArtifactKind;
    payload: unknown;
  }> = [
    ...Object.entries(exerciseRecommendations ?? {}).map(([messageId, payload]) => ({
      messageId,
      kind: "exercise_recommendation" as const,
      payload,
    })),
    ...Object.entries(routines ?? {}).map(([messageId, payload]) => ({
      messageId,
      kind: "routine" as const,
      payload,
    })),
    ...Object.entries(plans ?? {}).map(([messageId, payload]) => ({
      messageId,
      kind: "plan" as const,
      payload,
    })),
  ];

  for (const candidate of candidates) {
    if (!messageIds.has(candidate.messageId)) {
      continue;
    }

    await createOrUpdateConversationArtifact(
      {
        userId,
        sessionId,
        messageId: candidate.messageId,
        kind: candidate.kind,
        payload: candidate.payload,
      },
      tx,
    );
  }
}

function getConversationDisplayTime(session: ChatSessionWithMessages) {
  for (const message of [...session.messages].reverse()) {
    if (message.role === "user" || message.role === "assistant") {
      return message.createdAt;
    }
  }

  return session.updatedAt;
}

function getTimeSafe(isoString: string | undefined | null): number {
  const date = isoString ? parseUtcDateTimeInput(isoString) : null;
  return date?.getTime() ?? 0;
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

function readObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
