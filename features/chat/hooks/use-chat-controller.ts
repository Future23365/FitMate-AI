"use client";

import { useEffect, useState } from "react";

import {
  requestChatStream,
  requestExerciseRecommendations,
  requestWorkoutPlanDraft,
} from "@/features/chat/api/chat-client";
import { readChatHistory, saveChatConversation } from "@/features/chat/lib/chat-history";
import {
  extractExerciseRecommendationTrigger,
  extractSuggestedQuestionTrigger,
  extractWorkoutPlanTrigger,
  extractWorkoutRoutineTrigger,
} from "@/features/chat/lib/workout-plan-trigger";
import type { ApiChatMessage, ChatMessage, ChatStreamEvent } from "@/features/chat/types";
import {
  buildFitnessConversationContext,
  selectMessagesForAiContext,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

const chatRequestTimeoutMs = 45_000;
const recommendationRefreshPattern = /(换一批|再换|换几个|换别的|再来一批|下一批|重新推荐|不要这些|别的动作)/;

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
}

function getRecommendationExerciseIds(card?: ExerciseRecommendationCard) {
  return card?.items.map((item) => item.exerciseId) ?? [];
}

function uniqueExerciseIds(ids: string[]) {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

function isRecommendationRefreshRequest(text: string) {
  return recommendationRefreshPattern.test(text);
}

export function useChatController() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [autoPlanGenerating, setAutoPlanGenerating] = useState<string | null>(null);
  const [autoRecommendationGenerating, setAutoRecommendationGenerating] = useState<string | null>(null);
  const [bubblePlans, setBubblePlans] = useState<Record<string, WorkoutPlanDraft>>({});
  const [bubbleExerciseRecommendations, setBubbleExerciseRecommendations] = useState<
    Record<string, ExerciseRecommendationCard>
  >({});
  const [dislikedExerciseIdsByMessage, setDislikedExerciseIdsByMessage] = useState<
    Record<string, string[]>
  >({});
  const [bubblePlanErrors, setBubblePlanErrors] = useState<Record<string, string>>({});
  const [conversationContext, setConversationContext] = useState<FitnessConversationContext>(() =>
    buildFitnessConversationContext([]),
  );

  useEffect(() => {
    function loadConversation(id: string) {
      if (!id) {
        return;
      }

      const conversations = readChatHistory();
      const matchedConversation = conversations.find((conversation) => conversation.id === id);

      if (!matchedConversation) {
        return;
      }

      setConversationId(matchedConversation.id);
      setMessages(matchedConversation.messages);
      setBubblePlans(matchedConversation.plans ?? {});
      setBubbleExerciseRecommendations(matchedConversation.exerciseRecommendations ?? {});
      setDislikedExerciseIdsByMessage({});
      setConversationContext(
        matchedConversation.conversationContext ??
          buildFitnessConversationContext(matchedConversation.messages),
      );
      setBubblePlanErrors({});
      setAutoPlanGenerating(null);
      setAutoRecommendationGenerating(null);
      setError("");
      setInput("");
    }

    function handleHashChange() {
      const id = window.location.hash.replace(/^#/, "");
      loadConversation(id);
    }

    function handleLoadChat(event: Event) {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail) {
        loadConversation(customEvent.detail);
      }
    }

    function startNewConversation() {
      window.history.replaceState(null, "", window.location.pathname);
      setConversationId(null);
      setMessages([]);
      setBubblePlans({});
      setBubbleExerciseRecommendations({});
      setDislikedExerciseIdsByMessage({});
      setConversationContext(buildFitnessConversationContext([]));
      setBubblePlanErrors({});
      setAutoPlanGenerating(null);
      setAutoRecommendationGenerating(null);
      setError("");
      setInput("");
    }

    const initialId = window.location.hash.replace(/^#/, "");
    if (initialId) {
      loadConversation(initialId);
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("fitmate:load-chat", handleLoadChat);
    window.addEventListener("fitmate:new-chat", startNewConversation);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("fitmate:load-chat", handleLoadChat);
      window.removeEventListener("fitmate:new-chat", startNewConversation);
    };
  }, []);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    saveChatConversation(
      conversationId,
      messages,
      bubblePlans,
      bubbleExerciseRecommendations,
      conversationContext,
    );
  }, [conversationId, messages, bubblePlans, bubbleExerciseRecommendations, conversationContext]);

  function updateAssistantMessage(
    assistantId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? updater(message) : message)),
    );
  }

  function collectLatestRecommendationExerciseIds(
    currentMessages: ChatMessage[] = messages,
    currentRecommendations: Record<string, ExerciseRecommendationCard> = bubbleExerciseRecommendations,
  ) {
    for (const message of [...currentMessages].reverse()) {
      const ids = getRecommendationExerciseIds(currentRecommendations[message.id]);

      if (ids.length > 0) {
        return ids;
      }
    }

    return [];
  }

  function collectDislikedExerciseIds() {
    return uniqueExerciseIds(Object.values(dislikedExerciseIdsByMessage).flat());
  }

  async function generateWorkoutPlanForBubble(
    messageId: string,
    intent: unknown,
    historyMessages: ApiChatMessage[],
    context: FitnessConversationContext,
    parentTraceId?: string,
  ) {
    try {
      const draft = await requestWorkoutPlanDraft(historyMessages, intent, context, parentTraceId);

      setBubblePlans((prev) => ({
        ...prev,
        [messageId]: draft,
      }));
    } catch (err: unknown) {
      console.error("[SilentPlanGeneration] Error:", err);
      setBubblePlanErrors((prev) => ({
        ...prev,
        [messageId]: err instanceof Error ? err.message : "生成训练计划失败，请稍后重试。",
      }));
    } finally {
      setAutoPlanGenerating(null);
    }
  }

  async function generateExerciseRecommendationsForBubble(
    messageId: string,
    intent: unknown,
    historyMessages: ApiChatMessage[],
    context: FitnessConversationContext,
    parentTraceId?: string,
    excludeExerciseIds: string[] = [],
  ) {
    try {
      const card = await requestExerciseRecommendations(historyMessages, intent, context, parentTraceId, {
        excludeExerciseIds,
      });

      setBubbleExerciseRecommendations((prev) => ({
        ...prev,
        [messageId]: card,
      }));
      setBubblePlanErrors((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    } catch (err: unknown) {
      console.error("[SilentExerciseRecommendation] Error:", err);
      setBubblePlanErrors((prev) => ({
        ...prev,
        [messageId]: err instanceof Error ? err.message : "生成动作推荐失败，请稍后重试。",
      }));
    } finally {
      setAutoRecommendationGenerating(null);
    }
  }

  async function refreshExerciseRecommendations(messageId: string, intent?: unknown) {
    const recommendationIntent = intent ?? conversationContext.currentIntent;

    if (!recommendationIntent) {
      setBubblePlanErrors((prev) => ({
        ...prev,
        [messageId]: "缺少上一轮推荐意图，无法直接换一批。",
      }));
      return;
    }

    const excludeExerciseIds = uniqueExerciseIds([
      ...getRecommendationExerciseIds(bubbleExerciseRecommendations[messageId]),
      ...(dislikedExerciseIdsByMessage[messageId] ?? []),
    ]);
    const historyMessages = selectMessagesForAiContext(
      messages
        .filter((message) => message.content.trim().length > 0)
        .map(({ role, content }) => ({ role, content })),
      { maxMessages: 16 },
    );

    setAutoRecommendationGenerating(messageId);
    await generateExerciseRecommendationsForBubble(
      messageId,
      recommendationIntent,
      historyMessages,
      conversationContext,
      undefined,
      excludeExerciseIds,
    );
  }

  function dislikeExerciseRecommendation(messageId: string, exerciseId: string) {
    setDislikedExerciseIdsByMessage((prev) => ({
      ...prev,
      [messageId]: uniqueExerciseIds([...(prev[messageId] ?? []), exerciseId]),
    }));
    setBubbleExerciseRecommendations((prev) => {
      const card = prev[messageId];

      if (!card) {
        return prev;
      }

      return {
        ...prev,
        [messageId]: {
          ...card,
          items: card.items.filter((item) => item.exerciseId !== exerciseId),
        },
      };
    });
  }

  function composeExerciseRecommendations(messageId: string) {
    const card = bubbleExerciseRecommendations[messageId];
    const exerciseNames = card?.items.map((item) => item.nameZh).filter(Boolean) ?? [];

    if (exerciseNames.length === 0) {
      setBubblePlanErrors((prev) => ({
        ...prev,
        [messageId]: "当前没有可编排的推荐动作，请先换一批。",
      }));
      return;
    }

    sendMessage(`把这批动作编成一套训练：${exerciseNames.join("、")}`);
  }

  async function sendMessage(nextText?: string) {
    const text = (nextText ?? input).trim();

    if (!text || isLoading) {
      return;
    }

    const userMessage = createMessage("user", text);
    const assistantMessage = createMessage("assistant", "");
    const nextConversationId = conversationId ?? crypto.randomUUID();
    const requestMessages: ApiChatMessage[] = [...messages, userMessage]
      .filter((message) => message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content }));
    const nextConversationContext = buildFitnessConversationContext(requestMessages);
    const aiMessages = selectMessagesForAiContext(requestMessages);

    if (!conversationId) {
      setConversationId(nextConversationId);
      window.history.replaceState(null, "", `#${nextConversationId}`);
    }

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setConversationContext(nextConversationContext);
    setInput("");
    setError("");
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), chatRequestTimeoutMs);

    try {
      const response = await requestChatStream(
        aiMessages,
        nextConversationContext,
        thinkingEnabled,
        controller.signal,
      );

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;

        throw new Error(data?.error || "聊天请求失败，请稍后重试。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let chatTraceId: string | undefined;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const streamEvent = JSON.parse(line) as ChatStreamEvent;

          if (streamEvent.type === "done") {
            chatTraceId = streamEvent.traceId;
            continue;
          }

          if (streamEvent.type === "error") {
            throw new Error(streamEvent.delta || "聊天请求失败，请稍后重试。");
          }

          if (streamEvent.type === "reasoning") {
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              isReasoning: true,
            }));
          }

          if (streamEvent.type === "content") {
            fullContent += streamEvent.delta ?? "";
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              content: `${message.content}${streamEvent.delta ?? ""}`,
              isReasoning: false,
            }));
          }
        }
      }

      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        isReasoning: false,
      }));

      const trigger = extractWorkoutPlanTrigger(fullContent);
      const routineTrigger = extractWorkoutRoutineTrigger(fullContent);
      const suggestedQuestionTrigger = extractSuggestedQuestionTrigger(fullContent);
      if (suggestedQuestionTrigger) {
        updateAssistantMessage(assistantMessage.id, (message) => ({
          ...message,
          suggestedQuestions: suggestedQuestionTrigger.suggestedQuestions,
        }));
      }

      const workoutDraftTrigger = trigger ?? routineTrigger;
      if (workoutDraftTrigger?.intent) {
        const messageId = assistantMessage.id;
        const contextWithAssistant = buildFitnessConversationContext([
          ...requestMessages,
          { role: "assistant", content: fullContent },
        ]);
        const planMessages = selectMessagesForAiContext(
          [...requestMessages, { role: "assistant", content: fullContent }],
          { maxMessages: 16 },
        );
        setConversationContext(contextWithAssistant);
        setAutoPlanGenerating(messageId);
        generateWorkoutPlanForBubble(
          messageId,
          workoutDraftTrigger.intent,
          planMessages,
          contextWithAssistant,
          chatTraceId,
        );
      } else {
        const recommendationTrigger = extractExerciseRecommendationTrigger(fullContent);

        if (recommendationTrigger?.intent) {
          const messageId = assistantMessage.id;
          const contextWithAssistant = buildFitnessConversationContext([
            ...requestMessages,
            { role: "assistant", content: fullContent },
          ]);
          const recommendationMessages = selectMessagesForAiContext(
            [...requestMessages, { role: "assistant", content: fullContent }],
            { maxMessages: 16 },
          );
          const excludeExerciseIds = isRecommendationRefreshRequest(text)
            ? uniqueExerciseIds([
                ...collectLatestRecommendationExerciseIds(messages, bubbleExerciseRecommendations),
                ...collectDislikedExerciseIds(),
              ])
            : [];
          setConversationContext(contextWithAssistant);
          setAutoRecommendationGenerating(messageId);
          generateExerciseRecommendationsForBubble(
            messageId,
            recommendationTrigger.intent,
            recommendationMessages,
            contextWithAssistant,
            chatTraceId,
            excludeExerciseIds,
          );
        }
      }
    } catch (requestError) {
      const isAbortError =
        requestError instanceof DOMException && requestError.name === "AbortError";

      setError(
        isAbortError
          ? "聊天请求超时，请稍后重试。"
          : requestError instanceof Error
            ? requestError.message
            : "聊天请求失败，请稍后重试。",
      );
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content || "请求失败，请检查网络或服务端配置后重试。",
        isReasoning: false,
      }));
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }

  return {
    autoRecommendationGenerating,
    autoPlanGenerating,
    bubbleExerciseRecommendations,
    bubblePlanErrors,
    bubblePlans,
    composeExerciseRecommendations,
    dislikeExerciseRecommendation,
    error,
    input,
    isLoading,
    messages,
    refreshExerciseRecommendations,
    sendMessage,
    setInput,
    setThinkingEnabled,
    thinkingEnabled,
  };
}
