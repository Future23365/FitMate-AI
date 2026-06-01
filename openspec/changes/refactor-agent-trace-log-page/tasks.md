## 1. Trace 样本与 View Model

- [ ] 1.1 梳理现有 `AiTrace` / `AiTraceStep` 类型和真实 Agent trace 字段，确认 Agent stage、tool result、resource id、final result、legacy path 状态的来源。
- [ ] 1.2 新增或整理 Agent trace fixture，覆盖成功生成、patch、clarification、validation blocked、tool parse failure、persistence failure、Response Writer mismatch 和 legacy trace。
- [ ] 1.3 提取 `AgentTraceViewModel` 或等价构建模块，输出 runSummary、phaseGroups、toolTimeline、resourceLinks、diagnosticFindings 和 legacyCompatibility。
- [ ] 1.4 为 View Model 补充单元测试，覆盖 Agent stage 分组、工具决策与结果配对、资源 id 生产/消费索引、orphaned resource、失败聚合和 legacy fallback。

## 2. Agent 诊断页面

- [ ] 2.1 改造 `components/dev/ai-trace-viewer.tsx`，让包含 Agent stages 的 trace 默认展示 Agent run 总览。
- [ ] 2.2 新增 Agent phase flow 展示 ContextPackage、tool loop、validator / policy gate、persistence、Response Writer、post-processing 和 legacy compatibility 区域。
- [ ] 2.3 新增 tool timeline 视图，展示 toolName、状态、耗时、参数摘要、输出摘要、失败 code、toolResultId、模型阶段和下游使用位置。
- [ ] 2.4 新增 resource links 视图，展示 candidateSetId、artifactPayloadId、validationId、policyDecisionId、confirmationId、revisionId、toolResultId 等 id 的产生和消费位置。
- [ ] 2.5 新增 diagnostic findings 视图，按 context、tool decision、tool execution、domain gate、persistence、response writer、post-processing 和 legacy compatibility 聚合失败。
- [ ] 2.6 保留 legacy trace 的旧流程展示，并在无 Agent stages 时明确标记未记录 Agent run 诊断信息。

## 3. 可读字段与导出

- [ ] 3.1 更新模型请求、模型响应、ContextPackage、AgentExecutionResult、validation、policy、persistence 和 Response Writer 的字段解释与长文本展示。
- [ ] 3.2 更新保存全链路 log payload，在原始 trace 外追加 Agent final result、tool timeline、resource links、diagnostic findings、legacy path 状态和用户可见回复摘要。
- [ ] 3.3 确保保存用户问答记录仍只写入保存时间、trace 标识、用户问题列表和最终文本回答，不写入完整 tool payload、候选池、卡片或敏感字段。
- [ ] 3.4 确保 Raw JSON、阶段 log 保存、单 step log 保存和旧 trace 保存行为保持可用。

## 4. 验证与文档

- [ ] 4.1 运行 View Model 和 trace viewer 相关自动化测试，覆盖 Agent 成功、失败和 legacy fallback。
- [ ] 4.2 运行 `npm run typecheck`。
- [ ] 4.3 运行 `openspec validate refactor-agent-trace-log-page --strict`。
- [ ] 4.4 如实现改变开发者排查方式，在 `docs/方案变更历史` 新增一份方案变更记录，并在 `docs/项目演变历程.md` 末尾追加简要记录。
