"use client";

import dynamic from "next/dynamic";

import { LogoMark } from "@/components/app/logo-mark";
import { SymbolIcon } from "@/components/app/symbol-icon";
import { AgentActivityIndicator } from "@/features/chat/components/agent-activity-indicator";
import { adaptVisibleTrainingProposalToRichCard } from "@/features/chat/lib/visible-training-proposal-cards";
import type { ChatMessage } from "@/features/chat/types";
import type { VisibleAgentActivity } from "@/features/chat/lib/agent-activity";
import { ExerciseRecommendationCard } from "@/features/exercises/components/exercise-recommendation-card";
import { WorkoutPlanDraftCard } from "@/features/workouts/components/workout-plan-draft-card";
import { WorkoutRoutineDraftCard } from "@/features/workouts/components/workout-routine-draft-card";

const loadMarkdownContent = () =>
  import("@/features/chat/components/markdown-content").then((module) => module.MarkdownContent);

const MarkdownContent = dynamic(loadMarkdownContent, {
  ssr: false,
  loading: () => <TextContentSkeleton />,
});

type ChatTranscriptProps = {
  messages: ChatMessage[];
  error?: string;
  isLoading?: boolean;
  thinkingEnabled?: boolean;
  activeAgentActivityMessageId?: string | null;
  agentActivity?: VisibleAgentActivity | null;
  className?: string;
  onSuggestedQuestion?: (suggestedQuestion: string) => void;
};

type ChatMessageBubbleProps = {
  message: ChatMessage;
  agentActivity?: VisibleAgentActivity | null;
  isLoading?: boolean;
  thinkingEnabled?: boolean;
  onSuggestedQuestion?: (suggestedQuestion: string) => void;
};

function TextContentSkeleton() {
  return (
    <div className="space-y-sm" aria-label="正在加载回复内容">
      <div className="h-4 w-11/12 animate-pulse rounded bg-surface-container" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-surface-container" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" />
    </div>
  );
}

// ChatTranscript 是只读消息展示合同，首页和 dev 审核页只通过 ChatMessage[] 共享展示层。
export function ChatTranscript({
  activeAgentActivityMessageId,
  agentActivity,
  className = "mx-auto flex max-w-4xl flex-col gap-md",
  error,
  isLoading = false,
  messages,
  onSuggestedQuestion,
  thinkingEnabled = false,
}: ChatTranscriptProps) {
  return (
    <div className={className}>
      {messages.map((message) => (
        <ChatMessageBubble
          agentActivity={
            message.role === "assistant" && message.id === activeAgentActivityMessageId
              ? agentActivity
              : null
          }
          isLoading={isLoading}
          key={message.id}
          message={message}
          onSuggestedQuestion={onSuggestedQuestion}
          thinkingEnabled={thinkingEnabled}
        />
      ))}
      {error ? (
        <div className="rounded-xl border border-error-container bg-error-container/40 p-md text-label-md text-on-error-container">
          {error}
        </div>
      ) : null}
    </div>
  );
}

// ChatMessageBubble 只负责单条消息气泡和可见输出渲染，不持有首页输入框、滚动或会话状态。
export function ChatMessageBubble({
  agentActivity,
  isLoading = false,
  message,
  onSuggestedQuestion,
  thinkingEnabled = false,
}: ChatMessageBubbleProps) {
  const isUserMessage = message.role === "user";

  return (
    <div className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[82%] items-start gap-sm ${isUserMessage ? "flex-row-reverse" : ""}`}>
        <div className="flex w-9 shrink-0 justify-center pt-[2px]">
          <ChatMessageAvatar role={isUserMessage ? "user" : "assistant"} />
        </div>
        <div className={`flex min-w-0 flex-1 flex-col gap-xs ${isUserMessage ? "items-end" : "items-start"}`}>
          {message.role === "assistant" && (
            <AgentActivityIndicator activity={agentActivity ?? null} />
          )}
          <div
            className={`ai-chat-bubble max-w-full min-w-0 rounded-2xl p-lg ${
              isUserMessage
                ? "rounded-tr-sm bg-primary text-white shadow-[0_12px_26px_rgba(36,89,230,0.16)]"
                : `ai-chat-bubble-assistant rounded-tl-sm border border-line bg-white text-ink shadow-[0_12px_26px_rgba(16,24,40,0.06)] ${
                    getAssistantDisplayContent(message).length > 0 ? "ai-chat-bubble-answer-ready" : ""
                  }`
            }`}
          >
            {message.role === "assistant" ? (
              <ChatAssistantMessageContent
                isLoading={isLoading}
                message={message}
                onSuggestedQuestion={onSuggestedQuestion}
                thinkingEnabled={thinkingEnabled}
              />
            ) : (
              <p className="whitespace-pre-wrap font-body-md text-body-md">
                {message.content}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ChatAssistantMessageContent 汇总 assistant 的用户可见回答面，包括 Markdown、训练卡片和建议提问。
export function ChatAssistantMessageContent({
  isLoading,
  message,
  onSuggestedQuestion,
  thinkingEnabled,
}: {
  message: ChatMessage;
  isLoading: boolean;
  thinkingEnabled: boolean;
  onSuggestedQuestion?: (suggestedQuestion: string) => void;
}) {
  const cleanContent = getAssistantDisplayContent(message);
  const suggestedQuestions = message.suggestedQuestions ?? [];

  return (
    <>
      {cleanContent ? (
        <div className="markdown-answer chat-answer-content-enter">
          <MarkdownContent content={cleanContent} />
        </div>
      ) : (
        <div className="chat-thinking-hold">
          <ChatThinkingIndicator showThinkingIcon={thinkingEnabled || message.isReasoning === true} />
        </div>
      )}

      {message.visibleOutputs?.map((output, index) => (
        <VisibleTrainingProposalRichCardRenderer
          key={`${output.outputType}:${output.schemaVersion}:${index}`}
          output={output}
          sourceChatMessageId={message.id}
        />
      ))}

      {suggestedQuestions.length > 0 && (
        <div className="mt-md border-t border-line/70 pt-sm">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-sm">
            <span className="shrink-0 pt-1 font-label-xs text-label-xs font-bold text-muted">
              继续问
            </span>
            <div className="flex min-w-0 flex-col items-start gap-xs">
              {suggestedQuestions.map((suggestedQuestion, index) => (
                <button
                  className="group inline-flex max-w-full items-start gap-[4px] rounded-md px-xs py-1 text-left font-label-sm text-label-sm font-semibold text-primary transition-colors hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || !onSuggestedQuestion}
                  key={`${suggestedQuestion}:${index}`}
                  onClick={() => onSuggestedQuestion?.(suggestedQuestion)}
                  title={suggestedQuestion}
                  type="button"
                >
                  <SymbolIcon className="mt-[1px] shrink-0 text-[15px] opacity-65 transition-opacity group-hover:opacity-100">
                    arrow_forward
                  </SymbolIcon>
                  <span className="min-w-0 break-words leading-snug">
                    {suggestedQuestion}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VisibleTrainingProposalRichCardRenderer({
  output,
  sourceChatMessageId,
}: {
  output: Parameters<typeof adaptVisibleTrainingProposalToRichCard>[0];
  sourceChatMessageId: string;
}) {
  const richCard = adaptVisibleTrainingProposalToRichCard(output);

  if (!richCard) {
    return null;
  }

  if (richCard.kind === "exerciseRecommendation") {
    return (
      <div className="chat-visible-output-enter mt-md">
        <ExerciseRecommendationCard card={richCard.card} />
      </div>
    );
  }

  if (richCard.kind === "routine") {
    return (
      <div className="chat-visible-output-enter mt-md">
        <WorkoutRoutineDraftCard
          draft={richCard.draft}
          sourceChatMessageId={sourceChatMessageId}
        />
      </div>
    );
  }

  return (
    <div className="chat-visible-output-enter mt-md">
      <WorkoutPlanDraftCard
        draft={richCard.draft}
        sourceChatMessageId={sourceChatMessageId}
      />
    </div>
  );
}

// getAssistantDisplayContent 只做历史展示清理，不解析意图、不触发训练卡片。
function getAssistantDisplayContent(message: ChatMessage) {
  return message.role === "assistant" ? stripHistoricalLegacyTriggerBlocks(message.content) : "";
}

function ChatThinkingIndicator({ showThinkingIcon }: { showThinkingIcon: boolean }) {
  const toneClass = showThinkingIcon
    ? "rounded-xl border border-primary/15 bg-primary-soft/70 px-md py-sm text-primary"
    : "px-xs py-[2px] text-muted";
  const dotClass = showThinkingIcon ? "bg-primary" : "bg-outline-variant";

  return (
    <div className={`flex items-center gap-sm ${toneClass}`}>
      {showThinkingIcon ? (
        <SymbolIcon className="animate-pulse text-[18px]">psychology</SymbolIcon>
      ) : null}
      <span className="font-body-md text-body-md">正在思考</span>
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClass} [animation-delay:-0.2s]`} />
        <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClass} [animation-delay:-0.1s]`} />
        <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClass}`} />
      </span>
    </div>
  );
}

function ChatMessageAvatar({ role }: { role: "assistant" | "user" }) {
  if (role === "user") {
    return (
      <div
        aria-label="用户头像"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_18px_rgba(36,89,230,0.18)] ring-2 ring-white"
        title="你"
      >
        <SymbolIcon className="text-[20px]" filled>
          person
        </SymbolIcon>
      </div>
    );
  }

  return (
    <div
      aria-label="FitMate AI 头像"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/10 bg-white shadow-[0_8px_18px_rgba(36,89,230,0.08)]"
      title="FitMate AI"
    >
      <LogoMark className="h-6 w-6" showIconShell={false} />
    </div>
  );
}

// 历史消息可能含旧 trigger JSON；这里只做纯展示清理，不再解析 intent 或触发任何训练卡片。
function stripHistoricalLegacyTriggerBlocks(content: string) {
  const legacyTriggerTypes = [
    "workout_plan_trigger",
    "workout_routine_trigger",
    "exercise_recommendation_trigger",
    "suggested_reply_trigger",
    "suggested_question_trigger",
  ];
  let cleanContent = content;

  for (const rawBlock of collectHistoricalJsonLikeBlocks(content)) {
    if (legacyTriggerTypes.some((type) => rawBlock.includes(`"type"`) && rawBlock.includes(type))) {
      cleanContent = cleanContent.replace(rawBlock, "");
    }
  }

  return cleanContent.trim();
}

function collectHistoricalJsonLikeBlocks(content: string) {
  const blocks: string[] = [];
  const fencedRegex = /```json\s*[\s\S]*?\s*```/g;

  for (const match of content.matchAll(fencedRegex)) {
    blocks.push(match[0]);
  }

  for (const rawBlock of collectBalancedJsonObjects(content)) {
    if (!blocks.includes(rawBlock)) {
      blocks.push(rawBlock);
    }
  }

  return blocks;
}

function collectBalancedJsonObjects(content: string) {
  const blocks: string[] = [];

  for (let start = content.indexOf("{"); start >= 0; start = content.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = start; index < content.length; index += 1) {
      const char = content[index];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      }

      if (char === "}") {
        depth -= 1;
      }

      if (depth === 0) {
        blocks.push(content.slice(start, index + 1));
        break;
      }
    }
  }

  return blocks;
}
