import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { jsonApiError } from "@/lib/server/http/api-error";
import { saveWorkoutSessionResult } from "@/lib/server/workouts/workout-persistence-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const item = await saveWorkoutSessionResult(decodeURIComponent(id), body, currentUser);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout result payload.", 400, error.flatten());
    }

    throw error;
  }
}
