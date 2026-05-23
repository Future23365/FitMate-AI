import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  createScheduledWorkout,
  listScheduledWorkouts,
} from "@/lib/server/workouts/workout-persistence-service";
import { jsonApiError } from "@/lib/server/http/api-error";

export async function GET() {
  const items = await listScheduledWorkouts();

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  try {
    const item = await createScheduledWorkout(body);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout session payload.", 400, error.flatten());
    }

    throw error;
  }
}
