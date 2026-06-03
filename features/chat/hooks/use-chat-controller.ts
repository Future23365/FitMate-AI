"use client";

import { useEffect, useRef, useState } from "react";

import {
  getAgentTextChatErrorMessage,
  getAgentTextChatEventErrorMessage,
  isAgentTextChatAbortError,
  requestAgentTextChatResponse,
  type AgentTextChatEvent,
} from "@/features/chat/api/chat-client";
import { readChatConversation, saveChatConversation } from "@/features/chat/lib/chat-history";
import type {
  ApiChatMessage,
  ChatMessage,
} from "@/features/chat/types";
import {
  buildConversationSummaryContext,
  buildFitnessConversationContext,
  initializeConversationSummary,
  type ConversationSummaryContext,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import {
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
  type WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";

const chatRequestTimeoutMs = 45_000;
const thinkingEnabledStorageKey = "fitmate.chat.thinkingEnabled";

type BubblePlanError = {
  message: string;
  guidanceMessage?: string;
  suggestedReplies: string[];
  recoverable: boolean;
};

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

// applyAgentTextChatEventToAssistantMessage 是前端 NDJSON 事件到当前 assistant message 的唯一投影入口。
export function applyAgentTextChatEventToAssistantMessage(
  message: ChatMessage,
  event: AgentTextChatEvent,
): ChatMessage {
  switch (event.type) {
    case "content":
      return {
        ...message,
        content: `${message.content}${event.content}`,
        isReasoning: false,
      };
    case "assistant_suggestions":
      return {
        ...message,
        suggestedReplies: event.suggestions,
        isReasoning: false,
      };
    case "error":
      return {
        ...message,
        content: message.content || getAgentTextChatEventErrorMessage(event),
        isReasoning: false,
      };
    case "done":
      return {
        ...message,
        isReasoning: false,
      };
    default:
      return message;
  }
}

function readThinkingEnabledPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(thinkingEnabledStorageKey) === "true";
  } catch {
    return false;
  }
}

export function useChatController() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [thinkingEnabled, setThinkingEnabled] = useState(readThinkingEnabledPreference);
  const [autoPlanGenerating, setAutoPlanGenerating] = useState<string | null>(null);
  const [autoRecommendationGenerating, setAutoRecommendationGenerating] = useState<string | null>(null);
  const [bubblePlans, setBubblePlans] = useState<Record<string, WorkoutPlanDraft>>({});
  const [bubbleRoutines, setBubbleRoutines] = useState<Record<string, WorkoutRoutineDraft>>({});
  const [bubblePlanExercises, setBubblePlanExercises] = useState<Record<string, Exercise[]>>({});
  const [bubbleExerciseRecommendations, setBubbleExerciseRecommendations] = useState<
    Record<string, ExerciseRecommendationCard>
  >({});
  const [bubbleRecommendationIntents, setBubbleRecommendationIntents] = useState<Record<string, WorkoutPlanIntent>>({});
  const [bubblePlanErrors, setBubblePlanErrors] = useState<Record<string, BubblePlanError>>({});
  const [conversationContext, setConversationContext] = useState<FitnessConversationContext>(() =>
    buildFitnessConversationContext([]),
  );
  const [conversationSummary, setConversationSummary] = useState<Pick<ConversationSummaryContext, "summary">>({
    summary: "",
  });
  const skipNextAutoSaveRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(thinkingEnabledStorageKey, String(thinkingEnabled));
    } catch {
      // localStorage 不可用时保持当前会话内状态即可
    }
  }, [thinkingEnabled]);

  useEffect(() => {
    async function loadConversation(id: string) {
      if (!id) {
        return;
      }

      const matchedConversation = await readChatConversation(id);

      if (!matchedConversation) {
        return;
      }

      skipNextAutoSaveRef.current = true;
      setConversationId(matchedConversation.id);
      setMessages(matchedConversation.messages);
      setBubblePlans(matchedConversation.plans ?? {});
      setBubbleRoutines(matchedConversation.routines ?? {});
      setBubblePlanExercises({});
      setBubbleExerciseRecommendations(matchedConversation.exerciseRecommendations ?? {});
      setBubbleRecommendationIntents(matchedConversation.recommendationIntents ?? {});
      setConversationContext(
        matchedConversation.conversationContext ??
          buildFitnessConversationContext(matchedConversation.messages),
      );
      setConversationSummary(
        matchedConversation.conversationSummary ??
          initializeConversationSummary(
            matchedConversation.messages,
            matchedConversation.conversationContext,
          ),
      );
      setBubblePlanErrors({});
      setAutoPlanGenerating(null);
      setAutoRecommendationGenerating(null);
      setError("");
      setInput("");
    }

    function handleHashChange() {
      const id = window.location.hash.replace(/^#/, "");
      if (!id) {
        return;
      }
      void loadConversation(id);
    }

    function handleLoadChat(event: Event) {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail) {
        void loadConversation(customEvent.detail);
      }
    }

    function startNewConversation() {
      window.history.replaceState(null, "", window.location.pathname);
      setConversationId(null);
      setMessages([]);
      setBubblePlans({});
      setBubbleRoutines({});
      setBubblePlanExercises({});
      setBubbleExerciseRecommendations({});
      setBubbleRecommendationIntents({});
      setConversationContext(buildFitnessConversationContext([]));
      setConversationSummary({ summary: "" });
      setBubblePlanErrors({});
      setAutoPlanGenerating(null);
      setAutoRecommendationGenerating(null);
      setError("");
      setInput("");
    }

    const initialId = window.location.hash.replace(/^#/, "");
    if (initialId) {
      void loadConversation(initialId);
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

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void saveChatConversation(
        conversationId,
        messages,
        bubblePlans,
        bubbleRoutines,
        bubbleExerciseRecommendations,
        bubbleRecommendationIntents,
        conversationSummary,
        conversationContext,
      ).catch((saveError: unknown) => {
        console.error("[ChatHistory] Save failed:", saveError);
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    conversationId,
    messages,
    bubblePlans,
    bubbleRoutines,
    bubbleExerciseRecommendations,
    bubbleRecommendationIntents,
    conversationSummary,
    conversationContext,
  ]);

  function updateAssistantMessage(
    assistantId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? updater(message) : message)),
    );
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
    const requestSummaryContext = buildConversationSummaryContext({
      summary: conversationSummary.summary,
      latestUserMessage: text,
    });

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
      await requestAgentTextChatResponse({
        conversationId: nextConversationId,
        responseMessageId: assistantMessage.id,
        latestUserMessage: requestSummaryContext.latestUserMessage,
        conversationSummary: requestSummaryContext.summary,
        conversationContext: nextConversationContext,
        thinkingEnabled,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "error") {
            setError(getAgentTextChatEventErrorMessage(event));
            setIsLoading(false);
          }

          if (event.type === "done") {
            setIsLoading(false);
          }

          updateAssistantMessage(assistantMessage.id, (message) =>
            applyAgentTextChatEventToAssistantMessage(message, event),
          );
        },
      });
    } catch (requestError) {
      const errorMessage = isAgentTextChatAbortError(requestError)
        ? "聊天请求超时，请稍后重试。"
        : getAgentTextChatErrorMessage(requestError);

      setError(errorMessage);
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content || errorMessage,
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
    bubblePlanExercises,
    bubblePlanErrors,
    bubblePlans,
    bubbleRoutines,
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
