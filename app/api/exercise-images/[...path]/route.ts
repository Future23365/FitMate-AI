import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolveExerciseImageRequestPath } from "@/lib/server/exercise-images/local-image-file";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const staticExerciseImageCacheHeader = "public, max-age=31536000, immutable";

// 本地动作图片 Route 只读取配置目录内的公共动作资产，不承载用户私有数据。
export async function GET(_request: Request, context: RouteContext) {
  const { path } = await context.params;
  const resolvedPath = resolveExerciseImageRequestPath(path);

  if (!resolvedPath.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: resolvedPath.code,
        message: resolvedPath.message,
      },
      { status: resolvedPath.status },
    );
  }

  let image: Buffer;

  try {
    image = await fs.readFile(resolvedPath.filePath);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "image_not_found",
        message: "Exercise image not found.",
      },
      { status: 404 },
    );
  }

  return new Response(new Uint8Array(image), {
    headers: {
      "Cache-Control": staticExerciseImageCacheHeader,
      "Content-Type": resolvedPath.contentType,
    },
  });
}
