## 1. OpenSpec 与治理门禁

- [x] 1.1 完成 Agent tool 变更边界检查：本 change 分类为 LangChain runtime / wrapper 通用合同变更 + `searchExerciseResources` 模型可见 summary 局部补强。
- [x] 1.2 完成 Agent prompt/model-visible 合同检查：确认候选覆盖摘要属于 tool result summary / tool description 层，不写入通用 prompt 特例。
- [x] 1.3 完成抽象层级门禁检查：确认具体业务名只出现在 tool 局部说明和回归测试中，不作为通用语义规则。
- [x] 1.4 运行 `openspec validate harden-repeated-tool-loop-finalization --strict`。

## 2. Runtime 终止合同

- [x] 2.1 更新 LangChain runtime 的当前 request tool availability state，区分普通 `unknown_tool` 和因连续上限移除的 exhausted tool。
- [x] 2.2 在 provider 继续调用 exhausted tool 时返回 `tool_consecutive_call_limit_exceeded` 或等价 terminal loop failure execution，并确保业务 handler 不执行。
- [x] 2.3 保留普通未暴露 tool 的 `unknown_tool` 拒绝路径，不新增具体业务 `toolName` 语义分支。

## 3. searchExerciseResources 候选覆盖合同

- [x] 3.1 更新 `searchExerciseResources` 的 `toModelVisibleSummary`，表达 `candidateGroups[]`、可用 section、缺失 section、候选事实边界和重复等价 input 查询边界。
- [x] 3.2 更新 `searchExerciseResources` 的 tool description，说明候选覆盖摘要不是训练方案、训练卡片、处方、日程或用户目标满足度。
- [x] 3.3 更新 model-visible contract gate 白名单或检查逻辑，允许新的安全覆盖摘要字段，同时继续禁止 `satisfied`、`fulfillment`、`nextActionHints`、内部 diagnostics 和固定 workflow 文案。

## 4. 测试与验证

- [x] 4.1 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖 exhausted tool 从 request tools 移除后 provider 继续调用时进入 terminal loop failure，且 handler 不执行。
- [x] 4.2 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖普通未暴露 tool 仍返回 `unknown_tool`。
- [x] 4.3 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖成功候选 summary 的 section 覆盖、缺失 section、重复查询边界和不包含目标满足度 / workflow 指令。
- [x] 4.4 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，覆盖新增覆盖摘要字段合法且禁止旧风险字段回流。
- [x] 4.5 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [x] 4.6 运行 `npm run typecheck`。
- [x] 4.7 检查最终 diff，确认没有新增服务端自然语言分流、关键词规则、phrasing 特判、具体业务 `toolName` 语义分支或无关重构。
