import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  buildExerciseImagePublicUrl,
  defaultExerciseImagePublicBaseUrl,
  getExerciseImageConfig,
  resolveExerciseImageLocalDir,
  type ExerciseImageConfig,
  type ExerciseImageConfigInput,
} from "@/lib/server/exercise-images/config";
import {
  isAllowedExerciseImagePathSegments,
  isPathInsideDirectory,
} from "@/lib/server/exercise-images/local-image-file";
import type { Exercise } from "@/lib/shared/exercises/types";

type ExerciseImageSource = Pick<Exercise, "id" | "images" | "imageUrls">;

type ManifestImageRecord = {
  exerciseId?: unknown;
  stepIndex?: unknown;
  sourceImagePath?: unknown;
  sourceUrl?: unknown;
  localPath?: unknown;
  status?: unknown;
};

type ManifestFile = {
  images?: unknown;
};

type ManifestImageRef = {
  stepIndex: number;
  segments: string[];
};

type ManifestIndex = Map<string, Map<number, ManifestImageRef>>;

const manifestIndexCache = new Map<string, ManifestIndex | null>();

// 动作图片 resolver 是服务端展示 URL 的统一出口，保留数据库原始来源并只派生前端可访问地址。
export function resolveExerciseImageUrls(exercise: ExerciseImageSource, input: ExerciseImageConfigInput = {}) {
  const config = getExerciseImageConfig(input);
  const localDir = resolveExerciseImageLocalDir(config);
  const manifestIndex = loadExerciseImageManifestIndex(config);
  const manifestByStep = manifestIndex?.get(exercise.id) ?? new Map<number, ManifestImageRef>();
  const sourceCount = Math.max(exercise.images.length, exercise.imageUrls.length);
  const stepIndexes = collectStepIndexes(sourceCount, manifestByStep);
  const imageUrls = stepIndexes
    .map((stepIndex) => {
      const segments = resolveExerciseImagePathSegments(exercise, stepIndex, manifestByStep, config, localDir);

      return segments
        ? buildExerciseImagePublicUrl(segments, config)
        : resolveExistingDisplayImageUrl(exercise.imageUrls[stepIndex]);
    })
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
  const uniqueImageUrls = dedupeStrings(imageUrls);

  return uniqueImageUrls.length ? uniqueImageUrls : getFallbackImageUrls(config);
}

// 单图入口服务推荐卡等只需要首张展示图的业务出口。
export function resolveExerciseImageUrl(exercise: ExerciseImageSource, input: ExerciseImageConfigInput = {}) {
  return resolveExerciseImageUrls(exercise, input)[0] ?? getExerciseImageConfig(input).fallbackUrl;
}

// repository 映射层用该函数把原始 Exercise 事实转换为当前环境可展示的 Exercise。
export function withResolvedExerciseImageUrls<T extends Exercise>(exercise: T, input: ExerciseImageConfigInput = {}): T {
  return {
    ...exercise,
    imageUrls: resolveExerciseImageUrls(exercise, input),
  };
}

// 测试和长进程配置切换时可清空 manifest 缓存，避免复用旧索引。
export function clearExerciseImageResolverCache() {
  manifestIndexCache.clear();
}

function loadExerciseImageManifestIndex(config: ExerciseImageConfig) {
  const localDir = resolveExerciseImageLocalDir(config);
  const manifestPath = path.join(localDir, "_manifest.json");
  const cacheKey = `${localDir}:${config.publicBaseUrl}`;

  if (manifestIndexCache.has(cacheKey)) {
    return manifestIndexCache.get(cacheKey) ?? null;
  }

  const index = readManifestIndex(manifestPath, localDir, config);
  manifestIndexCache.set(cacheKey, index);

  return index;
}

function getFallbackImageUrls(config: ExerciseImageConfig) {
  const fallbackUrl = config.fallbackUrl.trim();

  return fallbackUrl ? [fallbackUrl] : [];
}

function readManifestIndex(manifestPath: string, localDir: string, config: ExerciseImageConfig): ManifestIndex | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ManifestFile;

    if (!Array.isArray(manifest.images)) {
      return null;
    }

    const index: ManifestIndex = new Map();

    for (const rawRecord of manifest.images) {
      const record = rawRecord as ManifestImageRecord;
      const ref = toManifestImageRef(record, localDir, config);

      if (!ref || typeof record.exerciseId !== "string") {
        continue;
      }

      const byStep = index.get(record.exerciseId) ?? new Map<number, ManifestImageRef>();
      byStep.set(ref.stepIndex, ref);
      index.set(record.exerciseId, byStep);
    }

    return index;
  } catch {
    return null;
  }
}

function toManifestImageRef(record: ManifestImageRecord, localDir: string, config: ExerciseImageConfig) {
  if (
    typeof record.exerciseId !== "string" ||
    typeof record.stepIndex !== "number" ||
    !Number.isInteger(record.stepIndex) ||
    record.stepIndex < 0 ||
    record.status === "failed"
  ) {
    return null;
  }

  const segments = resolveManifestPathSegments(record, localDir);

  if (!segments || !isUsableLocalImageSegments(segments, config, localDir)) {
    return null;
  }

  return {
    stepIndex: record.stepIndex,
    segments,
  } satisfies ManifestImageRef;
}

function resolveManifestPathSegments(record: ManifestImageRecord, localDir: string) {
  if (typeof record.localPath === "string") {
    const fromLocalPath = toRelativeImagePathSegments(record.localPath, localDir);

    if (fromLocalPath) {
      return fromLocalPath;
    }
  }

  if (typeof record.sourceImagePath === "string") {
    return toSafeImagePathSegments(record.sourceImagePath);
  }

  if (typeof record.sourceUrl === "string") {
    return toSafeImagePathSegments(extractExerciseImagePathFromUrl(record.sourceUrl));
  }

  return null;
}

function resolveExerciseImagePathSegments(
  exercise: ExerciseImageSource,
  stepIndex: number,
  manifestByStep: Map<number, ManifestImageRef>,
  config: ExerciseImageConfig,
  localDir: string,
) {
  const manifestRef = manifestByStep.get(stepIndex);

  if (manifestRef && isUsableLocalImageSegments(manifestRef.segments, config, localDir)) {
    return manifestRef.segments;
  }

  const sourceSegments = resolveSourceImageSegments(exercise, stepIndex);

  if (sourceSegments && isUsableLocalImageSegments(sourceSegments, config, localDir)) {
    return sourceSegments;
  }

  const deterministicSegments = [exercise.id, `${stepIndex}.jpg`];

  return isUsableLocalImageSegments(deterministicSegments, config, localDir) ? deterministicSegments : null;
}

function resolveSourceImageSegments(exercise: ExerciseImageSource, stepIndex: number) {
  const imagePath = exercise.images[stepIndex];
  const imageUrl = exercise.imageUrls[stepIndex];

  return toSafeImagePathSegments(imagePath) ?? toSafeImagePathSegments(extractExerciseImagePathFromUrl(imageUrl));
}

function toRelativeImagePathSegments(localPath: string, localDir: string) {
  const filePath = path.resolve(localPath);

  if (!isPathInsideDirectory(filePath, localDir)) {
    return null;
  }

  return toSafeImagePathSegments(path.relative(localDir, filePath));
}

function toSafeImagePathSegments(imagePath: string | null | undefined) {
  if (!imagePath) {
    return null;
  }

  const normalizedPath = imagePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const segments = normalizedPath.split("/").filter(Boolean);

  return isAllowedExerciseImagePathSegments(segments) ? segments : null;
}

function extractExerciseImagePathFromUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return null;
  }

  try {
    const url = new URL(imageUrl);
    const match = url.pathname.match(/\/exercises\/(.+)$/);

    return match?.[1] ?? null;
  } catch {
    return imageUrl;
  }
}

function resolveExistingDisplayImageUrl(imageUrl: string | null | undefined) {
  const trimmedImageUrl = imageUrl?.trim();

  if (!trimmedImageUrl || isGitHubExerciseSourceUrl(trimmedImageUrl)) {
    return null;
  }

  try {
    new URL(trimmedImageUrl);
    return trimmedImageUrl;
  } catch {
    return trimmedImageUrl.startsWith("/") ? trimmedImageUrl : null;
  }
}

function isGitHubExerciseSourceUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);

    return url.hostname === "raw.githubusercontent.com" && url.pathname.includes("/exercises/");
  } catch {
    return false;
  }
}

function isUsableLocalImageSegments(segments: string[], config: ExerciseImageConfig, localDir: string) {
  if (!isAllowedExerciseImagePathSegments(segments)) {
    return false;
  }

  if (!shouldVerifyLocalImageFile(config)) {
    return true;
  }

  const filePath = path.resolve(localDir, ...segments);

  return isPathInsideDirectory(filePath, localDir) && fs.existsSync(filePath);
}

function shouldVerifyLocalImageFile(config: ExerciseImageConfig) {
  return config.publicBaseUrl === defaultExerciseImagePublicBaseUrl;
}

function collectStepIndexes(sourceCount: number, manifestByStep: Map<number, ManifestImageRef>) {
  const stepIndexes = new Set<number>();

  for (let index = 0; index < sourceCount; index += 1) {
    stepIndexes.add(index);
  }

  for (const stepIndex of manifestByStep.keys()) {
    stepIndexes.add(stepIndex);
  }

  return [...stepIndexes].sort((left, right) => left - right);
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}
