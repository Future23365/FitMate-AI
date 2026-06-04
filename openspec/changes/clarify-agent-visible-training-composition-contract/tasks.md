## 1. 范围确认

- [ ] 1.1 读取 `codex_logs/ai_trace_log.js` 和对应 `ai_trace_texts.jsonl`，确认当前模型实际可见 prompt、tool manifest、observation 和 tool result 摘要。
- [ ] 1.2 运行 `git status --short`，确认不混入无关本地改动。
- [ ] 1.3 确认本 change 不新增 `generatePlanDraft`、`generateRoutineDraft` 或等价旧式 draft tool。
- [ ] 1.4 确认本 change 不触碰 `/api/chat` 主链路、`PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 Response Renderer。

## 2. Prompt 合同调整

- [ ] 2.1 更新 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`，将 `visibleTrainingProposal` 说明改为结构能力、字段要求和事实边界说明。
- [ ] 2.2 删除或改写任何把自然语言关键词、短语、同义词或示例表达固定映射到 `payload.kind` 的 prompt 文案。
- [ ] 2.3 确保 prompt 明确模型根据用户目标、上下文、可见 tool、observations 和 tool results 自主选择输出结构。
- [ ] 2.4 确保 prompt 明确动作 id 应来自当前 run 可见且 `satisfied=true` 的动作事实来源，或当前用户可访问并已导入的 `visible_training_proposal_fact`。

## 3. searchExerciseResources 模型可见合同调整

- [ ] 3.1 更新 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 `description`、`whenToUse` 和 `whenNotToUse`，表达它是发布态动作事实查询 tool，不是最终训练方案生成器。
- [ ] 3.2 明确 `groups.<section>.exercises[*].exerciseId` 在 `fulfillment.satisfied = true` 时可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的受控动作事实来源。
- [ ] 3.3 调整 `toModelObservation` 中的 `candidateConsumptionBoundary` 和 `finalAnswerGrounding`，用正向边界说明替代“不是 visibleTrainingProposal”这类容易误导模型的文案。
- [ ] 3.4 更新 examples，使其只展示合法结构化查询字段和工具能力，不表达自然语言意图分类或固定 tool 调用顺序。
- [ ] 3.5 确认 schema 不新增 `purpose`、`queryIntent`、`candidateUse`、`resultRequirements`、`rankingHints`、`limit`、`offset`、`page` 或 `pageSize` 等服务端语义承载字段。

## 4. 自动化测试

- [ ] 4.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖 prompt 只表达结构能力和事实边界，不包含固定自然语言短语到 `payload.kind` 的映射。
- [ ] 4.2 更新 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖 `searchExerciseResources` manifest 的动作事实来源、不可生成最终方案、不可固定调用顺序等模型可见说明。
- [ ] 4.3 更新 `tests/agent-core/contract-helper.test.ts`，覆盖 `searchExerciseResources` model observation 的正向可组合事实边界。
- [ ] 4.4 更新或新增 `tests/chat-service.test.ts` 用 `ReplayPlanner` 覆盖模型自主组合多次 `searchExerciseResources` 结果并输出合法 `visibleTrainingProposal.payload.kind = "plan"` 的 runtime 路径。
- [ ] 4.5 增加旧式 tool 残留检查，确认生产 registry、prompt、manifest、examples 和 observation 中没有引入 `generatePlanDraft` 或 `generateRoutineDraft`。
- [ ] 4.6 增加服务端语义分流残留检查，确认 `/api/chat`、Agent core、renderer 和 tool handler 没有新增关键词、正则、同义词表或短句模板分流。

## 5. 验证

- [ ] 5.1 运行 `openspec validate clarify-agent-visible-training-composition-contract --strict`。
- [ ] 5.2 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [ ] 5.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 5.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 5.5 运行 `npm test -- tests/chat-service.test.ts`。
- [ ] 5.6 运行 `npm run typecheck`。
- [ ] 5.7 如具备真实模型环境，基于原始失败表达和至少一个等价表达执行黑盒验证，确认模型可见合同能支持模型自主组合工具事实，而不是依赖服务端固定规则。
- [ ] 5.8 最终检查 diff，确认只包含本 change 范围内的 prompt、tool manifest / observation、测试和 OpenSpec 文档改动。
