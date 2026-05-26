import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { jsonApiError } from "@/lib/server/http/api-error";
import {
  deleteWorkoutSchedule,
  getWorkoutScheduleById,
  updateWorkoutScheduleStatus,
} from "@/lib/server/workouts/workout-persistence-service";
import { workoutScheduleStatusSchema } from "@/lib/shared/workouts/persistence-schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateScheduleSchema = z.object({
  status: workoutScheduleStatusSchema,
});

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getWorkoutScheduleById(decodeURIComponent(id));

  if (!item) {
    return jsonApiError("bad_request", "Workout schedule not found.", 404);
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const payload = updateScheduleSchema.parse(body);
    const item = await updateWorkoutScheduleStatus(decodeURIComponent(id), payload.status);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonApiError("validation_failed", "Invalid workout schedule payload.", 400, error.flatten());
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteWorkoutSchedule(decodeURIComponent(id));

  return new NextResponse(null, { status: 204 });
}
