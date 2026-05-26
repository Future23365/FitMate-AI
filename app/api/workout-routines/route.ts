import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { jsonApiError } from "@/lib/server/http/api-error";
import { listWorkoutRoutines, saveWorkoutRoutine } from "@/lib/server/workouts/workout-persistence-service";

export async function GET() {
  const items = await listWorkoutRoutines();

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  try {
    const item = await saveWorkoutRoutine(body);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout routine payload.", 400, error.flatten());
    }

    throw error;
  }
}
