## 1. Agent 终止合同修复

- [x] 1.1 在 Agent decision 解析层补齐“合法 `result` 但缺少顶层 `reason`”的窄口径容错。
- [x] 1.2 添加单元测试，覆盖缺少 `reason` 的合法 `answered` 推荐结果仍能通过解析，且非法 `result` 仍失败。

## 2. 动作检索与工具定义

- [x] 2.1 调整 `searchExercises` query 门控，让 `candidateUse="recommendation"` 且存在结构化候选边界时不被泛化 `query` 清空候选。
- [x] 2.2 补充动作搜索单元测试，覆盖推荐检索的结构化边界优先于泛化 query。
- [x] 2.3 在 `searchExercises` 工具定义中补充短小真实 facet 摘要和结构化字段使用说明。

## 3. 推荐卡片闭环验证

- [x] 3.1 添加或更新 Agent runtime / Response Writer 测试，覆盖本轮 trace 形态：`searchExercises` 成功、final result 缺少 `reason`、最终仍投影推荐卡片。
- [x] 3.2 运行相关测试与类型检查，记录验证结果。

## 4. 文档收尾

- [x] 4.1 更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录这次推荐链路修复。
- [x] 4.2 运行 `openspec validate fix-agent-recommendation-final-result --strict` 并将 `tasks.md` 标记为完成。
