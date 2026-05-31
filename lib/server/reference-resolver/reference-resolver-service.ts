import "server-only";

import {
  searchArtifactsForCurrentUserDetailed,
} from "@/lib/server/conversation-artifacts/artifact-service";
import type { ChatIntent } from "@/lib/server/chat/chat-service";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import { summarizeReferenceResolutionForTrace } from "@/lib/server/dev/ai-run-trace";
import type {
  ReferenceArtifactCandidate,
  ReferenceResolution,
  ReferenceResolutionInput,
} from "@/lib/shared/reference-resolver/schema";
import { referenceResolutionInputSchema } from "@/lib/shared/reference-resolver/schema";
import type { ConversationArtifactKind } from "@/lib/shared/conversation-artifacts/schema";

type ResolveReferenceInput = ReferenceResolutionInput & {
  intentType?: ChatIntent["type"];
  trace?: AiTraceLogger;
};

// ReferenceResolver 把自然语言引用收敛成候选内结果，后续编排不能再让模型凭空猜 artifactId。
export async function resolveReference(input: ResolveReferenceInput): Promise<ReferenceResolution> {
  const startedAt = new Date().toISOString();
  const parsedInput = referenceResolutionInputSchema.parse(input);
  const message = parsedInput.latestUserMessage;
  const inferredKind = inferArtifactKind(message, input.intentType);
  const recentArtifacts = inferredKind
    ? parsedInput.recentArtifacts.filter((artifact) => artifact.kind === inferredKind)
    : parsedInput.recentArtifacts;

  const hasRecentReference = isRecentReference(message);

  if (hasRecentReference) {
    const recentResult = resolveRecentReference({
      message,
      inferredKind,
      recentArtifacts,
      allRecentArtifacts: parsedInput.recentArtifacts,
    });

    if (recentResult) {
      input.trace?.addStep({
        name: "ReferenceResolver 近指引用解析",
        type: "reference_resolution",
        output: summarizeReferenceResolutionForTrace(recentResult),
        metadata: {
          startedAt,
          strategy: "recent_artifact",
          inferredKind,
          status: recentResult.status,
          reason: recentResult.reason,
        },
      });
      return recentResult;
    }
  }

  const semanticQuery = buildSemanticQuery(message);
  if (hasRecentReference && !semanticQuery) {
    const result: ReferenceResolution = {
      status: "not_found",
      confidence: "low",
      reason: "当前会话没有可引用的 recent artifact，且用户消息缺少可用于语义检索的线索。",
      candidates: [],
    };
    input.trace?.addStep({
      name: "ReferenceResolver 解析失败",
      type: "reference_resolution",
      status: "failed",
      output: summarizeReferenceResolutionForTrace(result),
      metadata: {
        startedAt,
        strategy: "recent_artifact",
        inferredKind,
        status: result.status,
        reason: result.reason,
      },
    });
    return result;
  }
  const searchStartedAt = new Date().toISOString();
  const artifactSearch = await searchArtifactsForCurrentUserDetailed({
    sessionId: parsedInput.sessionId,
    sessionScope: "current_user",
    kind: inferredKind,
    query: semanticQuery,
    limit: 6,
  });
  const candidates = artifactSearch.candidates;
  input.trace?.addStep({
    name: "Artifact Hybrid Search 检索",
    type: "rag_query",
    input: {
      query: artifactSearch.diagnostics.query,
      filters: artifactSearch.diagnostics.filters,
    },
    output: {
      recalledCount: artifactSearch.diagnostics.recalledCount,
      filteredCount: artifactSearch.diagnostics.filteredCount,
      rerank: artifactSearch.diagnostics.rerank,
      finalCandidateIds: artifactSearch.diagnostics.finalCandidateIds,
      failureReasons: artifactSearch.diagnostics.failureReasons,
    },
    metadata: {
      startedAt: searchStartedAt,
      candidateCount: artifactSearch.diagnostics.finalCandidateIds.length,
    },
  });
  input.trace?.addStep({
    name: "searchArtifacts 受控工具调用",
    type: "tool_call",
    input: {
      toolName: "searchArtifacts",
      sessionId: parsedInput.sessionId,
      sessionScope: "current_user",
      kind: inferredKind,
      query: semanticQuery,
      limit: 6,
    },
    output: {
      candidateCount: candidates.length,
      candidates: candidates.map((candidate) => ({
        artifactId: candidate.artifactId,
        kind: candidate.kind,
        title: candidate.title,
        summary: candidate.summary,
        updatedAt: candidate.updatedAt,
      })),
    },
    metadata: {
      startedAt: searchStartedAt,
      toolName: "searchArtifacts",
      status: "success",
    },
  });

  if (candidates.length === 0) {
    const result: ReferenceResolution = {
      status: "not_found",
      confidence: "low",
      reason: "当前用户可访问的 artifact 索引中没有找到匹配的历史对象。",
      candidates: [],
    };
    input.trace?.addStep({
      name: "ReferenceResolver 语义检索未命中",
      type: "reference_resolution",
      status: "failed",
      output: summarizeReferenceResolutionForTrace(result),
      metadata: {
        startedAt,
        strategy: "semantic_search",
        inferredKind,
        status: result.status,
        reason: result.reason,
      },
    });
    return result;
  }

  if (candidates.length === 1) {
    const result = toResolved(candidates[0], "语义检索只返回一个可访问候选。", "medium", candidates);
    input.trace?.addStep({
      name: "ReferenceResolver 语义检索命中",
      type: "reference_resolution",
      output: summarizeReferenceResolutionForTrace(result),
      metadata: {
        startedAt,
        strategy: "semantic_search",
        inferredKind,
        status: result.status,
        reason: result.reason,
      },
    });
    return result;
  }

  const result: ReferenceResolution = {
    status: "ambiguous",
    confidence: "low",
    reason: "语义检索返回多个相近候选，无法在用户确认前安全选择。",
    candidates,
    clarificationQuestion: buildClarificationQuestion(candidates),
  };
  input.trace?.addStep({
    name: "ReferenceResolver 语义检索歧义",
    type: "reference_resolution",
    status: "failed",
    output: summarizeReferenceResolutionForTrace(result),
    metadata: {
      startedAt,
      strategy: "semantic_search",
      inferredKind,
      status: result.status,
      reason: result.reason,
    },
  });
  return result;
}

export function shouldAttemptReferenceResolution(message: string, intentType?: ChatIntent["type"]) {
  if (intentType === "exercise_replacement" || intentType === "exercise_explanation") {
    return true;
  }

  return referenceMarkerTestRegex.test(message) || modificationIntentTestRegex.test(message);
}

// 受控候选选择器用于接住未来 LLM 选择结果；非法 artifactId 一律降级为歧义或未找到。
export function resolveCandidateSelection(
  artifactId: string | undefined,
  candidates: ReferenceArtifactCandidate[],
  reason = "候选选择结果来自受控解析。",
): ReferenceResolution {
  const candidate = candidates.find((item) => item.artifactId === artifactId);

  if (candidate) {
    return toResolved(candidate, reason, "medium", candidates);
  }

  if (candidates.length > 0) {
    return {
      status: "ambiguous",
      confidence: "low",
      reason: "候选选择结果不在服务端候选集合内，已拒绝该 artifactId。",
      candidates,
      clarificationQuestion: buildClarificationQuestion(candidates),
    };
  }

  return {
    status: "not_found",
    confidence: "low",
    reason: "候选集合为空，无法解析引用对象。",
    candidates: [],
  };
}

export function formatReferenceResolutionForPrompt(resolution: ReferenceResolution | null) {
  if (!resolution) {
    return "";
  }

  return [
    "serverReferenceResolution:",
    JSON.stringify(resolution, null, 2),
    "",
    "完整 artifact payload 只能通过 getArtifactPayload 读取；不要根据 conversationSummary 或候选摘要重建历史训练内容。",
  ].join("\n");
}

export function buildReferenceResolutionReply(resolution: ReferenceResolution) {
  if (resolution.status === "ambiguous") {
    return resolution.clarificationQuestion;
  }

  if (resolution.status === "not_found") {
    return "我没有找到可以安全对应的历史训练内容。你可以把想继续调整的训练名称、目标或大概内容再说具体一点；如果是想重新生成一套，也可以直接说明新的目标、时间和器械条件。";
  }

  return "";
}

function resolveRecentReference(input: {
  message: string;
  inferredKind?: ConversationArtifactKind;
  recentArtifacts: ReferenceArtifactCandidate[];
  allRecentArtifacts: ReferenceArtifactCandidate[];
}): ReferenceResolution | null {
  const source = input.recentArtifacts.length > 0 ? input.recentArtifacts : input.allRecentArtifacts;

  if (source.length === 0) {
    return null;
  }

  if (isLatestReference(input.message)) {
    return toResolved(source[0], "近指引用命中当前会话最近的 active artifact。", "high", source.slice(0, 3));
  }

  if (source.length === 1) {
    return toResolved(source[0], "当前会话只有一个符合类型的 recent artifact。", "high", source);
  }

  if (input.inferredKind && input.recentArtifacts.length === 1) {
    return toResolved(input.recentArtifacts[0], "近指引用结合 artifact 类型后只剩一个候选。", "high", input.recentArtifacts);
  }

  return {
    status: "ambiguous",
    confidence: "low",
    reason: "当前会话存在多个可引用 artifact，用户表达不足以区分。",
    candidates: source.slice(0, 6),
    clarificationQuestion: buildClarificationQuestion(source.slice(0, 6)),
  };
}

function toResolved(
  candidate: ReferenceArtifactCandidate,
  reason: string,
  confidence: "high" | "medium",
  candidates: ReferenceArtifactCandidate[] = [candidate],
): ReferenceResolution {
  return {
    status: "resolved",
    artifactId: candidate.artifactId,
    artifactKind: candidate.kind,
    confidence,
    reason,
    candidates: candidates.slice(0, 6),
  };
}

function buildClarificationQuestion(candidates: ReferenceArtifactCandidate[]) {
  const options = candidates
    .slice(0, 4)
    .map((candidate, index) => {
      const summary = candidate.summary ? `，${candidate.summary}` : "";

      return `${index + 1}. ${candidate.title}${summary}`;
    })
    .join("；");

  return `我找到了几个可能对应的训练内容，请确认你指的是哪一个：${options}`;
}

function inferArtifactKind(message: string, intentType?: ChatIntent["type"]): ConversationArtifactKind | undefined {
  const normalized = normalizeText(message);

  if (intentType === "exercise_replacement" || intentType === "exercise_explanation") {
    if (intentType === "exercise_explanation" && isOrdinalExerciseReference(normalized)) {
      return undefined;
    }

    return /动作|推荐|这批|几个/.test(normalized) ? "exercise_recommendation" : undefined;
  }

  if (/这套|那套|上一套|单次|训练流程|编排|组数|次数|休息|动作组/.test(normalized) && !/长期|周期|计划/.test(normalized)) {
    return "routine";
  }

  if (/长期|周期|每周|周计划|月计划|计划表|计划/.test(normalized)) {
    return "plan";
  }

  if (/动作推荐|推荐动作|这批动作|换一批|换几个/.test(normalized)) {
    return "exercise_recommendation";
  }

  if (/这套|那套|上一套|单次|训练流程|编排|组数|次数|休息|动作组/.test(normalized)) {
    return "routine";
  }

  return undefined;
}

function buildSemanticQuery(message: string) {
  return normalizeText(message)
    .replace(referenceMarkerReplaceRegex, " ")
    .replace(modificationIntentReplaceRegex, " ")
    .replace(/的|一下|帮我|按|把/g, " ")
    .trim();
}

function isRecentReference(message: string) {
  return /这个|这套|这批|这些|那个|那套|刚才|刚刚|上一个|上一套|前一个|前一套|它|该/.test(message) || isOrdinalExerciseReference(message);
}

function isLatestReference(message: string) {
  return /刚才|刚刚|上一个|上一套|前一个|前一套/.test(message) || isOrdinalExerciseReference(message);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function isOrdinalExerciseReference(message: string) {
  return /第([1-9]\d*|一|二|两|三|四|五|六|七|八|九|十)(个|项|组)?(动作|训练)?/.test(normalizeText(message));
}

const referenceMarkerTestRegex = /这个|这套|这批|这些|那个|那套|刚才|刚刚|上一个|上一套|前面|前一个|前一套|之前|上次|它|该/;
const modificationIntentTestRegex = /改成|调整|修改|替换|换成|三周都练|继续练|再来|解释|讲解|说明/;
const referenceMarkerReplaceRegex = /这个|这套|这批|这些|那个|那套|刚才|刚刚|上一个|上一套|前面|前一个|前一套|之前|上次|它|该/g;
const modificationIntentReplaceRegex = /改成|调整|修改|替换|换成|三周都练|继续练|再来|解释|讲解|说明/g;
