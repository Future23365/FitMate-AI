import "server-only";

import path from "node:path";

import {
  getExerciseImageConfig,
  resolveExerciseImageLocalDir,
  type ExerciseImageConfig,
  type ExerciseImageConfigInput,
} from "@/lib/server/exercise-images/config";

// 图片 Route 路径解析结果携带文件路径或可直接返回给客户端的错误边界。
export type ExerciseImageRequestPathResult =
  | {
      ok: true;
      filePath: string;
      contentType: string;
    }
  | {
      ok: false;
      status: 400 | 404;
      code: "invalid_image_path" | "unsupported_image_type" | "image_not_found";
      message: string;
    };

const imageContentTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

// Route 路径校验集中在这里，确保 API 和 resolver 对允许的本地图片路径保持同一套边界。
export function resolveExerciseImageRequestPath(
  rawSegments: string[] | undefined,
  input: ExerciseImageConfigInput = {},
): ExerciseImageRequestPathResult {
  const config = getExerciseImageConfig(input);
  const decodedSegments = decodeImagePathSegments(rawSegments);

  if (!decodedSegments.ok) {
    return decodedSegments;
  }

  const contentType = getExerciseImageContentType(decodedSegments.segments.at(-1) ?? "");

  if (!contentType) {
    return {
      ok: false,
      status: 400,
      code: "unsupported_image_type",
      message: "Unsupported exercise image file type.",
    };
  }

  const rootDir = resolveExerciseImageLocalDir(config);
  const filePath = path.resolve(rootDir, ...decodedSegments.segments);

  if (!isPathInsideDirectory(filePath, rootDir)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_image_path",
      message: "Exercise image path is outside the configured directory.",
    };
  }

  return {
    ok: true,
    filePath,
    contentType,
  };
}

// Content-Type 映射只允许动作图片资产使用的安全图片扩展名。
export function getExerciseImageContentType(fileName: string) {
  return imageContentTypes.get(path.extname(fileName).toLowerCase()) ?? null;
}

// resolver 使用同一套路径段校验，避免生成 Route 会拒绝的本地 URL。
export function isAllowedExerciseImagePathSegments(segments: string[]) {
  return decodeImagePathSegments(segments).ok && Boolean(getExerciseImageContentType(segments.at(-1) ?? ""));
}

// 目录边界判断用于阻止路径穿越和绝对路径逃逸到配置目录之外。
export function isPathInsideDirectory(filePath: string, rootDir: string) {
  const relativePath = path.relative(rootDir, filePath);

  return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function decodeImagePathSegments(rawSegments: string[] | undefined):
  | { ok: true; segments: string[] }
  | Extract<ExerciseImageRequestPathResult, { ok: false }> {
  if (!rawSegments?.length) {
    return {
      ok: false,
      status: 400,
      code: "invalid_image_path",
      message: "Exercise image path is required.",
    };
  }

  const segments: string[] = [];

  for (const rawSegment of rawSegments) {
    let segment: string;

    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return {
        ok: false,
        status: 400,
        code: "invalid_image_path",
        message: "Exercise image path contains invalid escape sequences.",
      };
    }

    if (
      !segment.trim() ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\0") ||
      segment.includes("/") ||
      segment.includes("\\") ||
      path.isAbsolute(segment)
    ) {
      return {
        ok: false,
        status: 400,
        code: "invalid_image_path",
        message: "Exercise image path contains unsafe segments.",
      };
    }

    segments.push(segment);
  }

  return { ok: true, segments };
}
