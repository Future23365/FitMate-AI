## 1. OpenSpec 与边界确认

- [x] 1.1 读取 `codex_logs/ai_trace_log.js`，确认本次失败链路是 `searchExerciseResources(muscle="腿部") -> totalMatches=0 -> final_answer`。
- [x] 1.2 确认 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，不触碰 Agent core、`/api/chat` 主链路或服务端自然语言分流。
- [x] 1.3 运行 `openspec validate fix-search-exercise-resources-body-regions --strict`。

## 2. Tool 合同与 repository 实现

- [x] 2.1 为 `searchExerciseResourcesInputSchema` 新增 `bodyRegions` 受控枚举字段，并更新 output schema、applied filters、query summary 和简短中文意图注释。
- [x] 2.2 更新 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse` 和 examples，明确高层身体区域使用 `bodyRegions`，`muscle` 只使用真实肌群 facet。
- [x] 2.3 更新 `searchExerciseResourceSummaries()` 的输入类型和 Prisma `where` 构造，按结构化 `bodyRegions` 确定性展开真实肌群 facet，并保持数据库层 `where/count/select/take` 下推查询。
- [x] 2.4 调整 `toFulfillment`：查询执行成功但具体筛选命中为空时返回 `satisfied=false`，并给出可恢复诊断摘要。
- [x] 2.5 更新 `toModelObservation`、`toUserProjection` 和 trace summary，只投影 `bodyRegions`、展开肌群、applied filters、命中数量、截断状态和有限动作摘要。
- [x] 2.6 更新 `docs/agent-tool-design.md`，同步只读动作查询 tool 的最新字段和空结果合同。

## 3. 回归测试

- [x] 3.1 在 `tests/agent-tools/search-exercise-resources.test.ts` 增加 tool-level 回归：`bodyRegions=["lower_body"]` 能通过真实 tool 边界返回下肢动作。
- [x] 3.2 在 `tests/agent-tools/search-exercise-resources.test.ts` 增加回归：`muscle="腿部"` 作为未知精确 facet 返回 0 时不再 `satisfied=true`。
- [x] 3.3 更新或新增 manifest/schema summary 测试，断言模型可见合同包含 `bodyRegions` 及 `upper_body/lower_body/core/full_body` 枚举，并保留 `muscle` 的真实 facet 边界说明。
- [x] 3.4 覆盖 projection / redaction，不泄漏完整 handler output、内部对象、训练候选 resource 或保存事件。

## 4. 验证与收尾

- [x] 4.1 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 4.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 4.3 运行 `npm run typecheck`。
- [x] 4.4 运行 `openspec validate fix-search-exercise-resources-body-regions --strict`。
- [x] 4.5 更新 `docs/方案变更历史/**` 和 `docs/项目演变历程.md`，记录本次 tool 合同修复。
- [x] 4.6 检查最终 diff，确认没有混入无关改动，并提交中文 commit。
