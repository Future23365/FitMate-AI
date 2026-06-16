import "server-only";

import { generateShadowLlmProbeReport } from "./report";
import {
  continueShadowLlmProbeRun,
  getShadowLlmProbeStatus,
  startShadowLlmProbeRun,
} from "./runner";

export type ShadowLlmProbeCliResult = {
  exitCode: number;
  stdout: string;
  stderr?: string;
};

/** runShadowLlmProbeCli 实现 dev-only 文件 CLI，不启动浏览器、不调用 DeepSeek。 */
export async function runShadowLlmProbeCli(args: readonly string[], cwd = process.cwd()): Promise<ShadowLlmProbeCliResult> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    return { exitCode: 0, stdout: usage() };
  }

  try {
    if (parsed.message) {
      const result = await startShadowLlmProbeRun({
        cwd,
        message: parsed.message,
        userId: parsed.userId,
        conversationId: parsed.conversationId,
      });

      return {
        exitCode: 0,
        stdout: [
          `runId: ${result.runId}`,
          `inputPath: ${result.inputPath}`,
          `decisionPath: ${result.decisionPath}`,
          `reportPath: ${result.reportPath}`,
        ].join("\n"),
      };
    }

    if (parsed.continueRunId) {
      const result = await continueShadowLlmProbeRun({ cwd, runId: parsed.continueRunId });

      return {
        exitCode: 0,
        stdout: Object.entries(result)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n"),
      };
    }

    if (parsed.reportRunId) {
      const result = await generateShadowLlmProbeReport({ cwd, runId: parsed.reportRunId });

      return {
        exitCode: 0,
        stdout: [
          `runId: ${result.runId}`,
          `reportJsonPath: ${result.reportJsonPath}`,
          `reportMarkdownPath: ${result.reportMarkdownPath}`,
        ].join("\n"),
      };
    }

    const status = await getShadowLlmProbeStatus({ cwd, runId: parsed.statusRunId });
    return { exitCode: 0, stdout: JSON.stringify(status, null, 2) };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseArgs(args: readonly string[]) {
  const result: {
    help?: boolean;
    message?: string;
    continueRunId?: string;
    reportRunId?: string;
    statusRunId?: string;
    userId?: string;
    conversationId?: string;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--message" && next) {
      result.message = next;
      index += 1;
    } else if (arg === "--continue" && next) {
      result.continueRunId = next;
      index += 1;
    } else if (arg === "--report" && next) {
      result.reportRunId = next;
      index += 1;
    } else if (arg === "--status") {
      if (next && !next.startsWith("--")) {
        result.statusRunId = next;
        index += 1;
      }
    } else if (arg === "--user-id" && next) {
      result.userId = next;
      index += 1;
    } else if (arg === "--conversation-id" && next) {
      result.conversationId = next;
      index += 1;
    }
  }

  return result;
}

function usage() {
  return [
    "Usage:",
    "  npm run shadow:llm-probe -- --message \"今天我想练胸\"",
    "  npm run shadow:llm-probe -- --continue <runId>",
    "  npm run shadow:llm-probe -- --report <runId>",
    "  npm run shadow:llm-probe -- --status [runId]",
  ].join("\n");
}

