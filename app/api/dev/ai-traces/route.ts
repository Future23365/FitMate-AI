import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { REDACTED_VALUE, redactJsonValue } from "@/lib/server/security/redaction";
import { clearAiTraces, isAiTraceEnabled, listAiTracesForUser } from "@/lib/server/dev/ai-trace-store";
import {
  basicChatFixtureSourcePath,
  parseBasicChatFixtureFromJson,
  type BasicChatFlow,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";

type SaveAiTraceLogRequest = {
  logType?: unknown;
  target?: unknown;
  payload?: unknown;
};

type AiTraceFileLogType = "trace" | "prompt";
type AiTraceSavedLogType = AiTraceFileLogType | "blackbox_case";

type SavedBlackboxCasePayload = {
  title: string;
  userQuestions: Array<{
    round: number;
    question: string;
  }>;
};

type SerializedBasicChatFlow = {
  id: string;
  goal: string;
  turns: Array<{
    userInput: string;
    expectedOutput: string;
  }>;
};

type SavedTraceLongTextRecord = {
  contentRef: string;
  path: string;
  paths: string[];
  kind: string;
  originalLength: number;
  hash: string;
  preview: unknown;
  visibility?: unknown;
  visibilityByPath?: unknown;
  content: unknown;
};

type SavedTraceDetailRecord = {
  detailRef: string;
  path: string;
  kind: string;
  hash: string;
  summary: unknown;
  visibility?: unknown;
  content: unknown;
};

const traceLogSensitiveKeyPatterns = [
  /^api[_-]?key$/i,
  /^authorization$/i,
  /^bearer$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^token$/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /auth[_-]?token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /handler/i,
  /database/i,
  /tool[_-]?output/i,
];
const traceLongTextFileName = "ai_trace_texts.jsonl";
const maxSavedTraceMappingStringLength = Number.MAX_SAFE_INTEGER;
const traceMappingChunkContentLength = 2_000;
const blackboxDefaultExpectedOutput = "只验证本轮有用户可见返回内容。";

export async function GET(request: Request) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  if (!isAiTraceEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI trace log is disabled.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    traces: listAiTracesForUser(currentUser.id),
  });
}

export async function DELETE(request: Request) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  if (!isAiTraceEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI trace log is disabled.",
      },
      { status: 404 },
    );
  }

  clearAiTraces(currentUser.id);

  return NextResponse.json({
    ok: true,
  });
}

export async function POST(request: Request) {
  try {
    await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  if (!isAiTraceEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI trace log is disabled.",
      },
      { status: 404 },
    );
  }

  let body: SaveAiTraceLogRequest;

  try {
    body = (await request.json()) as SaveAiTraceLogRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  if (!body.payload || typeof body.payload !== "object") {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing trace log payload.",
      },
      { status: 400 },
    );
  }

  const logType = resolveSavedLogType(body.logType);

  if (!logType) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid trace log type.",
      },
      { status: 400 },
    );
  }

  if (logType === "blackbox_case") {
    const payload = normalizeSavedBlackboxCasePayload(body.payload);

    if (payload.userQuestions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "当前 Trace 未提取到用户提问。",
        },
        { status: 400 },
      );
    }

    const savedCase = await appendBasicChatBlackboxCase(payload);

    return NextResponse.json({
      ok: true,
      path: savedCase.path,
      flowId: savedCase.flowId,
      turnCount: savedCase.turnCount,
    });
  }

  const logDir = path.join(process.cwd(), "codex_logs");
  const logPath = path.join(logDir, getLogFileName(logType));
  const savedAt = formatLocalSavedAt(new Date());

  await mkdir(logDir, { recursive: true });

  if (logType === "prompt") {
    const payload = normalizeSavedLogPayload(logType, body.payload);

    await appendFile(logPath, createPromptLogEntryContent(payload, savedAt), "utf8");

    return NextResponse.json({
      ok: true,
      path: logPath,
    });
  } else {
    const payload = normalizeSavedTraceLogPayload(body.payload);
    const textLogPath = path.join(logDir, traceLongTextFileName);

    await writeFile(logPath, createTraceLogContent(payload.report, savedAt), "utf8");
    await writeFile(textLogPath, createTraceLongTextLogContent(payload.longTexts, payload.details, savedAt), "utf8");

    return NextResponse.json({
      ok: true,
      path: logPath,
      textPath: textLogPath,
    });
  }
}

// 保存类型只开放给开发态 trace 页面，用来区分完整链路日志和回归样本问答记录。
function resolveSavedLogType(value: unknown): AiTraceSavedLogType | null {
  if (value === undefined) {
    return "trace";
  }

  if (value === "trace" || value === "prompt" || value === "blackbox_case") {
    return value;
  }

  return null;
}

function getLogFileName(logType: AiTraceFileLogType) {
  return logType === "prompt" ? "prompt.js" : "ai_trace_log.js";
}

function getLogFileHeader(logType: AiTraceFileLogType) {
  return logType === "prompt"
    ? "// User question and answer record saved from /dev/ai-traces for Codex regression testing."
    : "// AI Trace saved from /dev/ai-traces for Codex debugging.";
}

// normalizeSavedLogPayload 在开发态保存入口兜底约束日志形状，避免窄问答记录混入 prompt 或 tool payload。
export function normalizeSavedLogPayload(logType: AiTraceFileLogType, payload: object) {
  if (logType === "trace") {
    return normalizeSavedTraceLogPayload(payload).report;
  }

  const record = payload as Record<string, unknown>;
  const trace = isRecord(record.trace) ? record.trace : {};
  const userQuestions = Array.isArray(record.userQuestions)
    ? record.userQuestions
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item, index) => ({
          round: typeof item.round === "number" ? item.round : index + 1,
          question: typeof item.question === "string" ? item.question : "",
        }))
        .filter((item) => item.question.trim().length > 0)
    : [];

  return {
    title: typeof record.title === "string" ? record.title : "用户问答记录",
    savedFrom: "/dev/ai-traces",
    trace: {
      traceId: getString(trace.traceId),
      runId: getString(trace.runId),
      route: getString(trace.route),
      traceTitle: getString(trace.traceTitle),
      status: getString(trace.status),
      createdAt: getString(trace.createdAt),
      endedAt: getString(trace.endedAt),
      durationMs: typeof trace.durationMs === "number" ? trace.durationMs : undefined,
      sessionId: getString(trace.sessionId),
      messageId: getString(trace.messageId),
      promptVersion: getString(trace.promptVersion),
    },
    userQuestions,
    finalAnswer: typeof record.finalAnswer === "string" ? record.finalAnswer : "",
  };
}

// normalizeSavedBlackboxCasePayload 只从 trace 页窄问答 payload 中提取黑盒 fixture 需要的用户提问。
function normalizeSavedBlackboxCasePayload(payload: object): SavedBlackboxCasePayload {
  const promptPayload = normalizeSavedLogPayload("prompt", payload) as Record<string, unknown>;
  const userQuestions = Array.isArray(promptPayload.userQuestions)
    ? promptPayload.userQuestions
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item, index) => ({
          round: typeof item.round === "number" ? item.round : index + 1,
          question: typeof item.question === "string" ? item.question.trim() : "",
        }))
        .filter((item) => item.question.length > 0)
    : [];

  return {
    title: typeof promptPayload.title === "string" && promptPayload.title.trim()
      ? promptPayload.title.trim()
      : "用户问答记录",
    userQuestions,
  };
}

// appendBasicChatBlackboxCase 把当前 trace 提问追加为基础黑盒 flow，并在写入前后复用共享 schema 防止 JSON fixture 损坏。
async function appendBasicChatBlackboxCase(payload: SavedBlackboxCasePayload) {
  const fixturePath = path.join(process.cwd(), basicChatFixtureSourcePath);
  const content = await readFile(fixturePath, "utf8");
  const rawFixture = JSON.parse(content) as unknown;
  const fixture = parseBasicChatFixtureFromJson(rawFixture, fixturePath);
  const newFlow = createBlackboxFlowDraft(payload, fixture.flows);
  const nextFixture = {
    version: 1,
    flows: [
      ...fixture.flows.map(serializeBasicChatFlow),
      newFlow,
    ],
  };

  parseBasicChatFixtureFromJson(nextFixture, fixturePath);
  await writeFile(fixturePath, `${JSON.stringify(nextFixture, null, 2)}\n`, "utf8");

  return {
    path: fixturePath,
    flowId: newFlow.id,
    turnCount: newFlow.turns.length,
  };
}

function createBlackboxFlowDraft(
  payload: SavedBlackboxCasePayload,
  existingFlows: BasicChatFlow[],
): SerializedBasicChatFlow {
  return {
    id: createNextBasicChatFlowId(existingFlows),
    goal: createBlackboxFlowGoal(payload.title),
    turns: payload.userQuestions.map((item) => ({
      userInput: item.question,
      expectedOutput: blackboxDefaultExpectedOutput,
    })),
  };
}

function serializeBasicChatFlow(flow: BasicChatFlow): SerializedBasicChatFlow {
  return {
    id: flow.id,
    goal: flow.goal,
    turns: flow.turns.map((turn) => ({
      userInput: turn.userInput,
      expectedOutput: turn.expectation,
    })),
  };
}

function createNextBasicChatFlowId(flows: BasicChatFlow[]) {
  const maxNumericId = flows.reduce((currentMax, flow) => {
    const match = /^F(\d+)$/.exec(flow.id);

    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return `F${String(maxNumericId + 1).padStart(2, "0")}`;
}

function createBlackboxFlowGoal(title: string) {
  const trimmedTitle = title.trim();

  if (!trimmedTitle || trimmedTitle === "用户问答记录") {
    return "从 /dev/ai-traces 保存的基础聊天回归样本";
  }

  return `从 /dev/ai-traces 保存：${trimmedTitle.slice(0, 80)}`;
}

// normalizeSavedTraceLogPayload 将全链路导出拆成轻量报告和长文本映射，服务端再次执行脱敏兜底。
export function normalizeSavedTraceLogPayload(payload: object) {
  const record = payload as Record<string, unknown>;
  const {
    longTexts: rawLongTexts,
    details: rawDetails,
    rawTrace: _rawTrace,
    trace: _trace,
    ...reportPayload
  } = record;
  const safeReportPayload = redactSensitiveLongTextRefPreviews(reportPayload);
  const longTexts = Array.isArray(rawLongTexts)
    ? rawLongTexts
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map(normalizeTraceLongTextRecord)
    : [];
  const details = Array.isArray(rawDetails)
    ? rawDetails
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map(normalizeTraceDetailRecord)
    : [];
  const report = redactJsonValue(
    {
      ...(isRecord(safeReportPayload) ? safeReportPayload : {}),
      exportGuide: {
        reportFile: "codex_logs/ai_trace_log.js",
        longTextFile: `codex_logs/${traceLongTextFileName}`,
        lookup: `rg '"contentRef":"text_0001"' codex_logs/${traceLongTextFileName}`,
        detailLookup: `rg '"detailRef":"detail_0001"' codex_logs/${traceLongTextFileName}`,
        chunkLookup: `rg '"parentRef":"text_0001"' codex_logs/${traceLongTextFileName}`,
        note: "默认先读本报告；contentRef/detailRef 只命中 header，需要完整内容时再用 parentRef 查 chunks。",
      },
    },
    {
      sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
    },
  ) as object;

  return {
    report,
    longTexts,
    details,
  };
}

function createTraceLogContent(payload: object, savedAt: string) {
  return [
    getLogFileHeader("trace"),
    `// Saved at: ${savedAt}`,
    "// This is the lightweight AI trace report. Long prompt/model text is stored separately.",
    `// Mapping file: codex_logs/${traceLongTextFileName}`,
    `// Lookup example: rg '\"contentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Detail example: rg '\"detailRef\":\"detail_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Chunk example: rg '\"parentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    "// Workflow: read this report first. contentRef/detailRef finds headers; parentRef finds chunk content.",
    "",
    "module.exports = ",
    JSON.stringify(payload, null, 2),
    ";\n",
  ].join("\n");
}

// ai_trace_texts.jsonl 保存全链路报告外置的长文本和结构化详情映射，每次保存覆盖旧内容。
function createTraceLongTextLogContent(
  textRecords: SavedTraceLongTextRecord[],
  detailRecords: SavedTraceDetailRecord[],
  savedAt: string,
) {
  const mappingRecords = [
    ...textRecords.flatMap(createTextMappingRecords),
    ...detailRecords.flatMap(createDetailMappingRecords),
  ];

  return [
    "// AI trace mapping saved from /dev/ai-traces.",
    `// Saved at: ${savedAt}`,
    "// Read codex_logs/ai_trace_log.js first. When the report shows contentRef/detailRef, query this file.",
    `// Example: rg '\"contentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Detail: rg '\"detailRef\":\"detail_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Chunks: rg '\"parentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    "// Header lookup does not print chunk content. Reassemble chunks by parentRef ordered by chunkIndex.",
    ...mappingRecords.map((record) => JSON.stringify(record)),
    "",
  ].join("\n");
}

// prompt.js 是回归样本流水账，每次保存追加一条 records 记录，避免覆盖之前的问答样本。
function createPromptLogEntryContent(payload: object, savedAt: string) {
  return [
    "",
    getLogFileHeader("prompt"),
    `// Saved at: ${savedAt}`,
    "module.exports = module.exports && typeof module.exports === \"object\" ? module.exports : {};",
    "module.exports.records = Array.isArray(module.exports.records) ? module.exports.records : [];",
    "module.exports.records.push(",
    JSON.stringify(payload, null, 2),
    ");\n",
  ].join("\n");
}

// 文档顶部保存时间使用本地时区，方便按本机调试时间回看。
function formatLocalSavedAt(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffsetMinutes / 60);
  const offsetRemainderMinutes = absoluteOffsetMinutes % 60;
  const offset = `${offsetSign}${padDatePart(offsetHours)}:${padDatePart(offsetRemainderMinutes)}`;

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())} ${offset}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeTraceLongTextRecord(item: Record<string, unknown>): SavedTraceLongTextRecord {
  const pathValue = getString(item.path) ?? "$";
  const content = pathContainsSensitiveTraceKey(pathValue)
    ? REDACTED_VALUE
    : redactJsonValue(getString(item.content) ?? "", {
        sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
        maxStringLength: maxSavedTraceMappingStringLength,
      });
  const preview = pathContainsSensitiveTraceKey(pathValue)
    ? REDACTED_VALUE
    : redactJsonValue(item.preview ?? "", {
        sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
      });

  return {
    contentRef: getString(item.contentRef) ?? "text_unknown",
    path: pathValue,
    paths: Array.isArray(item.paths) ? item.paths.filter((path): path is string => typeof path === "string") : [pathValue],
    kind: getString(item.kind) ?? "generic_long_text",
    originalLength: typeof item.originalLength === "number" ? item.originalLength : 0,
    hash: getString(item.hash) ?? "",
    preview,
    visibility: item.visibility === undefined
      ? undefined
      : redactJsonValue(item.visibility, { sensitiveKeyPatterns: traceLogSensitiveKeyPatterns }),
    visibilityByPath: item.visibilityByPath === undefined
      ? undefined
      : redactJsonValue(item.visibilityByPath, { sensitiveKeyPatterns: traceLogSensitiveKeyPatterns }),
    content,
  };
}

function normalizeTraceDetailRecord(item: Record<string, unknown>): SavedTraceDetailRecord {
  const pathValue = getString(item.path) ?? "$";
  const content = pathContainsSensitiveTraceKey(pathValue)
    ? REDACTED_VALUE
    : redactJsonValue(item.content ?? {}, {
        sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
        maxStringLength: maxSavedTraceMappingStringLength,
      });
  const summary = redactJsonValue(item.summary ?? {}, {
    sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
    maxStringLength: maxSavedTraceMappingStringLength,
  });

  return {
    detailRef: getString(item.detailRef) ?? "detail_unknown",
    path: pathValue,
    kind: getString(item.kind) ?? "generic_detail",
    hash: getString(item.hash) ?? "",
    summary,
    visibility: item.visibility === undefined
      ? undefined
      : redactJsonValue(item.visibility, { sensitiveKeyPatterns: traceLogSensitiveKeyPatterns }),
    content,
  };
}

function createTextMappingRecords(record: SavedTraceLongTextRecord) {
  const content = typeof record.content === "string"
    ? record.content
    : JSON.stringify(record.content) ?? "";
  const chunks = chunkString(content, traceMappingChunkContentLength);

  return [
    {
      recordType: "text",
      contentRef: record.contentRef,
      path: record.path,
      paths: record.paths,
      kind: record.kind,
      originalLength: record.originalLength,
      hash: record.hash,
      preview: record.preview,
      visibility: record.visibility,
      visibilityByPath: record.visibilityByPath,
      contentLength: content.length,
      chunkSize: traceMappingChunkContentLength,
      chunkCount: chunks.length,
    },
    ...chunks.map((chunk, index) => ({
      recordType: "text_chunk",
      parentRef: record.contentRef,
      chunkIndex: index,
      chunkCount: chunks.length,
      content: chunk,
    })),
  ];
}

function createDetailMappingRecords(record: SavedTraceDetailRecord) {
  const content = JSON.stringify(record.content, null, 2) ?? "";
  const chunks = chunkString(content, traceMappingChunkContentLength);

  return [
    {
      recordType: "detail",
      detailRef: record.detailRef,
      path: record.path,
      kind: record.kind,
      hash: record.hash,
      summary: record.summary,
      visibility: record.visibility,
      contentType: "json",
      contentLength: content.length,
      chunkSize: traceMappingChunkContentLength,
      chunkCount: chunks.length,
    },
    ...chunks.map((chunk, index) => ({
      recordType: "detail_chunk",
      parentRef: record.detailRef,
      chunkIndex: index,
      chunkCount: chunks.length,
      content: chunk,
    })),
  ];
}

function chunkString(value: string, chunkSize: number) {
  if (value.length === 0) {
    return [""];
  }

  const chunks: string[] = [];

  for (let start = 0; start < value.length; start += chunkSize) {
    chunks.push(value.slice(start, start + chunkSize));
  }

  return chunks;
}

function pathContainsSensitiveTraceKey(pathValue: string) {
  return pathValue
    .split(/[\.\[\]]+/)
    .map((part) => part.replace(/^["']|["']$/g, ""))
    .some((part) => traceLogSensitiveKeyPatterns.some((pattern) => pattern.test(part)));
}

function redactSensitiveLongTextRefPreviews(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveLongTextRefPreviews);
  }

  if (!isRecord(value)) {
    return value;
  }

  const pathValue = getString(value.path);
  const isLongTextRef = typeof value.contentRef === "string" && typeof pathValue === "string";

  if (isLongTextRef && pathContainsSensitiveTraceKey(pathValue)) {
    return {
      ...value,
      preview: REDACTED_VALUE,
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      redactSensitiveLongTextRefPreviews(child),
    ]),
  );
}
