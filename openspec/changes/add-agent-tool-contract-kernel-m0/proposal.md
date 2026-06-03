## Why

当前仓库已经删除旧 AI/Agent runtime，但仍需要按新的通用 `Agent Tool Orchestrator` 架构重新建立可测试的合同内核。M0 的目标是先打穿 `Tool Bundle -> ToolRegistry -> PlannerPort -> Validator -> Executor -> Runtime -> Response Renderer` 的最小闭环，避免在没有稳定内核时直接接入真实业务 tool 或模型厂商协议。

## What Changes

- 新增通用 `agent-core` 合同内核，覆盖 `defineTool`、`ToolRegistry`、Tool manifest 序列化、`PlannerPort`、`ReplayPlanner`、`AgentAction` Schema、Action Validator、Executor、Runtime loop 和默认 Response Renderer。
- 新增 fixture read tool 作为 M0 验收工具，证明只注册一个只读 fixture tool 时，manifest、planner 决策、输入/输出校验、tool 执行和 NDJSON 输出可以端到端闭环。
- 建立 M0 的确定性运行边界：`maxSteps`、overall timeout、per-tool timeout、非法 action 修复次数限制、基础 planner/tool call 次数限制和重复失败熔断。
- 明确 M0 不接入真实业务 tool、不接入真实 LLM adapter、不接入 production `/api/chat` 主链、不实现 ResourceStore/Resource Contract、Policy Guard、confirmation、Trace/Replay 硬化或跨 run 资源消费。
- 明确新内核不得复用或恢复旧 `lib/server/agent-orchestrator/**`、旧 `AgentExecutionResult`、旧 Response Writer、旧 prompt module 或旧业务 toolName 分支。

## Capabilities

### New Capabilities

- `agent-tool-contract-kernel`: 定义 M0 合同内核闭环，包括 tool 定义与注册、manifest、模型无关 planner 边界、action 校验、通用执行循环、默认响应渲染、运行限制和 fixture read tool 验收。

### Modified Capabilities

- 无。本 change 新增从空白边界开始的通用合同内核，不修改现有生产聊天、动作库、训练生成或旧 Agent 删除规格。

## Impact

- 影响模块：新增 `lib/server/agent-core/**`、`lib/server/agent-planners/replay-planner.ts`、`lib/server/agent-tools/index.ts` 和 `lib/server/agent-tools/fixture/read-fixture.tool.ts` 等 M0 内核与 fixture 目录。
- 影响测试：新增 `tests/agent-core/**`，覆盖 tool contract、registry、manifest、action validator、runtime、executor、response renderer 和 fixture read tool 端到端闭环。
- 影响文档：需要记录本次从旧 Agent runtime 删除后重新建立通用合同内核的架构边界、M0/M1/M2 分阶段关系和验证结果。
- 不影响数据库结构、Prisma Schema、前端 UI、生产 `/api/chat` 行为、真实模型调用、真实训练计划生成或动作库业务 tool。
