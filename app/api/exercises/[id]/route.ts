import { NextResponse } from "next/server";

import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { getExerciseById } from "@/lib/server/exercises/exercise-service";
import { jsonApiError } from "@/lib/server/http/api-error";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const { id } = await context.params;
  const exercise = await getExerciseById(decodeURIComponent(id));

  if (!exercise) {
    return jsonApiError("bad_request", "Exercise not found.", 404);
  }

  return NextResponse.json({ item: exercise });
}
