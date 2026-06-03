import { NextResponse } from "next/server";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { redactJsonValue } from "@/lib/server/agent-core/redaction";
import { clearAiTraces, isAiTraceEnabled, listAiTracesForUser } from "@/lib/server/dev/ai-trace-store";

type SaveAiTraceLogRequest = {
  logType?: unknown;
  target?: unknown;
  payload?: unknown;
};

type AiTraceSavedLogType = "trace" | "prompt";

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

  const logDir = path.join(process.cwd(), "codex_logs");
  const logPath = path.join(logDir, getLogFileName(logType));
  const savedAt = formatLocalSavedAt(new Date());

  await mkdir(logDir, { recursive: true });

  const payload = normalizeSavedLogPayload(logType, body.payload);

  if (logType === "prompt") {
    await appendFile(logPath, createPromptLogEntryContent(payload, savedAt), "utf8");
  } else {
    await writeFile(logPath, createTraceLogContent(payload, savedAt), "utf8");
  }

  return NextResponse.json({
    ok: true,
    path: logPath,
  });
}

// 保存类型只开放给开发态 trace 页面，用来区分完整链路日志和回归样本问答记录。
function resolveSavedLogType(value: unknown): AiTraceSavedLogType | null {
  if (value === undefined) {
    return "trace";
  }

  if (value === "trace" || value === "prompt") {
    return value;
  }

  return null;
}

function getLogFileName(logType: AiTraceSavedLogType) {
  return logType === "prompt" ? "prompt.js" : "ai_trace_log.js";
}

function getLogFileHeader(logType: AiTraceSavedLogType) {
  return logType === "prompt"
    ? "// User question and answer record saved from /dev/ai-traces for Codex regression testing."
    : "// AI Trace saved from /dev/ai-traces for Codex debugging.";
}

// normalizeSavedLogPayload 在开发态保存入口兜底约束日志形状，避免窄问答记录混入 prompt 或 tool payload。
export function normalizeSavedLogPayload(logType: AiTraceSavedLogType, payload: object) {
  if (logType === "trace") {
    return redactJsonValue(payload) as object;
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

function createTraceLogContent(payload: object, savedAt: string) {
  return [
    getLogFileHeader("trace"),
    `// Saved at: ${savedAt}`,
    "",
    "module.exports = ",
    JSON.stringify(payload, null, 2),
    ";\n",
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
