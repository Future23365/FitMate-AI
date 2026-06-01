import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_CONNECTION_STRING =
  process.env.DATABASE_URL ?? "postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public";
const DEFAULT_OUTPUT_DIR = "exercises_picture";
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const RAW_GITHUB_EXERCISE_BASE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

const helpText = `
Usage:
  node scripts/download-exercise-images.mjs [options]

Options:
  --output <dir>          图片输出目录，默认 exercises_picture
  --concurrency <number>  并发下载数，默认 8
  --retries <number>      单张图片失败后的重试次数，默认 2
  --timeout <ms>          单次请求超时时间，默认 30000
  --only <ids>            只下载指定动作 ID，多个 ID 用英文逗号分隔
  --force                 覆盖已存在的本地图片
  --dry-run               只打印计划，不写入文件
  --help                  显示帮助

Examples:
  npm run db:download-exercise-images
  npm run db:download-exercise-images -- --concurrency 4
  npm run db:download-exercise-images -- --only 3_4_Sit-Up,Ab_Crunch_Machine
`;

function parseArgs(argv) {
  const options = {
    outputDir: path.resolve(process.cwd(), DEFAULT_OUTPUT_DIR),
    concurrency: DEFAULT_CONCURRENCY,
    retries: DEFAULT_RETRIES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    onlyIds: new Set(),
    force: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inlineValue] = arg.split("=", 2);
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      return argv[index];
    };

    switch (name) {
      case "--output":
        options.outputDir = path.resolve(process.cwd(), requireValue(name, readValue()));
        break;
      case "--concurrency":
        options.concurrency = parsePositiveInteger(name, requireValue(name, readValue()));
        break;
      case "--retries":
        options.retries = parseNonNegativeInteger(name, requireValue(name, readValue()));
        break;
      case "--timeout":
        options.timeoutMs = parsePositiveInteger(name, requireValue(name, readValue()));
        break;
      case "--only": {
        const value = requireValue(name, readValue());
        options.onlyIds = new Set(value.split(",").map((id) => id.trim()).filter(Boolean));
        break;
      }
      case "--force":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value ?? "");
}

function resolveImageUrl(exercise, index) {
  const imageUrl = exercise.imageUrls[index];
  const imagePath = exercise.images[index];

  if (isHttpUrl(imageUrl)) return imageUrl;
  if (isHttpUrl(imagePath)) return imagePath;
  if (imagePath && exercise.source === "yuhonas/free-exercise-db") {
    return `${RAW_GITHUB_EXERCISE_BASE_URL}/${encodeURI(imagePath)}`;
  }

  return null;
}

// 下载脚本以 Exercise.id 作为目录名，保证同一个动作的多张步骤图天然聚合在一起。
function buildImageJobs(exercise, outputDir) {
  const imageCount = Math.max(exercise.imageUrls.length, exercise.images.length);
  const usedFileNames = new Set();
  const jobs = [];

  for (let index = 0; index < imageCount; index += 1) {
    const sourceUrl = resolveImageUrl(exercise, index);
    if (!sourceUrl) continue;

    const exerciseDirName = safePathSegment(exercise.id);
    const fileName = resolveImageFileName({
      index,
      imagePath: exercise.images[index],
      sourceUrl,
      usedFileNames,
    });
    const targetPath = path.join(outputDir, exerciseDirName, fileName);

    jobs.push({
      exerciseId: exercise.id,
      nameZh: exercise.nameZh,
      stepIndex: index,
      sourceUrl,
      sourceImagePath: exercise.images[index] ?? null,
      targetPath,
      localPath: toPosixPath(path.relative(process.cwd(), targetPath)),
    });
  }

  return jobs;
}

function resolveImageFileName({ index, imagePath, sourceUrl, usedFileNames }) {
  const sourceName = getSourceFileName(imagePath) ?? getSourceFileNameFromUrl(sourceUrl);
  const fallbackName = `step-${String(index + 1).padStart(2, "0")}.jpg`;
  const safeName = safeFileName(sourceName ?? fallbackName);
  const extension = path.extname(safeName).toLowerCase();
  const baseName = IMAGE_EXTENSIONS.has(extension) ? safeName : `${safeName}.jpg`;

  if (!usedFileNames.has(baseName)) {
    usedFileNames.add(baseName);
    return baseName;
  }

  const parsed = path.parse(baseName);
  let dedupedName = `${parsed.name}-${String(index + 1).padStart(2, "0")}${parsed.ext}`;
  let dedupeIndex = 2;

  while (usedFileNames.has(dedupedName)) {
    dedupedName = `${parsed.name}-${String(index + 1).padStart(2, "0")}-${dedupeIndex}${parsed.ext}`;
    dedupeIndex += 1;
  }

  usedFileNames.add(dedupedName);
  return dedupedName;
}

function getSourceFileName(value) {
  if (!value) return null;
  const decodedValue = decodeURIComponent(value);
  const fileName = path.posix.basename(decodedValue);
  return fileName && fileName !== "." ? fileName : null;
}

function getSourceFileNameFromUrl(value) {
  try {
    const url = new URL(value);
    return getSourceFileName(url.pathname);
  } catch {
    return null;
  }
}

function safePathSegment(value) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+$/, "_")
    .slice(0, 140);
  return normalized || "unknown-exercise";
}

function safeFileName(value) {
  const parsed = path.parse(safePathSegment(value));
  const name = parsed.name || "image";
  const ext = parsed.ext.toLowerCase();
  return `${name}${ext}`;
}

function toPosixPath(value) {
  return value.split(path.sep).join(path.posix.sep);
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(job, options) {
  if (!options.force && (await pathExists(job.targetPath))) {
    const fileStat = await stat(job.targetPath);
    return {
      ...job,
      status: "skipped_existing",
      bytes: fileStat.size,
    };
  }

  await mkdir(path.dirname(job.targetPath), { recursive: true });
  const tempPath = `${job.targetPath}.download`;
  let lastError = null;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const result = await fetchToFile(job.sourceUrl, tempPath, options.timeoutMs);
      await rename(tempPath, job.targetPath);
      return {
        ...job,
        status: "downloaded",
        bytes: result.bytes,
        contentType: result.contentType,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      await unlink(tempPath).catch(() => {});
      if (attempt < options.retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  return {
    ...job,
    status: "failed",
    error: lastError?.message ?? "Unknown download error.",
  };
}

async function fetchToFile(url, targetPath, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "AITest exercise image downloader",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!isLikelyImage(url, contentType)) {
      throw new Error(`Unexpected content-type: ${contentType || "unknown"}`);
    }

    if (!response.body) {
      throw new Error("Response body is empty.");
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
    const fileStat = await stat(targetPath);

    return {
      bytes: fileStat.size,
      contentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isLikelyImage(url, contentType) {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType.startsWith("image/")) return true;
  if (normalizedContentType.includes("application/octet-stream")) return true;
  return IMAGE_EXTENSIONS.has(path.extname(getSourceFileNameFromUrl(url) ?? "").toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runPool(items, concurrency, handler) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function buildManifest(results, options) {
  const summary = results.reduce(
    (accumulator, result) => {
      accumulator.total += 1;
      accumulator[result.status] = (accumulator[result.status] ?? 0) + 1;
      if (result.bytes) accumulator.totalBytes += result.bytes;
      return accumulator;
    },
    {
      total: 0,
      downloaded: 0,
      skipped_existing: 0,
      failed: 0,
      totalBytes: 0,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    outputDir: toPosixPath(path.relative(process.cwd(), options.outputDir)),
    summary,
    images: results.map((result) => ({
      exerciseId: result.exerciseId,
      nameZh: result.nameZh,
      stepIndex: result.stepIndex,
      sourceUrl: result.sourceUrl,
      sourceImagePath: result.sourceImagePath,
      localPath: result.localPath,
      status: result.status,
      bytes: result.bytes ?? null,
      contentType: result.contentType ?? null,
      error: result.error ?? null,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(helpText.trim());
    return;
  }

  const adapter = new PrismaPg({ connectionString: DEFAULT_CONNECTION_STRING });
  const prisma = new PrismaClient({ adapter });

  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        nameZh: true,
        source: true,
        images: true,
        imageUrls: true,
      },
    });
    const selectedExercises = options.onlyIds.size
      ? exercises.filter((exercise) => options.onlyIds.has(exercise.id))
      : exercises;
    const jobs = selectedExercises.flatMap((exercise) => buildImageJobs(exercise, options.outputDir));

    console.log(`Found ${selectedExercises.length} exercises and ${jobs.length} image jobs.`);
    console.log(`Output directory: ${options.outputDir}`);

    if (options.dryRun) {
      for (const job of jobs.slice(0, 20)) {
        console.log(`[dry-run] ${job.exerciseId} #${job.stepIndex}: ${job.sourceUrl} -> ${job.localPath}`);
      }
      if (jobs.length > 20) {
        console.log(`[dry-run] ... ${jobs.length - 20} more image jobs omitted.`);
      }
      return;
    }

    await mkdir(options.outputDir, { recursive: true });
    let processed = 0;
    const results = await runPool(jobs, options.concurrency, async (job) => {
      const result = await downloadImage(job, options);
      processed += 1;

      if (result.status === "failed") {
        console.error(`[failed] ${result.exerciseId} #${result.stepIndex}: ${result.error}`);
      } else if (processed % 25 === 0 || processed === jobs.length) {
        console.log(`[progress] ${processed}/${jobs.length}`);
      }

      return result;
    });
    const manifest = buildManifest(results, options);
    const manifestPath = path.join(options.outputDir, "_manifest.json");
    const failedPath = path.join(options.outputDir, "_failed.json");
    const failedImages = manifest.images.filter((image) => image.status === "failed");

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(failedPath, `${JSON.stringify(failedImages, null, 2)}\n`, "utf8");

    console.log(
      `Done. downloaded=${manifest.summary.downloaded}, skipped_existing=${manifest.summary.skipped_existing}, failed=${manifest.summary.failed}`,
    );
    console.log(`Manifest: ${toPosixPath(path.relative(process.cwd(), manifestPath))}`);
    console.log(`Failures: ${toPosixPath(path.relative(process.cwd(), failedPath))}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
