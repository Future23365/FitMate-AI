#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const logDir = path.join(projectRoot, "codex_logs");
const errorLogPath = path.join(logDir, "error_log.js");
const maxEntries = 200;
const nextArgs = ["dev", ...process.argv.slice(2)];

const errorPatterns = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bfailure\b/i,
  /\bexception\b/i,
  /\bunhandled\b/i,
  /\binvalid\b/i,
  /\bcannot\b/i,
  /\bmodule not found\b/i,
  /\btypeerror\b/i,
  /\bsyntaxerror\b/i,
  /\breferenceerror\b/i,
  /\brangeerror\b/i,
  /\bprisma\b/i,
  /⨯/,
  /✖/,
  /错误/,
  /失败/,
];

const entries = [];
let writeTimer;
let writeQueue = Promise.resolve();

function toLogContent() {
  return [
    "// Terminal error log captured from npm run dev for Codex debugging.",
    "// This file is generated automatically by scripts/dev-with-error-log.mjs.",
    `// Updated at: ${new Date().toISOString()}`,
    "",
    "module.exports = ",
    JSON.stringify(
      {
        source: "npm run dev",
        command: ["next", ...nextArgs].join(" "),
        maxEntries,
        entries,
      },
      null,
      2,
    ),
    ";\n",
  ].join("\n");
}

function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = undefined;
    enqueueWrite();
  }, 50);
}

function enqueueWrite() {
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(logDir, { recursive: true });
      await writeFile(errorLogPath, toLogContent(), "utf8");
    })
    .catch((error) => {
      process.stderr.write(`Failed to write ${errorLogPath}: ${String(error)}\n`);
    });

  return writeQueue;
}

async function flushLog() {
  clearTimeout(writeTimer);
  writeTimer = undefined;
  await enqueueWrite();
}

function captureErrorOutput(stream, chunk) {
  const text = chunk.toString();
  const shouldCapture = stream === "stderr" || errorPatterns.some((pattern) => pattern.test(text));

  if (!shouldCapture || text.trim().length === 0) {
    return;
  }

  // Keep the log bounded so long-running dev sessions do not create huge files.
  entries.push({
    capturedAt: new Date().toISOString(),
    stream,
    text,
  });

  if (entries.length > maxEntries) {
    entries.splice(0, entries.length - maxEntries);
  }

  scheduleWrite();
}

async function initializeLog() {
  await mkdir(logDir, { recursive: true });
  await writeFile(errorLogPath, toLogContent(), "utf8");
}

await initializeLog();

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  captureErrorOutput("stdout", chunk);
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  captureErrorOutput("stderr", chunk);
});

child.on("error", (error) => {
  captureErrorOutput("stderr", Buffer.from(`${String(error)}\n`));
});

process.once("SIGINT", () => {
  child.kill("SIGINT");
});

process.once("SIGTERM", () => {
  child.kill("SIGTERM");
});

const signalExitCodes = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

child.on("close", async (code, signal) => {
  await flushLog();

  if (code !== null && code !== 0) {
    captureErrorOutput("stderr", Buffer.from(`next dev exited with code ${code}\n`));
    await flushLog();
  }

  if (signal) {
    captureErrorOutput("stderr", Buffer.from(`next dev exited with signal ${signal}\n`));
    await flushLog();
  }

  process.exit(code ?? signalExitCodes[signal] ?? 0);
});
