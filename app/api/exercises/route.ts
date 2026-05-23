import { NextResponse } from "next/server";

import { getExerciseFacets, listExercises } from "@/lib/server/exercises/exercise-service";
import type { ExerciseSort } from "@/lib/shared/exercises/types";

const allowedSorts: ExerciseSort[] = [
  "name_asc",
  "name_desc",
  "level_asc",
  "level_desc",
  "category_asc",
  "category_desc",
];

export async function GET(request: Request) {
  const url = new URL(request.url);

  const result = await listExercises({
    q: getOptionalParam(url, "q"),
    category: getOptionalParam(url, "category"),
    level: getOptionalParam(url, "level"),
    force: getOptionalParam(url, "force"),
    mechanic: getOptionalParam(url, "mechanic"),
    equipment: getOptionalParam(url, "equipment"),
    homeRequirement: getOptionalParam(url, "homeRequirement"),
    muscle: getOptionalParam(url, "muscle"),
    goalTag: getOptionalParam(url, "goalTag"),
    riskTag: getOptionalParam(url, "riskTag"),
    published: getBooleanParam(url, "published"),
    sort: getSortParam(url),
    page: getNumberParam(url, "page"),
    pageSize: getNumberParam(url, "pageSize"),
    limit: getNumberParam(url, "limit"),
    offset: getNumberParam(url, "offset"),
  });

  return NextResponse.json({
    ...result,
    facets: await getExerciseFacets(),
  });
}

function getOptionalParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();
  return value || undefined;
}

function getNumberParam(url: URL, key: string) {
  const value = url.searchParams.get(key);

  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getBooleanParam(url: URL, key: string) {
  const value = url.searchParams.get(key);

  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function getSortParam(url: URL) {
  const value = url.searchParams.get("sort");

  return isExerciseSort(value) ? value : undefined;
}

function isExerciseSort(value: string | null): value is ExerciseSort {
  return allowedSorts.includes(value as ExerciseSort);
}
