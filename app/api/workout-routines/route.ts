import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { jsonApiError } from "@/lib/server/http/api-error";
import { listWorkoutRoutines, saveWorkoutRoutine } from "@/lib/server/workouts/workout-persistence-service";

export async function GET(request: Request) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const items = await listWorkoutRoutines(currentUser);

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const body = await request.json().catch(() => null);

  try {
    const item = await saveWorkoutRoutine(body, currentUser);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout routine payload.", 400, error.flatten());
    }

    throw error;
  }
}
