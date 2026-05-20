import { NextResponse } from "next/server";

import { getExerciseById } from "@/lib/exercises/exercise-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const exercise = await getExerciseById(decodeURIComponent(id));

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
  }

  return NextResponse.json({ item: exercise });
}
