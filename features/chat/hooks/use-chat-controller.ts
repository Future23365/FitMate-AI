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
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

const chatRequestTimeoutMs = 45_000;

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
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
  const [bubblePlanErrors, setBubblePlanErrors] = useState<Record<string, string>>({});

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

    saveChatConversation(conversationId, messages, bubblePlans, bubbleExerciseRecommendations);
  }, [conversationId, messages, bubblePlans, bubbleExerciseRecommendations]);

  function updateAssistantMessage(
    assistantId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? updater(message) : message)),
    );
  }

  async function generateWorkoutPlanForBubble(
    messageId: string,
    intent: unknown,
    historyMessages: ApiChatMessage[],
  ) {
    try {
      const draft = await requestWorkoutPlanDraft(historyMessages, intent);

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
  ) {
    try {
      const card = await requestExerciseRecommendations(historyMessages, intent);

      setBubbleExerciseRecommendations((prev) => ({
        ...prev,
        [messageId]: card,
      }));
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

    if (!conversationId) {
      setConversationId(nextConversationId);
      window.history.replaceState(null, "", `#${nextConversationId}`);
    }

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setError("");
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), chatRequestTimeoutMs);

    try {
      const response = await requestChatStream(requestMessages, thinkingEnabled, controller.signal);

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
            continue;
          }

          if (streamEvent.type === "error") {
            throw new Error(streamEvent.delta || "聊天请求失败，请稍后重试。");
          }

          if (streamEvent.type === "reasoning") {
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              reasoningContent: `${message.reasoningContent ?? ""}${streamEvent.delta ?? ""}`,
            }));
          }

          if (streamEvent.type === "content") {
            fullContent += streamEvent.delta ?? "";
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              content: `${message.content}${streamEvent.delta ?? ""}`,
            }));
          }
        }
      }

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
        setAutoPlanGenerating(messageId);
        generateWorkoutPlanForBubble(messageId, workoutDraftTrigger.intent, requestMessages);
      } else {
        const recommendationTrigger = extractExerciseRecommendationTrigger(fullContent);

        if (recommendationTrigger?.intent) {
          const messageId = assistantMessage.id;
          setAutoRecommendationGenerating(messageId);
          generateExerciseRecommendationsForBubble(
            messageId,
            recommendationTrigger.intent,
            requestMessages,
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
    error,
    input,
    isLoading,
    messages,
    sendMessage,
    setInput,
    setThinkingEnabled,
    thinkingEnabled,
  };
}
