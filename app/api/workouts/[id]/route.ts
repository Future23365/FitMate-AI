import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  deleteSavedWorkout,
  getSavedWorkoutById,
  saveWorkout,
} from "@/lib/server/workouts/workout-persistence-service";
import { jsonApiError } from "@/lib/server/http/api-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getSavedWorkoutById(decodeURIComponent(id));

  if (!item) {
    return jsonApiError("bad_request", "Workout not found.", 404);
  }

  return NextResponse.json({ item });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const item = await saveWorkout({
      ...(body as Parameters<typeof saveWorkout>[0]),
      id: decodeURIComponent(id),
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout payload.", 400, error.flatten());
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteSavedWorkout(decodeURIComponent(id));

  return new NextResponse(null, { status: 204 });
}
