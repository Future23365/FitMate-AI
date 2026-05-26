import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { jsonApiError } from "@/lib/server/http/api-error";
import {
  deleteWorkoutRoutine,
  getWorkoutRoutineById,
  saveWorkoutRoutine,
} from "@/lib/server/workouts/workout-persistence-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getWorkoutRoutineById(decodeURIComponent(id));

  if (!item) {
    return jsonApiError("bad_request", "Workout routine not found.", 404);
  }

  return NextResponse.json({ item });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const item = await saveWorkoutRoutine({
      ...(body as Parameters<typeof saveWorkoutRoutine>[0]),
      id: decodeURIComponent(id),
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout routine payload.", 400, error.flatten());
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteWorkoutRoutine(decodeURIComponent(id));

  return new NextResponse(null, { status: 204 });
}
