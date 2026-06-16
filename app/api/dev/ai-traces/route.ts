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

type SavedTraceDedupeTextRecord = {
  recordType: string;
  ref: string;
  refKind: string;
  path: string;
  hash: string;
  originalLength: number;
  preview: unknown;
  content: unknown;
};

type SavedTraceEventRecord = Record<string, unknown> & {
  eventRef?: unknown;
};

type SavedTraceModelInputRecord = Record<string, unknown> & {
  modelInputRef?: unknown;
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
const traceEventFileName = "ai_trace_events.jsonl";
const traceModelInputFileName = "ai_trace_model_inputs.jsonl";
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
    const eventLogPath = path.join(logDir, traceEventFileName);
    const modelInputLogPath = path.join(logDir, traceModelInputFileName);

    await writeFile(logPath, createTraceLogContent(payload.report, savedAt), "utf8");
    await writeFile(eventLogPath, createTraceEventLogContent(payload.events, savedAt), "utf8");
    await writeFile(modelInputLogPath, createTraceModelInputLogContent(payload.modelInputs, savedAt), "utf8");
    await writeFile(textLogPath, createTraceLongTextLogContent(payload.longTexts, payload.details, payload.texts, savedAt), "utf8");

    return NextResponse.json({
      ok: true,
      path: logPath,
      textPath: textLogPath,
      eventPath: eventLogPath,
      modelInputPath: modelInputLogPath,
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
  const isBundle = isRecord(record.report);
  const {
    report: rawReport,
    events: rawEvents,
    modelInputs: rawModelInputs,
    texts: rawTexts,
    longTexts: rawLongTexts,
    details: rawDetails,
    manifest: _manifest,
    rawTrace: _rawTrace,
    trace: _trace,
    ...reportPayload
  } = record;
  const safeReportPayload = redactSensitiveLongTextRefPreviews(isBundle ? rawReport : reportPayload);
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
  const texts = Array.isArray(rawTexts)
    ? rawTexts
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map(normalizeTraceDedupeTextRecord)
    : [];
  const events = Array.isArray(rawEvents)
    ? rawEvents
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map(normalizeTraceEventRecord)
    : [];
  const modelInputs = Array.isArray(rawModelInputs)
    ? rawModelInputs
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map(normalizeTraceModelInputRecord)
    : [];
  const report = redactJsonValue(
    {
      ...(isRecord(safeReportPayload) ? safeReportPayload : {}),
      exportGuide: {
        reportFile: "codex_logs/ai_trace_log.js",
        eventFile: `codex_logs/${traceEventFileName}`,
        modelInputFile: `codex_logs/${traceModelInputFileName}`,
        longTextFile: `codex_logs/${traceLongTextFileName}`,
        eventLookup: `rg '"eventRef":"event_0001"' codex_logs/${traceEventFileName}`,
        modelInputLookup: `rg '"modelInputRef":"model_input_0001"' codex_logs/${traceModelInputFileName}`,
        lookup: `rg '"contentRef":"text_0001"' codex_logs/${traceLongTextFileName}`,
        detailLookup: `rg '"detailRef":"detail_0001"' codex_logs/${traceLongTextFileName}`,
        schemaLookup: `rg '"ref":"schema_0001"' codex_logs/${traceLongTextFileName}`,
        chunkLookup: `rg '"parentRef":"text_0001"' codex_logs/${traceLongTextFileName}`,
        note: "默认先读本报告；eventRef/modelInputRef/contentRef/detailRef 只命中 header，需要完整内容时再用 parentRef 查 chunks。",
        modelVisibleInputBoundary: "contentRef 只表示当前 payload 已包含的长文本被外置；不能据此推断未记录的 prompt、tool description 或 schema description 已保存。模型输入完整性以 modelVisibleInputAudit.completeness 为准。",
      },
    },
    {
      sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
    },
  ) as object;

  return {
    report,
    events,
    modelInputs,
    texts,
    longTexts,
    details,
  };
}

function createTraceLogContent(payload: object, savedAt: string) {
  return [
    getLogFileHeader("trace"),
    `// Saved at: ${savedAt}`,
    "// This is the lightweight AI trace report. Long prompt/model text is stored separately.",
    `// Event file: codex_logs/${traceEventFileName}`,
    `// Model input file: codex_logs/${traceModelInputFileName}`,
    `// Mapping file: codex_logs/${traceLongTextFileName}`,
    `// Event example: rg '\"eventRef\":\"event_0001\"' codex_logs/${traceEventFileName}`,
    `// Model input example: rg '\"modelInputRef\":\"model_input_0001\"' codex_logs/${traceModelInputFileName}`,
    `// Lookup example: rg '\"contentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Detail example: rg '\"detailRef\":\"detail_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Chunk example: rg '\"parentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    "// Workflow: read this report first. eventRef/modelInputRef/contentRef/detailRef finds headers; parentRef finds chunk content.",
    "// Boundary: contentRef only externalizes text already present in the payload; modelVisibleInputAudit.completeness is the source of truth for whether prompt/tool schema was captured.",
    "",
    "module.exports = ",
    JSON.stringify(payload, null, 2),
    ";\n",
  ].join("\n");
}

// ai_trace_events.jsonl 保存按 loop/ref 检索的模型、tool、校验和终态事件。
function createTraceEventLogContent(records: SavedTraceEventRecord[], savedAt: string) {
  return [
    "// AI trace events saved from /dev/ai-traces.",
    `// Saved at: ${savedAt}`,
    "// Read codex_logs/ai_trace_log.js first. Query by eventRef, loopNumber, stepId, or toolName.",
    `// Event: rg '\"eventRef\":\"event_0001\"' codex_logs/${traceEventFileName}`,
    `// Loop: rg '\"loopNumber\":1' codex_logs/${traceEventFileName}`,
    `// Tool: rg '\"toolName\":\"searchExerciseResources\"' codex_logs/${traceEventFileName}`,
    ...records.map((record) => JSON.stringify(record)),
    "",
  ].join("\n");
}

// ai_trace_model_inputs.jsonl 保存模型输入审计摘要和去重 schema/tool catalog 引用。
function createTraceModelInputLogContent(records: SavedTraceModelInputRecord[], savedAt: string) {
  return [
    "// AI trace model inputs saved from /dev/ai-traces.",
    `// Saved at: ${savedAt}`,
    "// Read codex_logs/ai_trace_log.js first. Query by modelInputRef or plannerCallIndex.",
    `// Model input: rg '\"modelInputRef\":\"model_input_0001\"' codex_logs/${traceModelInputFileName}`,
    `// Tool catalog refs resolve in codex_logs/${traceLongTextFileName}.`,
    ...records.map((record) => JSON.stringify(record)),
    "",
  ].join("\n");
}

// ai_trace_texts.jsonl 保存全链路报告外置的长文本、结构化详情和去重 prompt/schema 映射，每次保存覆盖旧内容。
function createTraceLongTextLogContent(
  textRecords: SavedTraceLongTextRecord[],
  detailRecords: SavedTraceDetailRecord[],
  dedupeTextRecords: SavedTraceDedupeTextRecord[],
  savedAt: string,
) {
  const mappingRecords = [
    ...dedupeTextRecords.flatMap(createDedupeTextMappingRecords),
    ...textRecords.flatMap(createTextMappingRecords),
    ...detailRecords.flatMap(createDetailMappingRecords),
  ];

  return [
    "// AI trace mapping saved from /dev/ai-traces.",
    `// Saved at: ${savedAt}`,
    "// Read codex_logs/ai_trace_log.js first. When the report shows contentRef/detailRef/schemaRef/toolCatalogRef, query this file.",
    `// Schema: rg '\"ref\":\"schema_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Tool catalog: rg '\"ref\":\"tool_catalog_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Example: rg '\"contentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Detail: rg '\"detailRef\":\"detail_0001\"' codex_logs/${traceLongTextFileName}`,
    `// Chunks: rg '\"parentRef\":\"text_0001\"' codex_logs/${traceLongTextFileName}`,
    "// Header lookup does not print chunk content. Reassemble chunks by parentRef ordered by chunkIndex.",
    "// Boundary: mapping records cannot recover prompt/tool schema that was never recorded in the trace payload.",
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

function normalizeTraceDedupeTextRecord(item: Record<string, unknown>): SavedTraceDedupeTextRecord {
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
    recordType: getString(item.recordType) ?? "deduped_text",
    ref: getString(item.ref) ?? "schema_unknown",
    refKind: getString(item.refKind) ?? "schema_description",
    path: pathValue,
    hash: getString(item.hash) ?? "",
    originalLength: typeof item.originalLength === "number" ? item.originalLength : 0,
    preview,
    content,
  };
}

function normalizeTraceEventRecord(item: Record<string, unknown>): SavedTraceEventRecord {
  return redactJsonValue(item, {
    sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
    maxStringLength: maxSavedTraceMappingStringLength,
  }) as SavedTraceEventRecord;
}

function normalizeTraceModelInputRecord(item: Record<string, unknown>): SavedTraceModelInputRecord {
  return redactJsonValue(item, {
    sensitiveKeyPatterns: traceLogSensitiveKeyPatterns,
    maxStringLength: maxSavedTraceMappingStringLength,
  }) as SavedTraceModelInputRecord;
}

function createDedupeTextMappingRecords(record: SavedTraceDedupeTextRecord) {
  const content = typeof record.content === "string"
    ? record.content
    : JSON.stringify(record.content) ?? "";
  const chunks = chunkString(content, traceMappingChunkContentLength);

  return [
    {
      recordType: "deduped_text",
      ref: record.ref,
      refKind: record.refKind,
      path: record.path,
      hash: record.hash,
      originalLength: record.originalLength,
      preview: record.preview,
      contentLength: content.length,
      chunkSize: traceMappingChunkContentLength,
      chunkCount: chunks.length,
    },
    ...chunks.map((chunk, index) => ({
      recordType: "deduped_text_chunk",
      parentRef: record.ref,
      chunkIndex: index,
      chunkCount: chunks.length,
      content: chunk,
    })),
  ];
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
