import "server-only";

import { z } from "zod";

import type { RecentArtifactSummary } from "@/lib/server/conversation-artifacts/artifact-service";
import {
  aiContextChatMessageSchema,
  buildFitnessConversationContext,
  buildConversationSummaryContext,
  fitnessConversationContextSchema,
  normalizeAiContextMessages,
  type ConversationSummaryContext,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type { ChatConversation } from "@/features/chat/types";

type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(120).optional(),
  responseMessageId: z.string().trim().min(1).max(120).optional(),
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  messages: z.array(aiContextChatMessageSchema).min(1).max(200).optional(),
  conversationContext: fitnessConversationContextSchema.optional(),
  thinkingEnabled: z.boolean().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type PreparedChatRequest = {
  conversationId?: string;
  responseMessageId?: string;
  rawMessages: ChatMessage[];
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  internalConversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
  hydration: ChatHistoryHydrationMetadata;
  thinkingEnabled: boolean;
  hasClientConversationSummary: boolean;
};

export type ChatHistoryHydrationMetadata = {
  source: "server_saved" | "client_fallback" | "latest_message";
  savedConversationFound: boolean;
  restoredMessageCount: number;
  hasSavedConversationContext: boolean;
  hasClientConversationContext: boolean;
  recommendationIntentCount: number;
  recentArtifactCount: number;
};

export type ChatHistoryHydrationInput = {
  savedConversation?: ChatConversation | null;
  recentArtifactSummaries?: RecentArtifactSummary[];
};

// prepareChatRequest 只负责非 AI 的请求归一化和历史 hydration，不再构造任何 Agent 运行时输入。
export function prepareChatRequest(
  request: ChatRequest,
  hydrationInput: ChatHistoryHydrationInput = {},
): PreparedChatRequest {
  const savedConversation = hydrationInput.savedConversation ?? null;
  const savedMessages = savedConversation
    ? appendLatestUserMessageIfMissing(savedConversation.messages, request.latestUserMessage)
    : [];
  const rawMessages = savedMessages.length > 0
    ? normalizeAiContextMessages(savedMessages)
    : normalizeAiContextMessages(request.messages ?? [{ role: "user", content: request.latestUserMessage }]);
  const messages = [{ role: "user" as const, content: request.latestUserMessage }];
  const savedSummary = savedConversation?.conversationSummary?.summary;
  const conversationSummaryContext = buildConversationSummaryContext({
    summary: savedSummary ?? request.conversationSummary,
    latestUserMessage: request.latestUserMessage,
  });
  const currentRunConversationContext = buildFitnessConversationContext(rawMessages);
  const savedConversationContext = savedConversation
    ? buildHydratedConversationContext(savedConversation, rawMessages)
    : undefined;
  const historicalConversationContext = savedConversationContext ?? request.conversationContext;
  const internalConversationContext = historicalConversationContext
    ? mergeCurrentRunConversationContext(historicalConversationContext, currentRunConversationContext)
    : currentRunConversationContext;
  const recentArtifactSummaries = hydrationInput.recentArtifactSummaries ?? [];
  const hydration = createChatHistoryHydrationMetadata({
    source: savedConversationContext || savedMessages.length > 0
      ? "server_saved"
      : request.conversationContext || request.messages?.length
        ? "client_fallback"
        : "latest_message",
    savedConversation,
    request,
    recentArtifactSummaries,
    restoredMessageCount: savedMessages.length,
    hasSavedConversationContext: Boolean(savedConversationContext),
  });

  return {
    conversationId: request.conversationId,
    responseMessageId: request.responseMessageId,
    rawMessages,
    conversationSummaryContext,
    internalConversationContext,
    recentArtifactSummaries,
    hydration,
    messages,
    thinkingEnabled: request.thinkingEnabled !== false,
    hasClientConversationSummary: request.conversationSummary.trim().length > 0,
  };
}

// 服务端 hydration 只恢复真实消息、历史卡片摘要和短期 context；不会再派生 Agent 执行事实。
function buildHydratedConversationContext(
  conversation: ChatConversation,
  rawMessages: ChatMessage[],
): FitnessConversationContext | undefined {
  const latestRecommendationIntent = getLatestRecommendationIntent(conversation);
  const baseContext = conversation.conversationContext ?? buildFitnessConversationContext(rawMessages);
  const currentIntent = baseContext.currentIntent ?? latestRecommendationIntent;

  return fitnessConversationContextSchema.parse({
    ...baseContext,
    currentIntent,
    knownFacts: currentIntent
      ? {
          ...baseContext.knownFacts,
          goal: baseContext.knownFacts.goal ?? currentIntent.goal,
          experience: baseContext.knownFacts.experience ?? currentIntent.experience,
          sessionMinutes: baseContext.knownFacts.sessionMinutes ?? currentIntent.sessionMinutes,
          weeklyFrequency: baseContext.knownFacts.weeklyFrequency ?? currentIntent.weeklyFrequency,
          calendarHorizonDays: baseContext.knownFacts.calendarHorizonDays ?? currentIntent.calendarHorizonDays,
          equipment: baseContext.knownFacts.equipment.length > 0
            ? baseContext.knownFacts.equipment
            : currentIntent.equipment,
          injuryLimitations: baseContext.knownFacts.injuryLimitations.length > 0
            ? baseContext.knownFacts.injuryLimitations
            : currentIntent.injuryLimitations,
          preferences: baseContext.knownFacts.preferences.length > 0
            ? baseContext.knownFacts.preferences
            : currentIntent.preferences,
          avoidances: baseContext.knownFacts.avoidances.length > 0
            ? baseContext.knownFacts.avoidances
            : currentIntent.avoidances,
        }
      : baseContext.knownFacts,
  });
}

// 当前 run 的真实用户消息优先级最高；历史 context 只补充本轮没有重新出现的长期事实。
function mergeCurrentRunConversationContext(
  historicalContext: FitnessConversationContext,
  currentRunContext: FitnessConversationContext,
): FitnessConversationContext {
  const mergedKnownFacts = {
    ...historicalContext.knownFacts,
    goal: currentRunContext.knownFacts.goal ?? historicalContext.knownFacts.goal,
    experience: currentRunContext.knownFacts.experience ?? historicalContext.knownFacts.experience,
    sessionMinutes: currentRunContext.knownFacts.sessionMinutes ?? historicalContext.knownFacts.sessionMinutes,
    weeklyFrequency: currentRunContext.knownFacts.weeklyFrequency ?? historicalContext.knownFacts.weeklyFrequency,
    calendarHorizonDays: currentRunContext.knownFacts.calendarHorizonDays
      ?? historicalContext.knownFacts.calendarHorizonDays,
    equipment: currentRunContext.knownFacts.equipment.length > 0
      ? currentRunContext.knownFacts.equipment
      : historicalContext.knownFacts.equipment,
    injuryLimitations: currentRunContext.knownFacts.injuryLimitations.length > 0
      ? currentRunContext.knownFacts.injuryLimitations
      : historicalContext.knownFacts.injuryLimitations,
    preferences: currentRunContext.knownFacts.preferences.length > 0
      ? currentRunContext.knownFacts.preferences
      : historicalContext.knownFacts.preferences,
    avoidances: currentRunContext.knownFacts.avoidances.length > 0
      ? currentRunContext.knownFacts.avoidances
      : historicalContext.knownFacts.avoidances,
    latestUserMessage: currentRunContext.knownFacts.latestUserMessage
      ?? historicalContext.knownFacts.latestUserMessage,
  };
  const mergedContext = {
    ...historicalContext,
    currentIntent: currentRunContext.currentIntent ?? historicalContext.currentIntent,
    knownFacts: mergedKnownFacts,
    unresolvedQuestions: currentRunContext.unresolvedQuestions.length > 0
      ? currentRunContext.unresolvedQuestions
      : historicalContext.unresolvedQuestions,
    pendingReplacementSelection: currentRunContext.pendingReplacementSelection
      ?? historicalContext.pendingReplacementSelection,
  };

  return fitnessConversationContextSchema.parse({
    ...mergedContext,
    summary: summarizeMergedConversationContext(mergedContext),
  });
}

function summarizeMergedConversationContext(context: FitnessConversationContext) {
  const facts = context.knownFacts;
  const parts = [
    facts.goal ? `目标：${facts.goal}` : "",
    facts.experience ? `经验：${facts.experience}` : "",
    facts.sessionMinutes ? `单次时长：${facts.sessionMinutes}分钟` : "",
    facts.weeklyFrequency ? `频率：每周${facts.weeklyFrequency}次` : "",
    facts.calendarHorizonDays ? `日历范围：未来${facts.calendarHorizonDays}天` : "",
    facts.equipment.length > 0 ? `器械：${facts.equipment.join("、")}` : "",
    facts.preferences.length > 0 ? `偏好：${facts.preferences.join("、")}` : "",
    facts.avoidances.length > 0 ? `避免：${facts.avoidances.join("、")}` : "",
    context.currentIntent ? `当前意图：${context.currentIntent.intentType}` : "",
    facts.latestUserMessage ? `最近用户输入：${facts.latestUserMessage}` : "",
  ].filter(Boolean);

  return parts.join("；").slice(0, 2000);
}

function appendLatestUserMessageIfMissing(
  savedMessages: Array<Pick<ChatMessage, "role" | "content">>,
  latestUserMessage: string,
) {
  const normalizedLatest = latestUserMessage.trim();
  const latestSavedMessage = savedMessages.at(-1);

  if (latestSavedMessage?.role === "user" && latestSavedMessage.content.trim() === normalizedLatest) {
    return savedMessages;
  }

  return [...savedMessages, { role: "user" as const, content: normalizedLatest }];
}

function getLatestRecommendationIntent(conversation: ChatConversation) {
  const intentByMessageId = conversation.recommendationIntents;

  if (!intentByMessageId) {
    return undefined;
  }

  for (const message of [...conversation.messages].reverse()) {
    const intent = intentByMessageId[message.id];

    if (intent) {
      return intent;
    }
  }

  return Object.values(intentByMessageId).at(-1);
}

function createChatHistoryHydrationMetadata(input: {
  source: ChatHistoryHydrationMetadata["source"];
  savedConversation: ChatConversation | null;
  request: ChatRequest;
  recentArtifactSummaries: RecentArtifactSummary[];
  restoredMessageCount: number;
  hasSavedConversationContext: boolean;
}): ChatHistoryHydrationMetadata {
  return {
    source: input.source,
    savedConversationFound: Boolean(input.savedConversation),
    restoredMessageCount: input.restoredMessageCount,
    hasSavedConversationContext: input.hasSavedConversationContext,
    hasClientConversationContext: Boolean(input.request.conversationContext || input.request.messages?.length),
    recommendationIntentCount: Object.keys(input.savedConversation?.recommendationIntents ?? {}).length,
    recentArtifactCount: input.recentArtifactSummaries.length,
  };
}
