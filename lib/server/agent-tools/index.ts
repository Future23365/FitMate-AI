import type { AnyTool } from "@/lib/server/agent-core/contracts";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { inspectVisibleTrainingProposalsTool } from "@/lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool";
import { resolveExerciseResourceMentionsTool } from "@/lib/server/agent-tools/exercises/resolve-exercise-resource-mentions.tool";
import { searchExerciseResourcesTool } from "@/lib/server/agent-tools/exercises/search-exercise-resources.tool";
import { m1SafetyFixtureTools } from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";
import { readFixtureTool } from "@/lib/server/agent-tools/fixture/read-fixture.tool";

/** createM0FixtureToolRegistry 只注册 M0 fixture tool，用于合同测试，不接入生产聊天主链。 */
export function createM0FixtureToolRegistry() {
  const registry = new ToolRegistry();
  registry.register(readFixtureTool);
  return registry;
}

/** m0FixtureTools 暴露当前 M0 验收工具集合，强调它们不是业务 tool。 */
export const m0FixtureTools = [readFixtureTool] as const;

/** createM1FixtureToolRegistry 显式注册 M1 安全闭环 fixture，不接入生产聊天主链。 */
export function createM1FixtureToolRegistry() {
  const registry = new ToolRegistry({ capabilityMode: "m1" });
  registry.register(readFixtureTool);

  for (const tool of m1SafetyFixtureTools as readonly AnyTool[]) {
    registry.register(tool);
  }

  return registry;
}

/** m1FixtureTools 暴露 M1 资源、策略、确认和诊断 fixture 集合，强调它们不是业务 tool。 */
export const m1FixtureTools = [readFixtureTool, ...m1SafetyFixtureTools] as const;

/** createProductionToolRegistry 只注册当前生产文本聊天允许的低风险只读业务 tool。 */
export function createProductionToolRegistry() {
  const registry = new ToolRegistry();
  registry.register(inspectVisibleTrainingProposalsTool);
  registry.register(resolveExerciseResourceMentionsTool);
  registry.register(searchExerciseResourcesTool);
  return registry;
}

/** productionAgentTools 是当前生产 Agent 可见业务能力白名单，不包含 fixture、写入或训练生成 tool。 */
export const productionAgentTools = [
  inspectVisibleTrainingProposalsTool,
  resolveExerciseResourceMentionsTool,
  searchExerciseResourcesTool,
] as const;

export { inspectVisibleTrainingProposalsTool, resolveExerciseResourceMentionsTool, searchExerciseResourcesTool };
