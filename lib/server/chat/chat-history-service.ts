import "server-only";

import type { Prisma } from "@prisma/client";

import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import type { CurrentUser } from "@/lib/server/users/current-user";
import {
  buildFitnessConversationContext,
  initializeConversationSummary,
} from "@/lib/shared/chat/fitness-conversation-context";
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
        const metadata = toPrismaJsonInput({
          suggestedQuestions: message.suggestedQuestions,
          visibleOutputs: message.visibleOutputs,
          conversationSummary: isLastMessage ? conversation.conversationSummary : undefined,
          conversationContext: isLastMessage ? conversation.conversationContext : undefined,
        });

        return {
          id: message.id,
          chatSessionId: conversation.id,
          role: message.role,
          content: message.content,
          createdAt,
          metadata,
        };
      }),
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
    .map(({ isReasoning: _isReasoning, reasoningContent: _reasoningContent, ...message }) => message)
    .filter((message) => message.role === "user" || message.role === "assistant");
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
    conversationSummary,
    conversationContext,
  };
}

function mapChatSessionToConversation(session: ChatSessionWithMessages): ChatConversation {
  const messages: ChatMessage[] = [];

  for (const dbMessage of session.messages) {
    const metadata = readObject(dbMessage.metadata);
    const suggestedQuestions = readStringArray(metadata?.suggestedQuestions);
    const message: ChatMessage = {
      id: dbMessage.id,
      role: dbMessage.role === "assistant" ? "assistant" : "user",
      content: dbMessage.content,
      createdAt: toUtcISOString(dbMessage.createdAt),
      suggestedQuestions: suggestedQuestions.length ? suggestedQuestions : undefined,
      visibleOutputs: readVisibleOutputs(metadata?.visibleOutputs),
    };

    messages.push(message);
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
    conversationSummary,
    conversationContext,
  };
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

// readVisibleOutputs 只恢复用户已看到的结构化输出，不再读取旧 bubble metadata。
function readVisibleOutputs(value: unknown): ChatMessage["visibleOutputs"] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const outputs = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const output = item as Record<string, unknown>;
    if (typeof output.outputType !== "string" || typeof output.schemaVersion !== "string") {
      return [];
    }

    return [{
      outputType: output.outputType,
      schemaVersion: output.schemaVersion,
      payload: output.payload,
      content: output.content,
    }];
  });

  return outputs.length ? outputs : undefined;
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

function toPrismaJsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
