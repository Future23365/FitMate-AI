## 1. 治理与设计门禁

- [x] 1.1 使用 `agent-tool-change-governance` 确认本次属于 LangChain runtime / wrapper 通用合同变更，并记录允许和禁止触碰模块。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁，确认方案没有把具体 trace、用户原话、业务 toolName 或字段组合升格为通用规则。
- [x] 1.3 使用 `agent-prompt-contract-governance` 检查模型可见运行预算说明，确认 prompt 修改放在通用 Agent prompt 合同层级。
- [x] 1.4 运行 `openspec validate distinguish-tool-fanout-from-loop --strict`，确保 proposal、design、specs 和 tasks 合法。

## 2. Runtime 合同实现

- [x] 2.1 调整 LangChain runtime 的连续业务 tool 限制，使计数单位从单次 tool execution 改为 provider model response 批次。
- [x] 2.2 确保同一 `AIMessage.tool_calls` 批次内同名不同输入 fan-out 不触发 `tool_consecutive_call_limit_exceeded`，但每次实际业务 tool execution 仍消耗 `maxToolCalls`。
- [x] 2.3 保留同批或跨批同名同参请求的 duplicate input 行为，handler 不重复执行等价业务输入。
- [x] 2.4 保留跨 provider model response 批次连续同 tool 超限后的 terminal failure、trace summary 和后续 tool availability 过滤。
- [x] 2.5 确认 runtime 没有新增具体业务 `toolName` 分支、用户原文关键词规则、自然语言模板路由或 phrasing 特判。

## 3. 模型可见合同同步

- [x] 3.1 更新默认 LangChain Agent system prompt 的运行预算说明，表达 batch-aware 连续限制、同批 fan-out 和 duplicate input 边界。
- [x] 3.2 确认 prompt 文案使用中文说明，保留 `tool_calls`、`runtimeMetadata.activitySummary`、`maxToolCalls`、`maxToolCallsPerTool` 等技术标识英文原样。
- [x] 3.3 确认本次新增或修改的 prompt 预算文案没有写入具体业务 tool、用户短句、关键词或固定恢复流程。

## 4. 测试与收尾验证

- [x] 4.1 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖同批同名不同输入 fan-out 成功执行。
- [x] 4.2 更新 runtime 测试，覆盖同批同名同参请求仍走 duplicate input。
- [x] 4.3 更新 runtime 测试，覆盖跨 provider model response 批次连续同 tool 第三批触发 terminal failure。
- [x] 4.4 更新 runtime 测试，覆盖全局 `maxToolCalls` 仍作为 fan-out 安全熔断。
- [x] 4.5 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts`。
- [x] 4.6 运行 `npm run typecheck`。
- [x] 4.7 运行 `openspec validate distinguish-tool-fanout-from-loop --strict`。
- [x] 4.8 最终 diff 检查，确认没有新增服务端语义分流、关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
