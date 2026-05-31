import { previewText } from "./assertions";

// 多轮黑盒流程失败后仍要记录剩余轮次，方便人工区分真实失败和级联跳过。
export function createFlowFailureSkipReason(turnIndex: number, failureMessage: string) {
  const prefix = turnIndex === 0 ? "首轮基础能力失败" : `第 ${turnIndex + 1} 轮失败`;

  return `${prefix}：${previewText(failureMessage, 220)}`;
}
