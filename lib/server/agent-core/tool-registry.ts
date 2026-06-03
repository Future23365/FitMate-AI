import { defineTool, isM0ExecutablePolicy } from "./define-tool";
import { AgentContractError, AGENT_ERROR_CODES } from "./errors";
import { toolToManifest } from "./manifest";
import type { AnyTool, Tool, ToolManifest } from "./contracts";

/** ToolRegistry 管理当前 Agent run 可用工具集合，并提供 Planner 安全 manifest。 */
export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  /** register 在注册阶段做合同校验，并保证 tool name 在当前 registry 内唯一。 */
  register<Input, Output>(tool: Tool<Input, Output>): Tool<Input, Output> {
    const definedTool = defineTool(tool);

    if (this.tools.has(definedTool.name)) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.DUPLICATE_TOOL,
        `Tool name "${definedTool.name}" is already registered.`,
        { details: { toolName: definedTool.name } },
      );
    }

    this.tools.set(definedTool.name, definedTool);
    return definedTool;
  }

  /** get 按名称读取已注册 tool，未注册 tool 由 validator/executor 统一拒绝。 */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** listAvailable 返回 M0 当前可执行的只读低风险 tool，非 M0 能力只保留元数据不进入 manifest。 */
  listAvailable(): Tool[] {
    return [...this.tools.values()].filter((tool) => isM0ExecutablePolicy(tool.policy));
  }

  /** serializeForPlanner 生成 Planner 唯一可见的安全 tool manifest。 */
  serializeForPlanner(): ToolManifest[] {
    return this.listAvailable().map(toolToManifest);
  }
}
