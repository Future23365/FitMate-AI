import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { startAiTrace, summarizeLatestUserMessage } from "@/lib/server/dev/ai-trace-logger";
import {
  aiWorkoutPlanRequestSchema,
  generateAiWorkoutPlanDraft,
} from "@/lib/server/workout-plans";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = aiWorkoutPlanRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request body.",
        detail: parsedRequest.error.flatten(),
      },
      { status: 400 },
    );
  }

  const trace = startAiTrace({
    route: "/api/ai/workout-plan",
    title: summarizeLatestUserMessage(parsedRequest.data.messages),
    metadata: {
      messageCount: parsedRequest.data.messages.length,
      hasClientIntent: Boolean(parsedRequest.data.intent),
    },
  });

  trace.addStep({
    name: "训练计划生成请求",
    type: "user_input",
    input: parsedRequest.data,
  });

  try {
    const result = await generateAiWorkoutPlanDraft(parsedRequest.data, { trace });
    trace.addStep({
      name: "训练计划接口结果",
      type: "final_response",
      status: result.ok ? "success" : "failed",
      output: result,
    });
    trace.finish(result.ok ? "success" : "failed");

    return NextResponse.json(result, { status: resolveStatus(result) });
  } catch (error) {
    trace.addStep({
      name: "训练计划接口异常",
      type: "error",
      status: "failed",
      error,
    });
    trace.finish("failed");

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Request validation failed.",
          detail: error.flatten(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate workout plan.",
        detail: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

function resolveStatus(result: Awaited<ReturnType<typeof generateAiWorkoutPlanDraft>>) {
  if (result.ok) {
    return 200;
  }

  switch (result.code) {
    case "missing_api_key":
      return 500;
    case "high_risk_health_condition":
    case "candidate_actions_insufficient":
    case "intent_extraction_failed":
    case "invalid_json":
    case "invalid_ai_output":
    case "plan_validation_failed":
      return 422;
    case "ai_request_failed":
    default:
      return 502;
  }
}
