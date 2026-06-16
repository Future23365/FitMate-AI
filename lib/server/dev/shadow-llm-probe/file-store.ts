import "server-only";

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  ShadowLlmProbeDecisionSchema,
  ShadowLlmProbeInputSchema,
  ShadowLlmProbeManifestSchema,
  ShadowLlmProbeReportSchema,
  ShadowLlmProbeToolResultSchema,
  type ShadowLlmProbeDecision,
  type ShadowLlmProbeInput,
  type ShadowLlmProbeManifest,
  type ShadowLlmProbeReport,
  type ShadowLlmProbeToolResult,
} from "@/lib/shared/shadow-llm-probe/schema";

export type ShadowLlmProbeFileStore = ReturnType<typeof createShadowLlmProbeFileStore>;

/** createShadowLlmProbeFileStore 管理 dev-only run 文件路径，所有路径都限制在 shadow outputDir 下。 */
export function createShadowLlmProbeFileStore(cwd = process.cwd()) {
  const rootDir = path.resolve(cwd, agentRuntimeConfig.shadowLlmProbe.outputDir);

  return {
    rootDir,
    runDir: (runId: string) => path.join(rootDir, sanitizeRunId(runId)),
    manifestPath: (runId: string) => path.join(rootDir, sanitizeRunId(runId), "manifest.json"),
    inputPath: (runId: string, roundId: string) => path.join(rootDir, sanitizeRunId(runId), `${roundId}-input.json`),
    decisionPath: (runId: string, roundId: string) => path.join(rootDir, sanitizeRunId(runId), `${roundId}-decision.json`),
    toolResultPath: (runId: string, roundId: string) => path.join(rootDir, sanitizeRunId(runId), `${roundId}-tool-result.json`),
    reportJsonPath: (runId: string) => path.join(rootDir, sanitizeRunId(runId), "report.json"),
    reportMarkdownPath: (runId: string) => path.join(rootDir, sanitizeRunId(runId), "report.md"),
    async ensureRunDir(runId: string) {
      await mkdir(path.join(rootDir, sanitizeRunId(runId)), { recursive: true });
    },
    async writeManifest(manifest: ShadowLlmProbeManifest) {
      const parsed = ShadowLlmProbeManifestSchema.parse(manifest);
      await this.ensureRunDir(parsed.runId);
      await writeJson(this.manifestPath(parsed.runId), parsed);
    },
    async readManifest(runId: string) {
      return ShadowLlmProbeManifestSchema.parse(await readJson(this.manifestPath(runId)));
    },
    async writeInput(input: ShadowLlmProbeInput) {
      const parsed = ShadowLlmProbeInputSchema.parse(input);
      await this.ensureRunDir(parsed.runId);
      await writeJson(this.inputPath(parsed.runId, parsed.roundId), parsed);
    },
    async readInput(runId: string, roundId: string) {
      return ShadowLlmProbeInputSchema.parse(await readJson(this.inputPath(runId, roundId)));
    },
    async readDecision(runId: string, roundId: string) {
      return ShadowLlmProbeDecisionSchema.parse(await readJson(this.decisionPath(runId, roundId)));
    },
    async writeDecision(runId: string, decision: ShadowLlmProbeDecision) {
      const parsed = ShadowLlmProbeDecisionSchema.parse(decision);
      await writeJson(this.decisionPath(runId, parsed.roundId), parsed);
    },
    async writeToolResult(result: ShadowLlmProbeToolResult) {
      const parsed = ShadowLlmProbeToolResultSchema.parse(result);
      await writeJson(this.toolResultPath(parsed.runId, parsed.roundId), parsed);
    },
    async readToolResult(runId: string, roundId: string) {
      return ShadowLlmProbeToolResultSchema.parse(await readJson(this.toolResultPath(runId, roundId)));
    },
    async writeReport(runId: string, report: ShadowLlmProbeReport, markdown: string) {
      await writeJson(this.reportJsonPath(runId), ShadowLlmProbeReportSchema.parse(report));
      await writeFile(this.reportMarkdownPath(runId), markdown, "utf8");
    },
    async listRuns() {
      try {
        return (await readdir(rootDir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
    },
  };
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeRunId(runId: string) {
  return runId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

