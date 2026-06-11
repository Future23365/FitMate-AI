# Agent Planner 输入分层复查补强

时间：2026-06-06 14:52:36 CST

## 当前问题

复查 `separate-agent-planner-input-layers` 后发现三处边界还不够彻底：

- duplicate successful tool input 会消耗 repair budget 并作为 `invalid_action` observation 返回，但下一轮 Planner 没有独立 `repairContext`。
- ok tool result index observation 仍用一段 `boundary` 长文案重复解释事实通道、terminal 引用和 grounding 规则。
- output contract 的部分 `expectedAction` 虽然已经是 object，但 `visibleOutputs` 仍用 `["见 visibleOutputShape"]` 这种非真实 `AgentAction` 形态。

这些问题不会新增服务端语义分流，但会让模型可见合同重新出现“散文提示”和“半截 action 示例”的噪音。

## 调整思路

继续沿用输入分层原则：Runtime observation 只投影当前事实和短枚举恢复出口；Repair 失败语境进入 `repairContext`；字段名为 `expectedAction` 的示例必须能通过真实 `AgentActionSchema`。

## 关键改动

- duplicate successful tool input 现在会构造脱敏 `repairContext`，包含 `duplicate_tool_input`、`tool_call.input` 错误坐标、`previousToolResultId` 和 `nextActionHints`。
- duplicate feedback 和 ok tool result index observation 都迁移到短枚举 `nextActionHints`，不再暴露 `allowedNextActions` 长句。
- ok tool result index observation 用 `factLevel`、`factSource`、`finalAnswerSupport` 和 `nextActionHints` 替代长 `boundary` 文案。
- `DeepSeekModelAdapter` 的 thinking 参数、request trace 和去重统计改为读取 `context` 层，而不是旧 top-level 兼容字段。
- `visibleTrainingProposal` output contract 中所有 `expectedAction` 示例都改为可通过 `AgentActionSchema` 的完整 action object。

## 验证结果

- `openspec validate separate-agent-planner-input-layers --strict` 通过。
- 相关 Agent / prompt / tool / observation 测试通过：15 个测试文件，161 个用例。
- `npm run typecheck` 通过。
- `npm test` 通过：73 个测试文件，495 个用例。
