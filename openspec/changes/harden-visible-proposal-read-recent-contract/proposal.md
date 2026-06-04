## Why

最新 AI trace 显示，Planner 连续两次调用 `inspectVisibleTrainingProposals(operation = "read_recent")` 时没有提供 `factRef` 或 `messageId`，被 runtime 以 `invalid_tool_input` 拒绝，最终触发 `repair_limit_exceeded`。根因不是模型无法解析 JSON，而是 `read_recent` 的模型可见 JSON Schema / examples / repair feedback 没有和真实 Zod 执行合同一致表达“必须提供真实引用”。

## What Changes

- 收紧 `inspectVisibleTrainingProposals` 的 `read_recent` input 合同，使 `factRef` / `messageId` 二选一必填能进入 Planner 可见 JSON Schema，而不是只停留在 `superRefine`。
- 更新 `inspectVisibleTrainingProposals` 的模型可见 examples 和描述，删除会被 runtime 拒绝的 `{ operation: "read_recent" }` 示例。
- 改进 `invalid_tool_input` 的 repair feedback，让模型看到安全、结构化、可恢复的字段级错误原因。
- 保持 `list_recent` / `read_recent` 的 tool-first 事实读取边界，不新增服务端自然语言关键词分流，不修改 `/api/chat` 主链路，不放宽权限或 resource 校验。
- 补充回归测试覆盖原始失败形态和等价变体，确保 manifest、schema、example、repair observation 和 runtime validator 对同一合同保持一致。

## Capabilities

### New Capabilities
- `visible-proposal-read-recent-contract`: 定义 `inspectVisibleTrainingProposals(operation = "read_recent")` 的模型可见输入合同、example 有效性和非法输入 repair feedback 收口。

### Modified Capabilities
- `agent-contract-repair-loop`: 收紧非法 tool input 的 repair feedback，确保安全暴露可恢复的 schema / 字段级错误原因，而不是只返回泛化失败消息。

## Impact

- 业务 tool 合同：`lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 input schema、examples 和模型可见说明。
- Agent core repair：`lib/server/agent-core/action-validator.ts` 或等价错误构造路径，确保 `invalid_tool_input` observation 包含安全字段级 repair details。
- 测试：`tests/agent-core/tool-registry-manifest.test.ts`、`tests/agent-core/planner-validator.test.ts`、`tests/chat-service.test.ts` 或更窄等价测试。
- OpenSpec：本 change 不新增业务 tool、不修改 `ToolRegistry` 注册范围、不触碰 `PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer 或 `/api/chat` 生产路由。
