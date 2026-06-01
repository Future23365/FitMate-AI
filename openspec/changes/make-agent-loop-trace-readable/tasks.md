## 1. Trace Contract And Fixtures

- [ ] 1.1 梳理当前 `/api/chat` Agent trace steps，确认 model request、model response、tool decision、tool result、final result 和 response writer 的实际字段。
- [ ] 1.2 补强 Agent loop trace metadata，确保每轮都有 loopTurnId 或等价 index、modelCallId、toolCallId、toolResultId、visibleToolResultIds、usedToolResultIds 和 resource id 摘要。
- [ ] 1.3 确保每次 Agent LLM 调用记录模型输入、原始输出或摘要、解析后的 action / final result、token usage、解析失败和 Schema 失败信息。
- [ ] 1.4 确保 tool 执行 step 记录输入摘要、输出摘要、状态、失败 code、durationMs、toolResultId、candidateSetId、artifactId、validationId、policyDecisionId、confirmationId、revisionId 等关键 id。
- [ ] 1.5 更新 `tests/fixtures/agent-traces.ts`，增加完整 tool call、多轮 tool call、tool 失败、解析失败、orphaned tool result、response writer mismatch 和 legacy trace fixture。

## 2. Agent Loop View Model

- [ ] 2.1 在 `components/dev/agent-trace-view-model.ts` 或合适模块中建立 AgentLoopTraceViewModel，输出 runOverview、loopTurns、finalization、diagnostics 和 raw links。
- [ ] 2.2 实现 model request / model response / parsed decision / tool result / next prompt linkage 的结构化建链，优先使用 id 和 metadata，不通过中文标题或用户文本推断。
- [ ] 2.3 实现缺失证据诊断，包括 missing model response、missing tool result、unlinked resource id、orphaned tool result、parsing failure 和 response writer boundary mismatch。
- [ ] 2.4 为旧 trace 保留 legacy fallback，明确标记缺少 Agent loop linkage，不把旧 trace 自动判断为业务失败。
- [ ] 2.5 为 view model 添加单元测试，覆盖完整链路、断链、旧 trace fallback 和导出所需字段。

## 3. Log-Traces Page UX

- [ ] 3.1 将 Agent trace 详情默认切换为 Agent loop timeline，首屏展示本轮用户问题、Agent 状态、最终结果、用户可见回复摘要和关键诊断。
- [ ] 3.2 为每个 loop turn 展示 LLM 输入、LLM 输出原文、解析后的 action / tool decision / final result、tool 执行结果和下一轮输入可见性。
- [ ] 3.3 将 token、duration、skip reason、resource id、dependency graph、prompt modules 和截断信息改为附着在相关 loop 节点上的解释型辅助信息。
- [ ] 3.4 保留每个 loop turn、tool result、finalization、diagnosis 和 legacy step 的 Raw JSON 入口。
- [ ] 3.5 优化中文标签和说明，避免只有内部字段名；所有核心指标都说明“这个指标用来判断什么问题”。

## 4. Log Export

- [ ] 4.1 调整保存全链路 log 的 payload，导出 Agent loop timeline、LLM 输入摘要、LLM 输出解析、tool 执行结果、resource links、diagnostic findings、final result 和用户可见回复摘要。
- [ ] 4.2 保持保存用户问答记录的窄格式，只保存用户问题和最终文本回答，不包含完整 prompt、tool payload、动作卡片、训练计划卡片或敏感字段。
- [ ] 4.3 为 `/api/dev/ai-traces` 保存接口补充测试，覆盖全链路 log 和用户问答记录的字段边界。

## 5. Verification

- [ ] 5.1 运行 `openspec validate make-agent-loop-trace-readable --strict`。
- [ ] 5.2 运行 `npm run test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts` 或更新后的相关测试集合。
- [ ] 5.3 运行 `npm run typecheck`。
- [ ] 5.4 如实现影响页面结构但未使用浏览器验证，在最终说明中明确原因；如确需浏览器验证，先取得确认并只复用已启动的 `http://localhost:3000`。
