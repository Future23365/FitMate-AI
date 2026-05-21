import { NextResponse } from "next/server";

import { clearAiTraces, isAiTraceEnabled, listAiTraces } from "@/lib/server/dev/ai-trace-store";

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
