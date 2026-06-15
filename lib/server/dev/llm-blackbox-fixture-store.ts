import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BasicChatFixtureParseError,
  parseBasicChatFixtureFromJson,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";
import { isAiTraceEnabled } from "@/lib/server/dev/ai-trace-store";

const devBasicChatFixtureAbsolutePath = join(
  process.cwd(),
  "manual-tests",
  "llm",
  "fixtures",
  "basic-chat-blackbox-cases.json",
);

// isLlmBlackboxReviewerEnabled 复用开发诊断开关，避免生产环境暴露黑盒 fixture 和运行结果。
export function isLlmBlackboxReviewerEnabled() {
  return isAiTraceEnabled();
}

// readDevBasicChatFixture 是 /dev/llm-blackbox 的服务端 fixture 入口，只负责读取文件和调用共享 schema。
export async function readDevBasicChatFixture(sourcePath = devBasicChatFixtureAbsolutePath) {
  assertLlmBlackboxReviewerEnabled();

  const content = await readFile(sourcePath, "utf8");
  let fixtureJson: unknown;

  try {
    fixtureJson = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BasicChatFixtureParseError([`不是有效 JSON：${message}`], sourcePath);
  }

  return parseBasicChatFixtureFromJson(fixtureJson, sourcePath);
}

function assertLlmBlackboxReviewerEnabled() {
  if (!isLlmBlackboxReviewerEnabled()) {
    throw new Error("LLM blackbox reviewer is disabled.");
  }
}
