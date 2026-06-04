## 1. OpenSpec 与边界确认

- [x] 1.1 读取 `codex_logs/ai_trace_log.js`，确认本次失败链路是 `searchExerciseResources(homeRequirement="home_friendly") -> totalMatches=0 -> final_answer`。
- [x] 1.2 确认 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，不触碰 Agent core、`/api/chat` 主链路或服务端自然语言分流。
- [x] 1.3 运行 `openspec validate fix-search-exercise-resources-facet-contract --strict`。

## 2. Tool 模型可见合同修复

- [x] 2.1 更新 `searchExerciseResourcesInputSchema` 的 `homeRequirement`、`equipment`、`level` 等精确 facet 字段描述，列出当前真实可执行 facet 摘要。
- [x] 2.2 更新 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse` 和 examples，删除 `home_friendly`，改用 `none` / `无器械` 等真实 facet。
- [x] 2.3 保持 handler、repository、runtime 和 `/api/chat` 不变，不新增 `home_friendly -> none`、`no_equipment -> none` 或其他服务端语义映射。
- [x] 2.4 更新 `docs/agent-tool-design.md`，同步精确 facet 字段的真实值说明和 examples。

## 3. 回归测试

- [x] 3.1 更新 `tests/agent-tools/search-exercise-resources.test.ts`，断言 examples 或模型可见工具合同不再包含 `home_friendly`。
- [x] 3.2 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 manifest/schema summary 中包含 `homeRequirement`、`equipment`、`level` 的真实 facet 说明。
- [x] 3.3 确认没有新增服务端 alias、关键词、正则、同义词表或基于用户原文的语义纠偏逻辑。

## 4. 验证与收尾

- [x] 4.1 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 4.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 4.3 运行 `npm run typecheck`。
- [x] 4.4 运行 `openspec validate fix-search-exercise-resources-facet-contract --strict`。
- [x] 4.5 更新 `docs/方案变更历史/**` 和 `docs/项目演变历程.md`，记录本次 tool 合同修复。
- [x] 4.6 检查最终 diff，确认没有混入无关改动，并提交中文 commit。
