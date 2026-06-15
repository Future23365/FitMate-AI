import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type BasicChatFlowTurn = {
  index: number;
  userInput: string;
  expectation: string;
};

export type BasicChatFlow = {
  id: string;
  goal: string;
  turns: [BasicChatFlowTurn, ...BasicChatFlowTurn[]];
};

export type BasicChatFixtureStats = {
  flowCount: number;
  turnCount: number;
};

export type BasicChatFixture = {
  sourcePath: string;
  flows: BasicChatFlow[];
  stats: BasicChatFixtureStats;
};

// basicChatFixtureSourcePath 是基础首页黑盒套件默认消费的结构化用例入口，不再从 docs 说明文档解析执行数据。
export const basicChatFixtureSourcePath = "manual-tests/llm/fixtures/basic-chat-blackbox-cases.json";

export class BasicChatFixtureParseError extends Error {
  readonly errors: string[];

  constructor(errors: string[], sourcePath = basicChatFixtureSourcePath) {
    super(`${sourcePath} 解析失败：${errors.join("；")}`);
    this.name = "BasicChatFixtureParseError";
    this.errors = errors;
  }
}

// readBasicChatFixture 是基础黑盒套件的唯一用例入口，默认从 JSON fixture 读取可执行 flow。
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

// parseBasicChatFixtureFromJson 将人工维护的 JSON fixture 转成 runner 可执行的稳定内部模型。
export function parseBasicChatFixtureFromJson(
  input: unknown,
  sourcePath = basicChatFixtureSourcePath,
): BasicChatFixture {
  const errors: string[] = [];

  if (!isRecord(input)) {
    throw new BasicChatFixtureParseError(["根节点必须是 JSON object"], sourcePath);
  }

  if (input.version !== 1) {
    errors.push("version 必须为 1");
  }

  if (!Array.isArray(input.flows)) {
    errors.push("flows 必须是数组");
  }

  if (errors.length > 0 || !Array.isArray(input.flows)) {
    throw new BasicChatFixtureParseError(errors, sourcePath);
  }

  const idSet = new Set<string>();
  const flows: BasicChatFlow[] = [];

  for (const [flowOffset, rawFlow] of input.flows.entries()) {
    const flowLabel = `flows[${flowOffset}]`;
    let flowHasError = false;

    if (!isRecord(rawFlow)) {
      errors.push(`${flowLabel} 必须是 object`);
      continue;
    }

    const id = readTrimmedString(rawFlow.id);
    const goal = readTrimmedString(rawFlow.goal);

    if (!id) {
      errors.push(`${flowLabel}.id 必须是非空字符串`);
      flowHasError = true;
    } else if (idSet.has(id)) {
      errors.push(`${flowLabel}.id 存在重复值：${id}`);
      flowHasError = true;
    } else {
      idSet.add(id);
    }

    if (!goal) {
      errors.push(`${flowLabel}.goal 必须是非空字符串`);
      flowHasError = true;
    }

    if (!Array.isArray(rawFlow.turns) || rawFlow.turns.length === 0) {
      errors.push(`${flowLabel}.turns 必须是非空数组`);
      flowHasError = true;
      continue;
    }

    const turns: BasicChatFlowTurn[] = [];

    for (const [turnOffset, rawTurn] of rawFlow.turns.entries()) {
      const turnLabel = `${flowLabel}.turns[${turnOffset}]`;

      if (!isRecord(rawTurn)) {
        errors.push(`${turnLabel} 必须是 object`);
        flowHasError = true;
        continue;
      }

      const userInput = readTrimmedString(rawTurn.userInput);
      const expectedOutput = readTrimmedString(rawTurn.expectedOutput);

      if (!userInput) {
        errors.push(`${turnLabel}.userInput 必须是非空字符串`);
        flowHasError = true;
      }

      if (!expectedOutput) {
        errors.push(`${turnLabel}.expectedOutput 必须是非空字符串`);
        flowHasError = true;
      }

      if (userInput && expectedOutput) {
        turns.push({
          index: turnOffset + 1,
          userInput,
          expectation: expectedOutput,
        });
      }
    }

    if (!flowHasError && id && goal && turns.length > 0) {
      flows.push({
        id,
        goal,
        turns: turns as [BasicChatFlowTurn, ...BasicChatFlowTurn[]],
      });
    }
  }

  if (flows.length === 0) {
    errors.push("未解析到任何有效 flow");
  }

  if (errors.length > 0) {
    throw new BasicChatFixtureParseError(errors, sourcePath);
  }

  return {
    sourcePath,
    flows,
    stats: summarizeBasicChatFixture(flows),
  };
}

// summarizeBasicChatFixture 为命令启动输出和报告提供固定规模统计。
export function summarizeBasicChatFixture(flows: BasicChatFlow[]): BasicChatFixtureStats {
  return {
    flowCount: flows.length,
    turnCount: flows.reduce((total, flow) => total + flow.turns.length, 0),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
