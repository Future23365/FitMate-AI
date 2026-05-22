import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { clearAiTraces, isAiTraceEnabled, listAiTraces } from "@/lib/server/dev/ai-trace-store";

type SaveAiTraceLogRequest = {
  target?: unknown;
  payload?: unknown;
};

export async function GET() {
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
    traces: listAiTraces(),
  });
}

export async function DELETE() {
  if (!isAiTraceEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI trace log is disabled.",
      },
      { status: 404 },
    );
  }

  clearAiTraces();

  return NextResponse.json({
    ok: true,
  });
}

export async function POST(request: Request) {
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

  const logDir = path.join(process.cwd(), "codex_logs");
  const logPath = path.join(logDir, "last_log.js");
  const content = [
    "// AI Trace saved from /dev/ai-traces for Codex debugging.",
    `// Saved at: ${new Date().toISOString()}`,
    "module.exports = ",
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        target: body.target ?? null,
        payload: body.payload,
      },
      null,
      2,
    ),
    ";\n",
  ].join("");

  await mkdir(logDir, { recursive: true });
  await writeFile(logPath, content, "utf8");

  return NextResponse.json({
    ok: true,
    path: logPath,
  });
}
