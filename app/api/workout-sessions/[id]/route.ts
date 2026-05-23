import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  deleteScheduledWorkout,
  getScheduledWorkoutById,
  updateScheduledWorkoutStatus,
} from "@/lib/server/workouts/workout-persistence-service";
import { jsonApiError } from "@/lib/server/http/api-error";
import { scheduleStatusSchema } from "@/lib/shared/workouts/persistence-schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSessionSchema = z.object({
  status: scheduleStatusSchema,
});

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getScheduledWorkoutById(decodeURIComponent(id));

  if (!item) {
    return jsonApiError("bad_request", "Workout session not found.", 404);
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const payload = updateSessionSchema.parse(body);
    const item = await updateScheduledWorkoutStatus(decodeURIComponent(id), payload.status);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout session payload.", 400, error.flatten());
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteScheduledWorkout(decodeURIComponent(id));

  return new NextResponse(null, { status: 204 });
}
