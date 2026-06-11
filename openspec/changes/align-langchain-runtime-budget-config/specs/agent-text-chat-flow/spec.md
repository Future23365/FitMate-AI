## MODIFIED Requirements

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的受控 LangChain tool catalog、跨 run 事实恢复边界和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册额外业务 tool、恢复旧事件或引入服务端自然语言分流。

#### Scenario: trace 写入记录预算和事实桥摘要
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** trace MUST 记录 production LangChain tool catalog 摘要、toolCount、toolNames 或等价 catalogHash 证据
- **AND** trace SHOULD 记录本轮 Agent run 的 `maxModelCalls`、`maxToolCalls`、`maxActivityReports`、`graphRecursionLimit` 或等价 LangChain `recursionLimit`、整体 timeout 和预算事件
- **AND** trace MUST NOT 继续把旧 `maxIterations` 当作当前 LangChain runtime 的预算语义
- **AND** 如本轮恢复了动作事实摘要，trace MUST 只记录安全摘要和引用 id
- **AND** trace MUST NOT 记录完整历史 payload、跨用户 payload、未展示内部候选或未经脱敏的大 payload
