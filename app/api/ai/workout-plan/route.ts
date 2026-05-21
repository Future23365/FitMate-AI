import { NextResponse } from "next/server";
import { ZodError } from "zod";

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

  try {
    const result = await generateAiWorkoutPlanDraft(parsedRequest.data);

    return NextResponse.json(result, { status: resolveStatus(result) });
  } catch (error) {
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
