## 1. 合同边界确认

- [x] 1.1 对照 `docs/agent-tool-orchestrator-design.md` 和 `docs/llm-prompt-guidance.md`，确认本 change 只修改 `searchExerciseResources` 的 Planner-visible summary，不改变 LangChain runtime、provider payload、response adapter 或 `/api/chat`
- [x] 1.2 梳理 `searchExerciseResources` 当前 handler output、`projection.model`、user projection 和 trace summary 字段来源，列出哪些字段只应留在非 Planner 通道
- [x] 1.3 确认实现方案没有新增服务端自然语言关键词规则、正则分流、同义词表、固定 phrasing 特判或 provider `tool_calls` 改写

## 2. 模型可见投影实现

- [x] 2.1 将 `searchExerciseResources.toModelVisibleSummary()` 调整为候选事实白名单投影，只保留必要查询语义、`candidateGroups[].suitability` 和 `candidateGroups[].exercises[]` 的有限动作事实
- [x] 2.2 从 Planner-visible summary 递归移除 `totalMatches`、`returnedCount`、`truncated`、`excludedCount`、`candidateCountPerSection`、`sort`、`maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize` 和 `cursor`
- [x] 2.3 从 Planner-visible summary 递归移除 `querySpecificity`、`filterSemantics`、`appliedFilters`、`filterApplicationBoundary`、`filterApplications`、`positiveAnchorBoundary` 和 `refreshExclusionBoundary`
- [x] 2.4 从 Planner-visible summary 递归移除 `sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、`allowedSections`、`candidateGroups[].zeroMatchMuscles` 和等价 placement / section coverage 字段
- [x] 2.5 将 Planner-visible `diagnostics[]` 收敛为中性诊断，移除 `diagnostics[].totalMatches`、`diagnostics[].returnedCount`、`exercise_name_too_broad`、`too_broad` 和等价继续查询暗示
- [x] 2.6 确认 Planner-visible summary 不新增 `sufficient`、`insufficient`、`ready`、`canProceed`、`canDeliverPlan`、`goalSatisfied`、`businessGoalSatisfied`、`complete` 或等价业务目标满足度字段 / 文案
- [x] 2.7 保留 trace summary、user projection 和内部 handler output 中的调试统计，确保开发排障信息不因 Planner 投影瘦身丢失

## 3. 模型可见说明同步

- [x] 3.1 更新 `searchExerciseResources` 的 tool description / schema description，说明 `candidateCountPerSection` 是受控 input，不是分页、offset、cursor、全库读取或最终展示数量承诺
- [x] 3.2 更新模型可见说明，避免承诺成功 result 会提供精确匹配数量、截断状态、过滤执行细节或下一步固定 workflow
- [x] 3.3 检查 examples，确保 examples 只展示合法结构化 input，不把 output-only 字段或统计字段放入 input 示例

## 4. 回归测试

- [x] 4.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖成功候选 result 的 Planner-visible summary 不含误导字段
- [x] 4.2 增加空候选、名称歧义、输入冲突和内部截断场景，验证 Planner-visible diagnostics 不含精确计数、`too_broad` 类 code，以及 sufficiency / readiness / completion 类字段或文案
- [x] 4.3 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，递归扫描 `projection.model` / `modelVisibleSummary` 的顶层、嵌套对象和字符串化 JSON
- [x] 4.4 增加 trace / user projection 保留统计字段的测试，证明 contract gate 只约束 Planner-visible summary
- [x] 4.5 按需更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，防止 manifest / examples 重新暴露 output-only 字段

## 5. 验证

- [x] 5.1 运行 `openspec validate strip-misleading-exercise-search-model-summary --strict`
- [x] 5.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- [x] 5.3 按需运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts`
- [x] 5.4 运行 `npm run typecheck`
- [x] 5.5 使用最新 trace 复盘 Planner-visible summary，确认模型上下文不再包含本 change 禁止的误导字段
