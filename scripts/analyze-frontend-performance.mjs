#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const defaultRoutes = ["/", "/composer", "/exercises", "/plans", "/training", "/settings", "/dev/ai-traces"];
const nextDir = path.resolve(process.cwd(), ".next");
const outputPath = readOption("--output");
const requestedRoutes = readOption("--routes")
  ?.split(",")
  .map((route) => route.trim())
  .filter(Boolean) ?? defaultRoutes;

const buildRoot = resolveBuildRoot(nextDir);
const staticRoot = path.join(buildRoot, "static");
const manifestRoot = path.join(buildRoot, "server", "app");

if (!fs.existsSync(manifestRoot)) {
  fail(`Missing Next app manifest directory: ${manifestRoot}. Run npm run build first.`);
}

const routeReports = requestedRoutes.map((route) => analyzeRoute(route, manifestRoot, staticRoot));
const imageReport = analyzeExerciseImages(path.resolve(process.cwd(), readOption("--image-dir") ?? "exercises_picture"));
const result = {
  generatedAt: new Date().toISOString(),
  buildRoot: path.relative(process.cwd(), buildRoot) || ".next",
  routes: routeReports,
  exerciseImages: imageReport,
};

const text = `${JSON.stringify(result, null, 2)}\n`;

if (outputPath) {
  const resolvedOutput = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, text);
  console.log(`Frontend performance report written to ${path.relative(process.cwd(), resolvedOutput)}`);
} else {
  process.stdout.write(text);
}

function analyzeRoute(route, rootDir, staticDir) {
  const manifestFile = findRouteManifest(route, rootDir);

  if (!manifestFile) {
    return {
      route,
      found: false,
      rawBytes: 0,
      gzipBytes: 0,
      chunks: [],
      warning: "route manifest not found",
    };
  }

  const manifest = readClientReferenceManifest(manifestFile);
  const chunks = collectRouteEntryChunks(manifest, route, manifestFile);
  const chunkReports = chunks.map((chunk) => analyzeChunk(chunk, staticDir));
  const rawBytes = sum(chunkReports.map((chunk) => chunk.rawBytes));
  const gzipBytes = sum(chunkReports.map((chunk) => chunk.gzipBytes));

  return {
    route,
    found: true,
    manifest: path.relative(process.cwd(), manifestFile),
    rawBytes,
    rawKb: toKb(rawBytes),
    gzipBytes,
    gzipKb: toKb(gzipBytes),
    chunks: chunkReports,
  };
}

function resolveBuildRoot(rootDir) {
  const productionServer = path.join(rootDir, "server", "app");

  if (fs.existsSync(productionServer)) {
    return rootDir;
  }

  const devServer = path.join(rootDir, "dev", "server", "app");

  if (fs.existsSync(devServer)) {
    return path.join(rootDir, "dev");
  }

  return rootDir;
}

function findRouteManifest(route, rootDir) {
  const candidates = listFiles(rootDir)
    .filter((filePath) => filePath.endsWith("_client-reference-manifest.js"))
    .map((filePath) => ({
      filePath,
      route: routeFromManifestPath(path.relative(rootDir, filePath)),
    }));

  return candidates.find((candidate) => candidate.route === route)?.filePath ?? null;
}

function routeFromManifestPath(relativeFilePath) {
  const withoutSuffix = relativeFilePath.replace(/_client-reference-manifest\.js$/, "");
  const segments = withoutSuffix
    .split(path.sep)
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
  const withoutPage = segments.at(-1) === "page" ? segments.slice(0, -1) : segments;

  return `/${withoutPage.join("/")}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function readClientReferenceManifest(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);

  if (!match) {
    fail(`Cannot parse client reference manifest: ${filePath}`);
  }

  return JSON.parse(match[1]);
}

function collectRouteEntryChunks(manifest, route, manifestFile) {
  const entryFiles = Object.entries(manifest.entryJSFiles ?? {});
  const routeKey = entryFiles.find(([key]) => routeFromEntryKey(key) === route)?.[0];
  const chunks = routeKey ? entryFiles.find(([key]) => key === routeKey)?.[1] ?? [] : [];

  if (chunks.length > 0) {
    return dedupe(chunks.map(normalizeChunkPath));
  }

  const fromClientModules = Object.values(manifest.clientModules ?? {})
    .filter((moduleRef) => moduleRef && moduleRef.async === false)
    .flatMap((moduleRef) => Array.isArray(moduleRef.chunks) ? moduleRef.chunks : [])
    .map(normalizeChunkPath);

  if (fromClientModules.length > 0) {
    return dedupe(fromClientModules);
  }

  const fallbackRoute = routeFromManifestPath(path.basename(manifestFile));
  return fallbackRoute === route ? [] : [];
}

function routeFromEntryKey(key) {
  const match = key.match(/\[project\]\/app\/(.+)$/);
  const appPath = match?.[1] ?? key;
  const segments = appPath
    .split("/")
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
  const withoutPage = segments.at(-1) === "page" ? segments.slice(0, -1) : segments;

  return `/${withoutPage.join("/")}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function analyzeChunk(chunk, staticDir) {
  const relativeToStatic = chunk.replace(/^static\//, "");
  const filePath = path.join(staticDir, relativeToStatic);

  if (!fs.existsSync(filePath)) {
    return {
      file: chunk,
      rawBytes: 0,
      rawKb: 0,
      gzipBytes: 0,
      gzipKb: 0,
      missing: true,
    };
  }

  const bytes = fs.readFileSync(filePath);
  const gzipBytes = zlib.gzipSync(bytes).length;

  return {
    file: chunk,
    rawBytes: bytes.length,
    rawKb: toKb(bytes.length),
    gzipBytes,
    gzipKb: toKb(gzipBytes),
  };
}

function analyzeExerciseImages(imageDir) {
  if (!fs.existsSync(imageDir)) {
    return {
      found: false,
      directory: path.relative(process.cwd(), imageDir),
      totalBytes: 0,
      files: 0,
      samples: [],
    };
  }

  const imageFiles = listFiles(imageDir).filter((filePath) => /\.(avif|gif|jpe?g|png|webp)$/i.test(filePath));
  const sizes = imageFiles.map((filePath) => ({
    file: path.relative(process.cwd(), filePath),
    bytes: fs.statSync(filePath).size,
  })).sort((left, right) => right.bytes - left.bytes);
  const totalBytes = sum(sizes.map((item) => item.bytes));

  return {
    found: true,
    directory: path.relative(process.cwd(), imageDir),
    files: sizes.length,
    totalBytes,
    totalMb: toMb(totalBytes),
    averageKb: toKb(sizes.length ? totalBytes / sizes.length : 0),
    largest: sizes.slice(0, 10).map((item) => ({ ...item, kb: toKb(item.bytes) })),
  };
}

function normalizeChunkPath(chunk) {
  return chunk
    .replace(/^\/_next\//, "")
    .replace(/^_next\//, "")
    .replace(/^\/+/, "");
}

function listFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(filePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(filePath);
    }
  }

  return files;
}

function readOption(name) {
  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function dedupe(values) {
  return [...new Set(values)];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function toKb(bytes) {
  return Number((bytes / 1024).toFixed(1));
}

function toMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
