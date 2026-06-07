import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { POST as createLocalAnonymousSession } from "@/app/api/auth/local-anonymous/route";
import { POST as postChat } from "@/app/api/chat/route";
import {
  consumeAgentTextChatNdjson,
  getAgentTextChatEventErrorMessage,
  type AgentTextChatEvent,
} from "@/features/chat/api/chat-client";
import type { ChatMessage, ChatVisibleOutput } from "@/features/chat/types";
import {
  getChatConversationById,
  saveChatConversation as saveChatConversationHistory,
} from "@/lib/server/chat/chat-history-service";
import {
  prepareChatRequest,
  type ChatHistoryHydrationMetadata,
} from "@/lib/server/chat/chat-service";
import { getPrismaClient } from "@/lib/server/db/prisma";
import { clearAiTraces, listAiTracesForUser } from "@/lib/server/dev/ai-trace-store";
import {
  buildConversationSummaryContext,
  buildFitnessConversationContext,
  initializeConversationSummary,
  type ConversationSummaryContext,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";

import {
  BasicChatFixtureParseError,
  basicChatFixtureSourcePath,
  readBasicChatFixture,
  summarizeBasicChatFixture,
  type BasicChatFixture,
  type BasicChatFlow,
} from "./basic-chat-fixtures";
import {
  mergeTokenUsage,
  renderBasicChatBlackboxReport,
  isPassingTurnRunStatus,
  summarizeReportText,
  summarizeTokenDiagnostics,
  type BasicChatResponseOutcomeDiagnostic,
  type BasicChatHydrationDiagnostic,
  type BasicChatHydrationSaveDiagnostic,
  type BasicChatSuiteSummary,
  type BasicChatTokenDiagnostics,
  type BasicChatVisibleOutputSummary,
  type BasicChatTurnRunRecord,
} from "./basic-chat-report";

// BasicChatRequestBody 是基础黑盒 runner 允许发送给 /api/chat 的公开页面字段白名单。
export type BasicChatRequestBody = {
  conversationId: string;
  responseMessageId: string;
  latestUserMessage: string;
  conversationSummary: string;
  conversationContext: FitnessConversationContext;
  thinkingEnabled: boolean;
};

export type BasicChatBlackboxRunOptions = {
  sourcePath?: string;
  reportPath?: string;
  flowIds?: string[];
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export type BasicChatBlackboxRunResult = {
  exitCode: number;
  reportPath: string;
  reportMarkdown: string;
  summary: BasicChatSuiteSummary;
  records: BasicChatTurnRunRecord[];
};

type AuthSession = {
  cookie: string;
  userId: string;
};

// NormalizedChatOutput 是 NDJSON stream 到用户可见输出的测试侧归一化结果。
export type NormalizedChatOutput = {
  assistantText: string;
  visibleOutputs: BasicChatVisibleOutputSummary[];
  rawVisibleOutputs: ChatVisibleOutput[];
  assistantSuggestions: string[];
  confirmationRequests: string[];
  safeErrorMessage?: string;
  visibleOutputKinds: string[];
  eventTypes: string[];
  done: boolean;
  errorMessage?: string;
};

const defaultReportPath = "docs/manual-llm-basic-blackbox-latest-report.md";
const defaultChatModel = "deepseek-v4-flash";
const estimatedChatTokensPerTurn = 36_000;
const manualBlackboxUserDisplayNamePrefix = "LLM黑盒测试用户";

// createManualBlackboxUserDisplayName 标记基础黑盒产生的本地匿名用户，方便 Admin 后台和真人匿名用户区分。
export function createManualBlackboxUserDisplayName(userId: string) {
  const suffix = userId.trim().slice(0, 8);

  return suffix
    ? `${manualBlackboxUserDisplayNamePrefix} ${suffix}`
    : manualBlackboxUserDisplayNamePrefix;
}

// createBasicChatBlackboxRunOptionsFromEnv 让专用命令通过 env 传入筛选条件和报告路径。
export function createBasicChatBlackboxRunOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): BasicChatBlackboxRunOptions {
  return {
    env,
    flowIds: parseFlowIds(env.MANUAL_LLM_BASIC_FLOW_IDS),
    reportPath: env.MANUAL_LLM_BASIC_REPORT_PATH,
  };
}

// runBasicChatBlackboxSuite 是基础首页聊天黑盒套件入口，不改生产链路，只通过请求合同执行。
export async function runBasicChatBlackboxSuite(
  options: BasicChatBlackboxRunOptions = {},
): Promise<BasicChatBlackboxRunResult> {
  const env = options.env ?? process.env;
  const startedAt = options.now?.() ?? new Date();
  const reportPath = resolve(process.cwd(), options.reportPath ?? defaultReportPath);
  let fixture: BasicChatFixture;

  try {
    fixture = await readBasicChatFixture(options.sourcePath);
  } catch (error) {
    const preflightErrors = error instanceof BasicChatFixtureParseError
      ? error.errors
      : [error instanceof Error ? error.message : String(error)];
    return writeFinalReport({
      reportPath,
      fixture: {
        sourcePath: options.sourcePath ?? basicChatFixtureSourcePath,
        flows: [],
        stats: { flowCount: 0, turnCount: 0 },
      },
      selectedFlows: [],
      records: [],
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "preflight_failed",
      model: readChatModel(env),
      filterLabel: formatFilterLabel(options.flowIds),
      preflightErrors,
      estimatedTokenTotal: 0,
    });
  }

  const selectedFlowResult = selectFlows(fixture.flows, options.flowIds);
  if (!selectedFlowResult.ok) {
    return writeFinalReport({
      reportPath,
      fixture,
      selectedFlows: [],
      records: [],
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "preflight_failed",
      model: readChatModel(env),
      filterLabel: formatFilterLabel(options.flowIds),
      preflightErrors: [selectedFlowResult.message],
      estimatedTokenTotal: estimateBasicChatTokenUsage(fixture.flows),
    });
  }

  const selectedFlows = selectedFlowResult.flows;
  const estimatedTokenTotal = estimateBasicChatTokenUsage(selectedFlows);
  const model = readChatModel(env);
  const filterLabel = formatFilterLabel(options.flowIds);

  logRunStart({
    model,
    flowCount: selectedFlows.length,
    turnCount: summarizeBasicChatFixture(selectedFlows).turnCount,
    filterLabel,
    reportPath,
    estimatedTokenTotal,
  });

  const records: BasicChatTurnRunRecord[] = [];
  let authSession: AuthSession;

  try {
    authSession = await createManualAuthSession();
    clearAiTraces(authSession.userId);
  } catch (error) {
    records.push(createSuiteErrorRecord({
      failureReason: `本地匿名登录失败：${error instanceof Error ? error.message : String(error)}`,
    }));

    return writeFinalReport({
      reportPath,
      fixture,
      selectedFlows,
      records,
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "failed",
      model,
      filterLabel,
      preflightErrors: [],
      estimatedTokenTotal,
    });
  }

  for (const flow of selectedFlows) {
    const flowRecords = await runBasicChatFlow({
      flow,
      authSession,
    });

    records.push(...flowRecords);
  }

  const failed = records.some((record) => record.executed && !isPassingTurnRunStatus(record.status));

  return writeFinalReport({
    reportPath,
    fixture,
    selectedFlows,
    records,
    startedAt,
    endedAt: options.now?.() ?? new Date(),
    status: failed ? "failed" : "passed",
    model,
    filterLabel,
    preflightErrors: [],
    estimatedTokenTotal,
  });
}

async function runBasicChatFlow(input: {
  flow: BasicChatFlow;
  authSession: AuthSession;
}): Promise<BasicChatTurnRunRecord[]> {
  const records: BasicChatTurnRunRecord[] = [];
  const conversationId = `manual-basic-${input.flow.id}-${randomUUID()}`;
  let savedMessages: ChatMessage[] = [];
  let conversationSummary = "";
  let shouldSkipAfterFirstTurn = false;

  for (const turn of input.flow.turns) {
    if (shouldSkipAfterFirstTurn) {
      records.push({
        flowId: input.flow.id,
        goal: input.flow.goal,
        turnIndex: turn.index,
        userInput: turn.userInput,
        expectation: turn.expectation,
        executed: false,
        status: "skipped",
        finalAssistantTextSummary: "",
        visibleOutputKinds: [],
        skipReason: "第 1 轮基础输出失败，按基础黑盒规则跳过同 flow 后续轮次。",
      });
      continue;
    }

    const userMessage: ChatMessage = {
      id: `user-${randomUUID()}`,
      role: "user",
      content: turn.userInput,
      createdAt: new Date().toISOString(),
    };
    const responseMessageId = `assistant-${randomUUID()}`;
    const requestSummary = buildConversationSummaryContext({
      summary: conversationSummary,
      latestUserMessage: turn.userInput,
    });
    const nextRequestContext = buildFitnessConversationContext([...savedMessages, userMessage]);
    const requestBody = createBasicChatRequestBody({
      conversationId,
      responseMessageId,
      latestUserMessage: requestSummary.latestUserMessage,
      conversationSummary: requestSummary.summary,
      conversationContext: nextRequestContext,
      thinkingEnabled: false,
    });
    const hydrationDiagnostic = await inspectRequestHydration({
      conversationId,
      currentUserId: input.authSession.userId,
      requestBody,
    });

    let record: BasicChatTurnRunRecord;

    try {
      const response = await postChat(jsonRequest("/api/chat", requestBody, input.authSession.cookie));
      const output = await normalizeChatOutput(await response.text());
      const chatTokenDiagnostics = readChatTokenDiagnostics(input.authSession.userId, responseMessageId);
      const responseOutcome = readChatResponseOutcome(input.authSession.userId, responseMessageId);
      if (!output.done) {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: "error",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          assistantSuggestions: output.assistantSuggestions,
          confirmationRequests: output.confirmationRequests,
          safeErrorMessage: output.safeErrorMessage,
          hydration: hydrationDiagnostic,
          responseOutcome,
          chatTokenDiagnostics,
          chatTokenUsage: chatTokenDiagnostics.usage,
          failureReason: output.errorMessage ?? "聊天响应未收到 done 事件。",
        };
        records.push(record);

        if (turn.index === 1) {
          shouldSkipAfterFirstTurn = true;
        }
        continue;
      }

      const assistantMessage: ChatMessage = {
        id: responseMessageId,
        role: "assistant",
        content: output.assistantText || output.safeErrorMessage || "",
        createdAt: new Date().toISOString(),
        suggestedQuestions: output.assistantSuggestions.length ? output.assistantSuggestions : undefined,
        visibleOutputs: output.rawVisibleOutputs.length ? output.rawVisibleOutputs : undefined,
      };
      const persistence = await saveBasicChatConversation({
        conversationId,
        currentUserId: input.authSession.userId,
        messages: [...savedMessages, userMessage, assistantMessage],
        fallbackConversationSummary: conversationSummary,
        fallbackConversationContext: nextRequestContext,
      });

      hydrationDiagnostic.save = persistence.diagnostic;

      if (!persistence.ok) {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: "error",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          assistantSuggestions: output.assistantSuggestions,
          confirmationRequests: output.confirmationRequests,
          safeErrorMessage: output.safeErrorMessage,
          hydration: hydrationDiagnostic,
          responseOutcome,
          chatTokenDiagnostics,
          chatTokenUsage: chatTokenDiagnostics.usage,
          failureReason: persistence.diagnostic.errorMessage ?? "会话保存失败。",
        };
        records.push(record);

        if (turn.index === 1) {
          shouldSkipAfterFirstTurn = true;
        }
        continue;
      }

      savedMessages = persistence.messages;
      conversationSummary = persistence.conversationSummary.summary;

      const visibleAnswer = summarizeBasicVisibleAnswer(output);

      if (visibleAnswer.ok) {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: "passed",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          assistantSuggestions: output.assistantSuggestions,
          confirmationRequests: output.confirmationRequests,
          safeErrorMessage: output.safeErrorMessage,
          hydration: hydrationDiagnostic,
          responseOutcome,
          resultReason: visibleAnswer.reason,
          chatTokenDiagnostics,
          chatTokenUsage: chatTokenDiagnostics.usage,
        };
      } else {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: "failed",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          assistantSuggestions: output.assistantSuggestions,
          confirmationRequests: output.confirmationRequests,
          safeErrorMessage: output.safeErrorMessage,
          hydration: hydrationDiagnostic,
          responseOutcome,
          chatTokenDiagnostics,
          chatTokenUsage: chatTokenDiagnostics.usage,
          failureReason: visibleAnswer.reason,
        };
      }
    } catch (error) {
      record = {
        flowId: input.flow.id,
        goal: input.flow.goal,
        turnIndex: turn.index,
        userInput: turn.userInput,
        expectation: turn.expectation,
        executed: true,
        status: "error",
        finalAssistantTextSummary: "",
        visibleOutputKinds: [],
        hydration: {
          ...hydrationDiagnostic,
          save: { status: "not_attempted" },
        },
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }

    records.push(record);

    if (turn.index === 1 && !isPassingTurnRunStatus(record.status)) {
      shouldSkipAfterFirstTurn = true;
    }
  }

  return records;
}

// createBasicChatRequestBody 固定基础黑盒 runner 的页面公开请求面，避免用 messages 等兼容字段绕过 hydration。
export function createBasicChatRequestBody(input: BasicChatRequestBody): BasicChatRequestBody {
  return {
    conversationId: input.conversationId,
    responseMessageId: input.responseMessageId,
    latestUserMessage: input.latestUserMessage,
    conversationSummary: input.conversationSummary,
    conversationContext: input.conversationContext,
    thinkingEnabled: input.thinkingEnabled,
  };
}

// summarizeBasicVisibleAnswer 是基础黑盒的唯一验收口径：链路完成且用户能看到回答即可。
export function summarizeBasicVisibleAnswer(output: NormalizedChatOutput): { ok: true; reason: string } | { ok: false; reason: string } {
  const visibleParts = [
    output.assistantText.trim() ? "assistant_text" : undefined,
    output.visibleOutputs.length > 0 ? "visible_output" : undefined,
    output.assistantSuggestions.length > 0 ? "suggested_questions" : undefined,
    output.confirmationRequests.length > 0 ? "confirmation_request" : undefined,
    output.safeErrorMessage?.trim() ? "safe_error_message" : undefined,
  ].filter(Boolean);

  if (visibleParts.length > 0) {
    return {
      ok: true,
      reason: `收到用户可见回答：${visibleParts.join(", ")}`,
    };
  }

  return {
    ok: false,
    reason: "聊天响应已结束，但没有 assistant 文本、可见输出、建议提问、确认请求或安全兜底文案。",
  };
}

async function inspectRequestHydration(input: {
  conversationId: string;
  currentUserId: string;
  requestBody: BasicChatRequestBody;
}): Promise<BasicChatHydrationDiagnostic> {
  try {
    const savedConversation = await getChatConversationById(input.conversationId, { id: input.currentUserId });
    const prepared = prepareChatRequest(input.requestBody, { savedConversation });

    return mapHydrationMetadata(prepared.hydration);
  } catch (error) {
    return {
      source: "inspect_failed",
      savedConversationFound: false,
      restoredMessageCount: 0,
      hasSavedConversationContext: false,
      hasClientConversationContext: false,
      save: {
        status: "not_attempted",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function saveBasicChatConversation(input: {
  conversationId: string;
  currentUserId: string;
  messages: ChatMessage[];
  fallbackConversationSummary: string;
  fallbackConversationContext: FitnessConversationContext;
}): Promise<{
  ok: true;
  messages: ChatMessage[];
  conversationSummary: Pick<ConversationSummaryContext, "summary">;
  conversationContext: FitnessConversationContext;
  diagnostic: BasicChatHydrationSaveDiagnostic;
} | {
  ok: false;
  diagnostic: BasicChatHydrationSaveDiagnostic;
}> {
  try {
    const normalizedMessages = input.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt ?? new Date().toISOString(),
    }));
    const conversationContext = buildFitnessConversationContext(normalizedMessages);
    const conversationSummary = initializeConversationSummary(normalizedMessages, {
      summary: input.fallbackConversationSummary,
    });
    const saved = await saveChatConversationHistory({
      id: input.conversationId,
      title: createBasicChatConversationTitle(normalizedMessages),
      updatedAt: new Date().toISOString(),
      messages: normalizedMessages,
      conversationSummary: { summary: conversationSummary.summary },
      conversationContext: conversationContext ?? input.fallbackConversationContext,
    }, { id: input.currentUserId });

    return {
      ok: true,
      messages: saved.messages,
      conversationSummary: saved.conversationSummary ?? { summary: conversationSummary.summary },
      conversationContext: saved.conversationContext ?? conversationContext,
      diagnostic: {
        status: "saved",
        savedMessageCount: saved.messages.length,
        savedVisibleOutputCount: saved.messages.reduce((total, message) => total + (message.visibleOutputs?.length ?? 0), 0),
      },
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function mapHydrationMetadata(metadata: ChatHistoryHydrationMetadata): BasicChatHydrationDiagnostic {
  return {
    source: metadata.source,
    savedConversationFound: metadata.savedConversationFound,
    restoredMessageCount: metadata.restoredMessageCount,
    hasSavedConversationContext: metadata.hasSavedConversationContext,
    hasClientConversationContext: metadata.hasClientConversationContext,
    save: { status: "not_attempted" },
  };
}

function createBasicChatConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "新对话";

  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

async function createManualAuthSession(): Promise<AuthSession> {
  const response = await createLocalAnonymousSession(new Request("http://localhost/api/auth/local-anonymous", {
    method: "POST",
  }));
  const body = await response.json() as { user?: { id?: string } };
  const cookie = extractCookiePair(response.headers.get("set-cookie"));
  const userId = body.user?.id;

  if (!response.ok || !cookie || !userId) {
    throw new Error(`local anonymous auth failed: HTTP ${response.status}`);
  }

  await markManualBlackboxUser(userId);

  return { cookie, userId };
}

async function markManualBlackboxUser(userId: string) {
  try {
    await getPrismaClient().user.update({
      where: { id: userId },
      data: {
        displayName: createManualBlackboxUserDisplayName(userId),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`local anonymous auth user marker failed: ${message}`);
  }
}

// normalizeChatOutput 复用生产 NDJSON parser，并只投影最终用户可见内容给 runner。
export async function normalizeChatOutput(rawNdjson: string): Promise<NormalizedChatOutput> {
  const events: AgentTextChatEvent[] = [];
  await consumeAgentTextChatNdjson(new Response(rawNdjson), (event) => {
    events.push(event);
  });
  let assistantText = "";
  let done = false;
  let errorMessage: string | undefined;
  let safeErrorMessage: string | undefined;
  const visibleOutputs: BasicChatVisibleOutputSummary[] = [];
  const rawVisibleOutputs: ChatVisibleOutput[] = [];
  const assistantSuggestions: string[] = [];
  const confirmationRequests: string[] = [];
  const eventTypes: string[] = [];

  for (const event of events) {
    eventTypes.push(event.type);

    if (event.type === "content") {
      assistantText += event.content;
    }

    if (event.type === "visible_output") {
      visibleOutputs.push({
        outputType: event.outputType,
        schemaVersion: event.schemaVersion,
        summary: summarizeUnknown(event.content ?? event.payload),
      });
      rawVisibleOutputs.push({
        outputType: event.outputType,
        schemaVersion: event.schemaVersion,
        payload: event.payload,
        content: event.content,
      });
    }

    if (event.type === "suggested_questions") {
      assistantSuggestions.push(...event.suggestedQuestions);
    }

    if (event.type === "confirmation_request") {
      confirmationRequests.push(event.message);
    }

    if (event.type === "error") {
      safeErrorMessage = getAgentTextChatEventErrorMessage(event);
      errorMessage = safeErrorMessage;
      if (!assistantText) {
        assistantText = safeErrorMessage;
      }
    }

    if (event.type === "done") {
      done = true;
    }
  }

  return {
    assistantText,
    visibleOutputs,
    rawVisibleOutputs,
    assistantSuggestions,
    confirmationRequests,
    safeErrorMessage,
    visibleOutputKinds: visibleOutputs.map((output) => `${output.outputType}@${output.schemaVersion}`),
    eventTypes,
    done,
    errorMessage: done ? errorMessage : errorMessage ?? "聊天响应未收到 done 事件。",
  };
}

async function writeFinalReport(input: {
  reportPath: string;
  fixture: BasicChatFixture;
  selectedFlows: BasicChatFlow[];
  records: BasicChatTurnRunRecord[];
  startedAt: Date;
  endedAt: Date;
  status: BasicChatSuiteSummary["status"];
  model: string;
  filterLabel: string;
  preflightErrors: string[];
  estimatedTokenTotal: number;
}): Promise<BasicChatBlackboxRunResult> {
  const executedRecords = input.records.filter((record) => record.executed);
  const summary: BasicChatSuiteSummary = {
    status: input.status,
    model: input.model,
    sourcePath: input.fixture.sourcePath,
    reportPath: input.reportPath,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    selectedFlowIds: input.selectedFlows.map((flow) => flow.id),
    filterLabel: input.filterLabel,
    fullFlowCount: input.fixture.stats.flowCount,
    fullTurnCount: input.fixture.stats.turnCount,
    executedFlowCount: new Set(executedRecords.map((record) => record.flowId)).size,
    executedTurnCount: executedRecords.length,
    passedTurnCount: input.records.filter((record) => isPassingTurnRunStatus(record.status)).length,
    failedTurnCount: input.records.filter((record) => (
      record.executed && !isPassingTurnRunStatus(record.status)
    )).length,
    skippedTurnCount: input.records.filter((record) => record.status === "skipped").length,
    estimatedTokenTotal: input.estimatedTokenTotal,
    actualChatTokenUsage: mergeTokenUsage(input.records.map((record) => record.chatTokenUsage)),
    chatTokenDiagnosticsSummary: summarizeTokenDiagnostics(input.records.map((record) => record.chatTokenDiagnostics)),
    preflightErrors: input.preflightErrors,
  };
  const reportMarkdown = renderBasicChatBlackboxReport({
    summary,
    flows: input.selectedFlows.length ? input.selectedFlows : input.fixture.flows,
    records: input.records,
  });

  await mkdir(dirname(input.reportPath), { recursive: true });
  await writeFile(input.reportPath, reportMarkdown, "utf8");

  return {
    exitCode: summary.status === "passed" ? 0 : 1,
    reportPath: input.reportPath,
    reportMarkdown,
    summary,
    records: input.records,
  };
}

function selectFlows(flows: BasicChatFlow[], flowIds: string[] | undefined):
  | { ok: true; flows: BasicChatFlow[] }
  | { ok: false; message: string } {
  if (!flowIds || flowIds.length === 0) {
    return { ok: true, flows };
  }

  const flowById = new Map(flows.map((flow) => [flow.id, flow]));
  const unknown = flowIds.filter((id) => !flowById.has(id));

  if (unknown.length > 0) {
    return {
      ok: false,
      message: `未知 flow id：${unknown.join(", ")}。可用 id：${flows.map((flow) => flow.id).join(", ")}`,
    };
  }

  return { ok: true, flows: flowIds.map((id) => flowById.get(id)!) };
}

function readChatTokenDiagnostics(userId: string, responseMessageId: string): BasicChatTokenDiagnostics {
  try {
    const trace = listAiTracesForUser(userId).find((item) => item.messageId === responseMessageId);
    const usage = trace?.metadata?.tokenUsageSummary;

    if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
      return {
        source: "dev_trace_store",
        status: "missing",
        reason: "trace token usage not found",
      };
    }

    const record = usage as Record<string, unknown>;
    const promptTokens = readNumber(record.prompt_tokens);
    const completionTokens = readNumber(record.completion_tokens);
    const totalTokens = readNumber(record.total_tokens) ?? (
      promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined
    );

    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
      return {
        source: "dev_trace_store",
        status: "missing",
        reason: "trace token usage is empty",
      };
    }

    return {
      source: "dev_trace_store",
      status: "available",
      usage: {
        promptTokens: promptTokens ?? 0,
        completionTokens: completionTokens ?? 0,
        totalTokens: totalTokens ?? 0,
      },
    };
  } catch (error) {
    return {
      source: "dev_trace_store",
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function readChatResponseOutcome(userId: string, responseMessageId: string): BasicChatResponseOutcomeDiagnostic {
  try {
    const trace = listAiTracesForUser(userId).find((item) => item.messageId === responseMessageId);

    if (!trace?.finalDecision) {
      return { status: "missing" };
    }

    const projectionType = trace.finalDecision.reason;
    if (!projectionType) {
      return { status: "missing" };
    }

    const finalizerGateStep = trace.steps.find((step) => step.name === "Terminal failure finalizer gate");
    const finalizerOutput = isRecord(finalizerGateStep?.output) ? finalizerGateStep.output : {};

    return {
      status: classifyChatResponseOutcome(projectionType, trace.finalDecision.status),
      projectionType,
      mainAgentFailureCode: trace.finalDecision.code,
      finalizerCalled: readBoolean(finalizerOutput.finalizerCalled),
      finalizerSkippedReason: readString(finalizerOutput.skippedReason),
      finalizerDegradedReason: readString(finalizerOutput.degradedReason),
    };
  } catch {
    return { status: "missing" };
  }
}

function classifyChatResponseOutcome(
  projectionType: string,
  finalDecisionStatus: string,
): BasicChatResponseOutcomeDiagnostic["status"] {
  if (projectionType === "terminal_failure_finalizer") {
    return "terminal_failure_finalizer";
  }

  if (projectionType === "provider_unavailable_fallback") {
    return "provider_unavailable";
  }

  if (projectionType.endsWith("_fallback")) {
    return "deterministic_fallback";
  }

  if (finalDecisionStatus === "success") {
    return "main_agent_completed";
  }

  return "hard_failure";
}

function jsonRequest(url: string, body: unknown, cookie: string) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

function estimateBasicChatTokenUsage(flows: BasicChatFlow[]) {
  const textLength = flows.reduce((total, flow) => (
    total
    + flow.goal.length
    + flow.turns.reduce((turnTotal, turn) => turnTotal + turn.userInput.length + turn.expectation.length, 0)
  ), 0);
  const turnCount = summarizeBasicChatFixture(flows).turnCount;

  return Math.ceil(textLength / 2) + turnCount * estimatedChatTokensPerTurn;
}

function logRunStart(input: {
  model: string;
  flowCount: number;
  turnCount: number;
  filterLabel: string;
  reportPath: string;
  estimatedTokenTotal: number;
}) {
  console.log([
    `基础 LLM 黑盒套件启动`,
    `模型：${input.model}`,
    `验收口径：收到 done 且存在用户可见回答`,
    `flow 数：${input.flowCount}`,
    `turn 数：${input.turnCount}`,
    `筛选条件：${input.filterLabel}`,
    `报告路径：${input.reportPath}`,
    `预计 token 消耗：约 ${input.estimatedTokenTotal}`,
  ].join("\n"));
}

function createSuiteErrorRecord(input: { failureReason: string }): BasicChatTurnRunRecord {
  return {
    flowId: "(suite)",
    goal: "基础黑盒套件启动",
    turnIndex: 0,
    userInput: "",
    expectation: "",
    executed: false,
    status: "error",
    finalAssistantTextSummary: "",
    visibleOutputKinds: [],
    failureReason: input.failureReason,
  };
}

function extractCookiePair(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error("Missing Set-Cookie header.");
  }

  return setCookieHeader.split(";")[0];
}

function summarizeUnknown(value: unknown) {
  try {
    return summarizeReportText(JSON.stringify(value));
  } catch {
    return summarizeReportText(String(value));
  }
}

function parseFlowIds(value: string | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatFilterLabel(flowIds: string[] | undefined) {
  return flowIds && flowIds.length > 0 ? flowIds.join(", ") : "全部 flow";
}

function readChatModel(env: NodeJS.ProcessEnv) {
  return env.DEEPSEEK_MODEL?.trim() || defaultChatModel;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
