# legacy intent allowlist

记录时间：2026-06-01 19:13:10 CST

本文件记录 `remove-legacy-intent-architecture` 后允许继续出现的旧架构标识边界。默认规则是 deny-by-default：未列入本文件的旧 intent-first、旧只读 loop、旧 `assistant_action` / `intent_resolved` 和旧 trigger JSON 不得被生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析或领域服务导入。

## 允许保留

- 历史文档：`docs/方案变更历史/**` 和旧归档 OpenSpec 可继续描述当时方案，只作为演进记录。
- 测试断言文本：测试可使用旧字段名断言它们不会出现在新生产流或 Agent 工具列表中。
- 黑盒 forbidden metadata：`manual-tests/llm/flow-fixtures.ts` 可以保留 `legacyIntentNormalize`、`runReadonlyToolLoop` 等 forbidden 名称，用于证明旧路径未触发。
- Trace 兼容展示：`components/dev/**` 和 `tests/fixtures/agent-traces.ts` 可保留 legacy trace 展示能力，用于查看历史 trace，不作为新运行执行事实源。
- 领域字段来源类型：`ResolvedFieldSource` / `ResolvedFieldSources` 暂作为字段来源枚举保留，不能重新引入 `ResolvedChatIntent` 执行合同。

## 禁止保留

- 生产聊天入口不得导入 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent` 解析 schema、旧 `resolveChatIntent`、resolved intent repair 或旧 action gate。
- 生产流不得输出 `assistant_action`、`intent_resolved` 或旧 trigger JSON。
- 生产工具编排不得导入或调用 `runReadonlyToolLoop`、`ReadonlyToolDecision`、`ENABLE_READONLY_LLM_TOOLS` 触发矩阵或旧只读 context bundle。
- 前端新流解析不得依赖旧 action 事件触发训练卡片。
