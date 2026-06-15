import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export {
  BasicChatFixtureParseError,
  basicChatFixtureSourcePath,
  parseBasicChatFixtureFromJson,
  summarizeBasicChatFixture,
  type BasicChatFixture,
  type BasicChatFixtureStats,
  type BasicChatFlow,
  type BasicChatFlowTurn,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";
import {
  BasicChatFixtureParseError,
  basicChatFixtureSourcePath,
  parseBasicChatFixtureFromJson,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";

// readBasicChatFixture 是命令行基础黑盒 runner 的薄 adapter，读取 JSON 后交给共享 schema 校验。
export async function readBasicChatFixture(sourcePath = resolve(process.cwd(), basicChatFixtureSourcePath)) {
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
