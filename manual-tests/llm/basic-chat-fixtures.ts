import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type BasicChatFlowTurn = {
  index: 1 | 2 | 3;
  userInput: string;
  expectation: string;
};

export type BasicChatFlow = {
  id: string;
  goal: string;
  turns: [BasicChatFlowTurn, BasicChatFlowTurn, BasicChatFlowTurn];
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

export const basicChatFixtureHeading = "## 三轮流程用例";

// basicChatFixtureSourcePath 是基础首页黑盒套件的人工用例文档入口。
export const basicChatFixtureSourcePath = "docs/LLM基础测试用例.md";

export const basicChatRequiredColumns = [
  "ID",
  "流程目标",
  "第 1 轮用户输入",
  "第 1 轮期望",
  "第 2 轮用户输入",
  "第 2 轮期望",
  "第 3 轮用户输入",
  "第 3 轮期望",
] as const;

export class BasicChatFixtureParseError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`${basicChatFixtureSourcePath} 解析失败：${errors.join("；")}`);
    this.name = "BasicChatFixtureParseError";
    this.errors = errors;
  }
}

// readBasicChatFixture 是基础黑盒套件的唯一用例入口，保证 runner 直接消费当前文档目录里的基础用例。
export async function readBasicChatFixture(sourcePath = resolve(process.cwd(), basicChatFixtureSourcePath)) {
  const markdown = await readFile(sourcePath, "utf8");

  return parseBasicChatFixtureFromMarkdown(markdown, sourcePath);
}

// parseBasicChatFixtureFromMarkdown 将人工 review 的三轮流程表转成 runner 可执行的稳定 fixture。
export function parseBasicChatFixtureFromMarkdown(
  markdown: string,
  sourcePath = basicChatFixtureSourcePath,
): BasicChatFixture {
  const errors: string[] = [];
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === basicChatFixtureHeading);

  if (headingIndex < 0) {
    throw new BasicChatFixtureParseError([`缺少章节 ${basicChatFixtureHeading}`]);
  }

  const tableLines = collectMarkdownTableLines(lines.slice(headingIndex + 1));

  if (tableLines.length < 3) {
    throw new BasicChatFixtureParseError([`${basicChatFixtureHeading} 下缺少完整 Markdown 表格`]);
  }

  const header = splitMarkdownTableRow(tableLines[0]);
  const separator = splitMarkdownTableRow(tableLines[1]);

  if (!isMarkdownSeparatorRow(separator)) {
    errors.push("表格第二行不是 Markdown 分隔行");
  }

  if (!hasExactColumns(header)) {
    errors.push(`表格列名必须严格为：${basicChatRequiredColumns.join(" | ")}`);
  }

  const idSet = new Set<string>();
  const flows: BasicChatFlow[] = [];
  const columnIndexByName = new Map(header.map((column, index) => [column, index]));

  for (const [rowOffset, rowLine] of tableLines.slice(2).entries()) {
    const rowNumber = headingIndex + 3 + rowOffset;
    const row = splitMarkdownTableRow(rowLine);

    if (row.length !== header.length) {
      errors.push(`第 ${rowNumber} 行列数为 ${row.length}，预期 ${header.length}`);
      continue;
    }

    const readColumn = (columnName: (typeof basicChatRequiredColumns)[number]) => {
      const index = columnIndexByName.get(columnName);
      return index === undefined ? "" : normalizeCell(row[index]);
    };
    const id = readColumn("ID");
    const goal = readColumn("流程目标");
    const turns = [1, 2, 3].map((turnIndex) => ({
      index: turnIndex as 1 | 2 | 3,
      userInput: readColumn(`第 ${turnIndex} 轮用户输入` as (typeof basicChatRequiredColumns)[number]),
      expectation: readColumn(`第 ${turnIndex} 轮期望` as (typeof basicChatRequiredColumns)[number]),
    })) as [BasicChatFlowTurn, BasicChatFlowTurn, BasicChatFlowTurn];

    if (!id) {
      errors.push(`第 ${rowNumber} 行缺少 ID`);
    } else if (idSet.has(id)) {
      errors.push(`第 ${rowNumber} 行存在重复 ID：${id}`);
    } else {
      idSet.add(id);
    }

    if (!goal) {
      errors.push(`第 ${rowNumber} 行 ${id || "(unknown)"} 缺少流程目标`);
    }

    for (const turn of turns) {
      if (!turn.userInput) {
        errors.push(`第 ${rowNumber} 行 ${id || "(unknown)"} 第 ${turn.index} 轮用户输入为空`);
      }
      if (!turn.expectation) {
        errors.push(`第 ${rowNumber} 行 ${id || "(unknown)"} 第 ${turn.index} 轮期望为空`);
      }
    }

    if (id && goal && turns.every((turn) => turn.userInput && turn.expectation)) {
      flows.push({ id, goal, turns });
    }
  }

  if (flows.length === 0) {
    errors.push("未解析到任何有效 flow");
  }

  if (errors.length > 0) {
    throw new BasicChatFixtureParseError(errors);
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

function collectMarkdownTableLines(lines: string[]) {
  const tableLines: string[] = [];
  let hasStarted = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed && !hasStarted) {
      continue;
    }

    if (!trimmed.startsWith("|")) {
      if (hasStarted) {
        break;
      }
      continue;
    }

    hasStarted = true;
    tableLines.push(trimmed);
  }

  return tableLines;
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(normalizeCell(current));
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(normalizeCell(current));

  return cells;
}

function normalizeCell(cell: string) {
  return cell.trim().replace(/\s+/g, " ");
}

function isMarkdownSeparatorRow(row: string[]) {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function hasExactColumns(header: string[]) {
  return header.length === basicChatRequiredColumns.length
    && basicChatRequiredColumns.every((column, index) => header[index] === column);
}
