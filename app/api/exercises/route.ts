import { NextResponse } from "next/server";

import { getExerciseFacets, listExercises } from "@/lib/server/exercises/exercise-service";
import { jsonApiError } from "@/lib/server/http/api-error";
import { exerciseListQuerySchema } from "@/lib/shared/exercises/query-schema";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedQuery = exerciseListQuerySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsedQuery.success) {
    return jsonApiError(
      "validation_failed",
      "Invalid exercise query parameters.",
      400,
      parsedQuery.error.flatten(),
    );
  }

  const result = await listExercises(parsedQuery.data);

  return NextResponse.json({
    ...result,
    facets: await getExerciseFacets(),
  });
}
