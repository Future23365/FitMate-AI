import type { AnyTool } from "@/lib/server/agent-core/contracts";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
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
