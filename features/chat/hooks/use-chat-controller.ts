"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  getAgentTextChatErrorMessage,
  getAgentTextChatEventErrorMessage,
  isAgentTextChatAbortError,
  requestAgentTextChatResponse,
  type AgentTextChatEvent,
} from "@/features/chat/api/chat-client";
import {
  createInitialVisibleAgentActivity,
  createWritingReplyAgentActivity,
  reduceAgentActivity,
  reduceVisibleAgentActivity,
  shouldClearAgentActivityForStreamEvent,
  type VisibleAgentActivity,
} from "@/features/chat/lib/agent-activity";
import { readChatConversation, saveChatConversation } from "@/features/chat/lib/chat-history";
import {
  createAsyncToastLifecycle,
  type AsyncToastLifecycle,
} from "@/lib/client/async-feedback";
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

const chatRequestTimeoutMs = 45_000;
const thinkingEnabledStorageKey = "fitmate.chat.thinkingEnabled";
const thinkingEnabledPreferenceChangeEvent = "fitmate:chat-thinking-enabled-changed";
const defaultThinkingEnabled = false;
let inMemoryThinkingEnabledPreference = defaultThinkingEnabled;

type ChatInitialResponseToastUpdate =
  | { type: "dismiss" }
  | { type: "error"; message: string }
  | null;

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
    case "suggested_questions":
      return {
        ...message,
        suggestedQuestions: event.suggestedQuestions,
        isReasoning: false,
      };
    case "visible_output":
      return {
        ...message,
        visibleOutputs: [
          ...(message.visibleOutputs ?? []),
          {
            outputType: event.outputType,
            schemaVersion: event.schemaVersion,
            payload: event.payload,
            content: event.content,
          },
        ],
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

// 首包 Toast 只覆盖请求发出到首个用户可见 stream event 的空窗，后续进度交给气泡和活动条。
export function getChatInitialResponseToastUpdate(
  event: AgentTextChatEvent,
): ChatInitialResponseToastUpdate {
  if (!["agent_loop", "agent_progress", "content", "done", "error"].includes(event.type)) {
    return null;
  }

  if (event.type === "error") {
    return { type: "error", message: getAgentTextChatEventErrorMessage(event) };
  }

  return { type: "dismiss" };
}

export function getChatInitialResponseRequestErrorMessage(error: unknown) {
  return isAgentTextChatAbortError(error)
    ? "聊天请求超时。你可以缩小问题范围后再试。"
    : getAgentTextChatErrorMessage(error);
}

function readThinkingEnabledPreference() {
  if (typeof window === "undefined") {
    return defaultThinkingEnabled;
  }

  try {
    const storedPreference = window.localStorage.getItem(thinkingEnabledStorageKey);
    return storedPreference === null
      ? inMemoryThinkingEnabledPreference
      : storedPreference === "true";
  } catch {
    return inMemoryThinkingEnabledPreference;
  }
}

function getDefaultThinkingEnabledPreference() {
  return defaultThinkingEnabled;
}

function subscribeThinkingEnabledPreference(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function handleStorageChange(event: StorageEvent) {
    if (event.key === thinkingEnabledStorageKey || event.key === null) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(thinkingEnabledPreferenceChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(thinkingEnabledPreferenceChangeEvent, onStoreChange);
  };
}

function writeThinkingEnabledPreference(nextValue: boolean) {
  if (typeof window === "undefined") {
    inMemoryThinkingEnabledPreference = nextValue;
    return;
  }

  inMemoryThinkingEnabledPreference = nextValue;

  try {
    window.localStorage.setItem(thinkingEnabledStorageKey, String(nextValue));
  } catch {
    // localStorage 不可用时保留当前会话内偏好，并通过订阅通知刷新 UI。
  }

  window.dispatchEvent(new Event(thinkingEnabledPreferenceChangeEvent));
}

export function useChatController() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [agentActivity, setAgentActivity] = useState<VisibleAgentActivity | null>(null);
  const [activeAgentActivityMessageId, setActiveAgentActivityMessageId] = useState<string | null>(null);
  // useSyncExternalStore 用 server snapshot 稳住 hydration，再从客户端偏好源刷新显示。
  const thinkingEnabled = useSyncExternalStore(
    subscribeThinkingEnabledPreference,
    readThinkingEnabledPreference,
    getDefaultThinkingEnabledPreference,
  );
  const setThinkingEnabled = useCallback((nextValue: boolean | ((current: boolean) => boolean)) => {
    writeThinkingEnabledPreference(
      typeof nextValue === "function" ? nextValue(readThinkingEnabledPreference()) : nextValue,
    );
  }, []);
  const [conversationContext, setConversationContext] = useState<FitnessConversationContext>(() =>
    buildFitnessConversationContext([]),
  );
  const [conversationSummary, setConversationSummary] = useState<Pick<ConversationSummaryContext, "summary">>({
    summary: "",
  });
  const skipNextAutoSaveRef = useRef(false);
  const pendingConversationLoadToastRef = useRef<AsyncToastLifecycle | null>(null);
  const pendingInitialResponseToastRef = useRef<AsyncToastLifecycle | null>(null);

  useEffect(() => {
    async function loadConversation(id: string) {
      if (!id) {
        return;
      }

      const conversationLoadToast = createAsyncToastLifecycle({
        id: "chat-history-load",
        loading: "正在加载聊天记录...",
        error: "聊天记录加载失败，请稍后重试。",
        minVisibleMs: 300,
      });

      pendingConversationLoadToastRef.current?.dismiss();
      pendingConversationLoadToastRef.current = conversationLoadToast;
      conversationLoadToast.start();

      try {
        const matchedConversation = await readChatConversation(id);

        if (!matchedConversation) {
          throw new Error("聊天记录加载失败，请稍后重试。");
        }

        skipNextAutoSaveRef.current = true;
        setConversationId(matchedConversation.id);
        setMessages(matchedConversation.messages);
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
        setError("");
        setInput("");
        setAgentActivity(null);
        setActiveAgentActivityMessageId(null);
        conversationLoadToast.success();
      } catch (loadError) {
        conversationLoadToast.error(loadError);
      } finally {
        if (pendingConversationLoadToastRef.current === conversationLoadToast) {
          pendingConversationLoadToastRef.current = null;
        }
      }
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
      setConversationContext(buildFitnessConversationContext([]));
      setConversationSummary({ summary: "" });
      setError("");
      setInput("");
      setAgentActivity(null);
      setActiveAgentActivityMessageId(null);
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
    conversationSummary,
    conversationContext,
  ]);

  useEffect(() => {
    return () => {
      pendingConversationLoadToastRef.current?.dismiss();
      pendingConversationLoadToastRef.current = null;
      pendingInitialResponseToastRef.current?.dismiss();
      pendingInitialResponseToastRef.current = null;
    };
  }, []);

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
    setActiveAgentActivityMessageId(assistantMessage.id);
    setAgentActivity(createInitialVisibleAgentActivity());

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), chatRequestTimeoutMs);
    const initialResponseToast = createAsyncToastLifecycle({
      id: "chat-send-initial-response",
      loading: "正在发送消息...",
      error: (toastError) => (toastError instanceof Error ? toastError.message : "聊天服务暂时没能完成这次回复。"),
      minVisibleMs: 300,
    });
    let hasSettledInitialResponseToast = false;

    pendingInitialResponseToastRef.current?.dismiss();
    pendingInitialResponseToastRef.current = initialResponseToast;
    initialResponseToast.start();

    function settleInitialResponseToastForEvent(event: AgentTextChatEvent) {
      if (hasSettledInitialResponseToast) {
        return;
      }

      const toastUpdate = getChatInitialResponseToastUpdate(event);

      if (!toastUpdate) {
        return;
      }

      hasSettledInitialResponseToast = true;

      if (toastUpdate.type === "error") {
        initialResponseToast.error(new Error(toastUpdate.message));
        return;
      }

      initialResponseToast.dismiss();
    }

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
          settleInitialResponseToastForEvent(event);

          if (event.type === "agent_loop" || event.type === "agent_progress") {
            setAgentActivity((current) => reduceAgentActivity(current, event));
          }

          if (event.type === "content") {
            setAgentActivity((current) => (
              reduceVisibleAgentActivity(current, createWritingReplyAgentActivity(current))
            ));
          }

          if (event.type === "error") {
            setError(getAgentTextChatEventErrorMessage(event));
            setIsLoading(false);
          }

          if (event.type === "done") {
            setIsLoading(false);
          }

          if (shouldClearAgentActivityForStreamEvent(event)) {
            setAgentActivity(null);
            setActiveAgentActivityMessageId(null);
          }

          updateAssistantMessage(assistantMessage.id, (message) =>
            applyAgentTextChatEventToAssistantMessage(message, event),
          );
        },
      });
    } catch (requestError) {
      const errorMessage = getChatInitialResponseRequestErrorMessage(requestError);

      if (!hasSettledInitialResponseToast) {
        hasSettledInitialResponseToast = true;
        initialResponseToast.error(new Error(errorMessage));
      }
      setError(errorMessage);
      setAgentActivity(null);
      setActiveAgentActivityMessageId(null);
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content || errorMessage,
        isReasoning: false,
      }));
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
      setAgentActivity(null);
      setActiveAgentActivityMessageId(null);
      if (!hasSettledInitialResponseToast) {
        hasSettledInitialResponseToast = true;
        initialResponseToast.dismiss();
      }
      if (pendingInitialResponseToastRef.current === initialResponseToast) {
        pendingInitialResponseToastRef.current = null;
      }
    }
  }

  return {
    activeAgentActivityMessageId,
    agentActivity,
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
