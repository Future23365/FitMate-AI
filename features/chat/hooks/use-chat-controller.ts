"use client";

import { useEffect, useRef, useState } from "react";

import { requestChatStream } from "@/features/chat/api/chat-client";
import {
  createInitialAgentActivity,
  createWritingReplyAgentActivity,
  reduceAgentActivity,
  shouldClearAgentActivityForStreamEvent,
} from "@/features/chat/lib/agent-activity";
import { readChatConversation, saveChatConversation } from "@/features/chat/lib/chat-history";
import { readAssistantSuggestionsFromStreamEvent } from "@/features/chat/lib/assistant-suggestions";
import {
  extractSuggestedReplyTrigger,
} from "@/features/chat/lib/workout-plan-trigger";
import type {
  ApiChatMessage,
  AgentActivityPayload,
  ChatMessage,
  ChatStreamEvent,
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
  workoutPlanIntentSchema,
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

function parseRecommendationIntent(intent: unknown): WorkoutPlanIntent | null {
  const parsed = workoutPlanIntentSchema.safeParse(intent);
  return parsed.success ? parsed.data : null;
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
  const [agentActivity, setAgentActivity] = useState<AgentActivityPayload | null>(null);
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

  function clearAgentActivity() {
    setAgentActivity(null);
  }

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

      clearAgentActivity();
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
        clearAgentActivity();
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
      clearAgentActivity();
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
    setAgentActivity(createInitialAgentActivity());

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), chatRequestTimeoutMs);

    try {
      const response = await requestChatStream(
        nextConversationId,
        assistantMessage.id,
        requestSummaryContext.latestUserMessage,
        requestSummaryContext.summary,
        conversationContext,
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
      let updatedConversationSummary = requestSummaryContext.summary;
      let updatedConversationContext: FitnessConversationContext | null = null;

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

          if (streamEvent.type === "agent_activity") {
            setAgentActivity((current) => reduceAgentActivity(current, streamEvent));
            continue;
          }

          if (streamEvent.type === "done") {
            if (typeof streamEvent.conversationSummary === "string") {
              updatedConversationSummary = streamEvent.conversationSummary;
              setConversationSummary({ summary: updatedConversationSummary });
            }
            if (streamEvent.conversationContext) {
              updatedConversationContext = streamEvent.conversationContext;
              setConversationContext(streamEvent.conversationContext);
            }
            if (shouldClearAgentActivityForStreamEvent(streamEvent)) {
              clearAgentActivity();
            }
            continue;
          }

          if (streamEvent.type === "error") {
            if (shouldClearAgentActivityForStreamEvent(streamEvent)) {
              clearAgentActivity();
            }
            throw new Error(streamEvent.delta || "聊天请求失败，请稍后重试。");
          }

          if (streamEvent.type === "artifact_generating") {
            if (streamEvent.artifactKind === "exercise_recommendation") {
              setAutoRecommendationGenerating(assistantMessage.id);
            } else {
              setAutoPlanGenerating(assistantMessage.id);
            }
            continue;
          }

          if ((streamEvent.type === "artifact" || streamEvent.type === "artifact_validated") && streamEvent.payload) {
            if (streamEvent.artifactKind === "exercise_recommendation" && "items" in streamEvent.payload) {
              setBubbleExerciseRecommendations((prev) => ({
                ...prev,
                [assistantMessage.id]: streamEvent.payload as ExerciseRecommendationCard,
              }));
              const parsedIntent = parseRecommendationIntent(streamEvent.intent);
              if (parsedIntent) {
                setBubbleRecommendationIntents((prev) => ({
                  ...prev,
                  [assistantMessage.id]: parsedIntent,
                }));
              }
              setAutoRecommendationGenerating(null);
            }

            if (streamEvent.artifactKind === "routine" && "sections" in streamEvent.payload) {
              setBubbleRoutines((prev) => ({
                ...prev,
                [assistantMessage.id]: streamEvent.payload as WorkoutRoutineDraft,
              }));
              setAutoPlanGenerating(null);
            }

            if (streamEvent.artifactKind === "plan" && "days" in streamEvent.payload) {
              setBubblePlans((prev) => ({
                ...prev,
                [assistantMessage.id]: streamEvent.payload as WorkoutPlanDraft,
              }));
              setAutoPlanGenerating(null);
            }
            continue;
          }

          if (streamEvent.type === "artifact_failed") {
            setBubblePlanErrors((prev) => ({
              ...prev,
              [assistantMessage.id]: {
                message: streamEvent.guidanceMessage || streamEvent.errorCode || "生成训练内容失败，请补充条件后重试。",
                guidanceMessage: streamEvent.guidanceMessage,
                suggestedReplies: streamEvent.suggestedReplies ?? [],
                recoverable: Boolean(streamEvent.recoverable),
              },
            }));
            setAutoPlanGenerating(null);
            setAutoRecommendationGenerating(null);
            continue;
          }

          if (streamEvent.type === "workout_patch" && streamEvent.payload) {
            if (streamEvent.artifactKind === "routine" && "sections" in streamEvent.payload) {
              setBubbleRoutines((prev) => ({
                ...prev,
                [assistantMessage.id]: streamEvent.payload as WorkoutRoutineDraft,
              }));
            }

            if (streamEvent.artifactKind === "plan" && "days" in streamEvent.payload) {
              setBubblePlans((prev) => ({
                ...prev,
                [assistantMessage.id]: streamEvent.payload as WorkoutPlanDraft,
              }));
            }
            continue;
          }

          if (
            streamEvent.type === "assistant_suggestions" ||
            streamEvent.type === "suggested_replies" ||
            streamEvent.type === "suggested_questions"
          ) {
            const assistantSuggestions = readAssistantSuggestionsFromStreamEvent(streamEvent);

            if (assistantSuggestions.length > 0) {
              updateAssistantMessage(assistantMessage.id, (message) => ({
                ...message,
                assistantSuggestions: message.assistantSuggestions?.length
                  ? message.assistantSuggestions
                  : assistantSuggestions,
                suggestedReplies: message.suggestedReplies ?? assistantSuggestions.map((suggestion) => suggestion.message),
              }));
            }
            continue;
          }

          if (streamEvent.type === "reasoning") {
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              isReasoning: true,
            }));
          }

          if (streamEvent.type === "content") {
            fullContent += streamEvent.delta ?? "";
            setAgentActivity((current) =>
              current?.stage === "writing_reply"
                ? current
                : createWritingReplyAgentActivity(current),
            );
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

      const suggestedReplyTrigger = extractSuggestedReplyTrigger(fullContent);
      if (suggestedReplyTrigger) {
        updateAssistantMessage(assistantMessage.id, (message) => ({
          ...message,
          suggestedReplies: message.assistantSuggestions?.length
            ? message.suggestedReplies
            : suggestedReplyTrigger.suggestedReplies,
        }));
      }

      setConversationContext(
        updatedConversationContext ??
          buildFitnessConversationContext([
            ...requestMessages,
            { role: "assistant", content: fullContent },
          ]),
      );
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
      clearAgentActivity();
    }
  }

  return {
    autoRecommendationGenerating,
    agentActivity,
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
