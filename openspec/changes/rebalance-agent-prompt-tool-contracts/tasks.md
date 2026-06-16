## 1. Specification

- [ ] 1.1 补充 `agent-llm-prompt-configuration` delta，声明 system prompt、tool description、schema description、examples 和 final response schema 的分层边界。
- [ ] 1.2 补充 `agent-exercise-resource-query-tool` delta，声明 `searchExerciseResources` 短结构说明、批量查询能力、停止查询边界和可消费候选事实等级。
- [ ] 1.3 补充 `visible-training-proposal` delta，声明 `submitVisibleTrainingProposal` 承担 routine / plan 结构化收口边界。
- [ ] 1.4 补充 `agent-text-chat-flow` delta，声明 `fitmate_final_response.content` 承担最终正文 Markdown 规则。

## 2. Implementation

- [ ] 2.1 精简 `buildLangChainAgentSystemPrompt()`，只保留通用 Agent 合同、结构化终态、安全边界和高层停止原则。
- [ ] 2.2 重写 `searchExerciseResources` description 为固定短结构，并保留字段来源、批量查询和停止查询边界。
- [ ] 2.3 调整 `searchExerciseResources` schema description，保留字段来源和不可复制边界，删除跨字段 workflow 话术。
- [ ] 2.4 调整 `searchExerciseResources` model-visible summary，使可消费 `candidateGroups[].exercises[]` 成功结果表达为候选事实，并用独立字段表达查询宽窄或诊断边界。
- [ ] 2.5 调整 `submitVisibleTrainingProposal` description / schema description，把 routine / plan 收口边界集中到该 tool。
- [ ] 2.6 缩短 decision examples，并加入一次性查询 `suitabilities = ["warmup", "training", "stretch"]` 且未指定肌群不填写 `muscles` 的 routine 示例。
- [ ] 2.7 将最终正文 Markdown 规则下沉到 `fitmate_final_response.content` schema description 或等价 structured final response 合同。

## 3. Tests

- [ ] 3.1 更新 prompt / runtime contract tests，断言默认 system prompt 不承载完整业务 workflow、业务 examples 或 Markdown 细则。
- [ ] 3.2 更新 production tool catalog / model-visible contract tests，断言 `searchExerciseResources` 和 `submitVisibleTrainingProposal` 的模型可见说明分别承载自身边界。
- [ ] 3.3 更新 `searchExerciseResources` tests，覆盖批量 `suitabilities`、未指定 `muscles`、可消费 broad query 候选和 `factLevel` / query boundary 分离。
- [ ] 3.4 更新 `submitVisibleTrainingProposal` tests，覆盖已有可消费候选后可提交 `routine` / `plan` 的模型可见收口边界。
- [ ] 3.5 更新 final response schema tests，断言 Markdown 内容规则靠近 `fitmate_final_response.content` 字段。
- [ ] 3.6 更新或新增黑盒 / shadow probe 回归样例，覆盖泛化训练编排请求首轮可批量查候选并收口，不需要连续拆肌群查询。
- [ ] 3.7 增加门禁测试，确认没有新增服务端关键词、正则、自然语言模板路由、phrasing 特判、具体 `toolName` 语义分支或拼图式运行时状态。

## 4. Validation

- [ ] 4.1 运行 `openspec validate rebalance-agent-prompt-tool-contracts --strict`。
- [ ] 4.2 实现阶段运行相关自动化测试：`npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [ ] 4.3 实现阶段按需运行 `npm run typecheck`，或说明未运行原因。
