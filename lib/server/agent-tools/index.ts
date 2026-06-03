import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { readFixtureTool } from "@/lib/server/agent-tools/fixture/read-fixture.tool";

/** createM0FixtureToolRegistry 只注册 M0 fixture tool，用于合同测试，不接入生产聊天主链。 */
export function createM0FixtureToolRegistry() {
  const registry = new ToolRegistry();
  registry.register(readFixtureTool);
  return registry;
}

/** m0FixtureTools 暴露当前 M0 验收工具集合，强调它们不是业务 tool。 */
export const m0FixtureTools = [readFixtureTool] as const;

