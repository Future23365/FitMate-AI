## 1. 现状确认与边界

- [ ] 1.1 读取最新 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`，确认失败链路是 Planner 未优先替换上一套已展示动作，而不是 hydration 去重或完整 payload 泄漏。
- [ ] 1.2 检查本次模型实际可见输入，包括 `AgentAction` system prompt、`run.metadata.recentVisibleTrainingProposals`、`inspectVisibleTrainingProposals` manifest、`searchExerciseResources` manifest 和相关 observations。
- [ ] 1.3 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不修改 Agent core、`/api/chat` route、PlannerPort、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer。
- [ ] 1.4 运行 `git status --short`，识别已有无关改动；实现和提交不得混入 `AGENTS.md`、`features/chat/components/chat-page.tsx` 或其他无关文件。
- [ ] 1.5 明确任务分类：prompt / model input 合同修复 + 既有业务 tool 模型可见说明调整；不是新增业务 tool，不新增专用刷新 tool，不做 core contract 变更。

## 2. Agent LLM system prompt 合同

- [ ] 2.1 更新 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`，增加 `visibleTrainingProposal` 刷新语义：保留原目标和约束，优先替换上一套用户已看到 `exerciseItems`。
- [ ] 2.2 在 prompt 中明确 `routine` / `plan` 刷新不应只按原始需求和同一排序重新生成重复方案。
- [ ] 2.3 在 prompt 中明确仅调整组数、时长、顺序、休息或难度时不默认替换全部动作。
- [ ] 2.4 在 prompt 中明确用户要求保留动作或候选不足时可以复用部分动作，但需要说明原因。
- [ ] 2.5 保持 prompt 不包含固定短语到固定 tool、固定 action、固定 `payload.kind` 或服务端分流的映射。

## 3. Tool manifest 与 observation 合同

- [ ] 3.1 更新 `inspectVisibleTrainingProposals` 的 `description` / `whenToUse` / `whenNotToUse` / examples 或 observation，说明它用于读取上一套用户可见训练方案事实，支持 Planner 后续自主规划差异化刷新。
- [ ] 3.2 保持 `run.metadata.recentVisibleTrainingProposals` 和 `list_recent` 的轻量索引边界，不把完整 `exerciseItems`、`prescription`、`schedule`、图片或未展示候选重新暴露进 metadata。
- [ ] 3.3 更新 `read_recent` 成功 observation，说明读取事实已导入当前 run，可用于保留、排除、替换、查询新动作、调整结构、澄清或失败收口，但不代表已生成新方案。
- [ ] 3.4 更新 `searchExerciseResources` 的模型可见说明，表达可见训练方案刷新时 `excludeExerciseIds` 只能来自当前 run 可见的用户已展示动作事实或用户明确要求排除的动作。
- [ ] 3.5 更新 `searchExerciseResources` 的模型可见说明，表达替换动作时应保留原目标、器械、难度、居家条件、section、时长或计划约束，并继续由 `final_answer.visibleOutputs[]` 承载最终结构。
- [ ] 3.6 保持 tool manifest 不要求固定调用次数、固定调用顺序或固定短语强制调用。

## 4. 回归测试

- [ ] 4.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，断言 system prompt 包含刷新语义、保留约束、优先替换已展示动作、候选不足说明和处方调整边界。
- [ ] 4.2 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，断言 system prompt 不包含固定短语强制调用 `inspectVisibleTrainingProposals` / `searchExerciseResources` 或服务端语义分流规则。
- [ ] 4.3 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 `inspectVisibleTrainingProposals` manifest 包含可见方案刷新事实读取说明，并且不把固定短语写成强制调用。
- [ ] 4.4 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 `searchExerciseResources` manifest 包含 `excludeExerciseIds` 的可见训练方案刷新边界，并禁止内部候选进入默认排除集合。
- [ ] 4.5 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，覆盖 `read_recent` observation 的差异化刷新用途说明和不生成新方案边界。
- [ ] 4.6 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖排除后候选不足 observation / projection，确认不会回填已排除动作。
- [ ] 4.7 更新 `tests/chat-service.test.ts` 或等价 production replay 测试，覆盖有 recent visible proposal 时 Planner 可以读取事实、查询替代动作并输出差异化 `visibleTrainingProposal`。
- [ ] 4.8 覆盖至少一个等价表达，例如“重新来一套”或“不要刚才那套”，测试重点是模型可见合同和 replay 行为，不是服务端关键词分流。
- [ ] 4.9 添加或更新架构扫描，确认 `/api/chat`、Agent core、renderer 和 tool handler 没有新增自然语言关键词、正则、同义词表、短句模板或业务 `toolName` 分流。

## 5. 验证与收口

- [ ] 5.1 运行 `openspec validate harden-visible-training-refresh-prompt-contract --strict`。
- [ ] 5.2 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [ ] 5.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 5.4 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [ ] 5.5 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [ ] 5.6 运行 `npm test -- tests/chat-service.test.ts`。
- [ ] 5.7 运行 `npm run typecheck`。
- [ ] 5.8 检查最终 diff，确认没有混入无关 UI / AGENTS 改动，没有新增服务端关键词分流，没有重新暴露完整历史 payload。
- [ ] 5.9 如实现改变核心 prompt / tool 合同，在 `docs/方案变更历史` 和 `docs/项目演变历程.md` 记录本次方案变化。
- [ ] 5.10 完成任务后提交本次变更，提交消息使用中文。
