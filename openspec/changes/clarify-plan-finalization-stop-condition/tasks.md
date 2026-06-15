## 1. 合同治理

- [x] 1.1 完成 Agent 修复方案抽象层级门禁审查，确认本 change 不把原始 trace、用户短句、具体字段组合或业务 toolName 升格为通用生产规则。
- [x] 1.2 完成 Agent prompt/model-visible 合同检查，确认停止条件落在 Planner Policy，业务 tool 边界落在对应 LangChain tool description。
- [x] 1.3 运行 `openspec validate clarify-plan-finalization-stop-condition --strict`。

## 2. 模型可见合同实现

- [x] 2.1 更新默认 Agent prompt 的多天计划停止条件，表达动作候选足够时停止同类查询，并由模型构造 `prescription` / `schedule` 后进入结构化收口。
- [x] 2.2 更新 `searchExerciseResources` description，表达该 tool 只返回动作候选事实，不产出 `prescription`、`schedule`、`routine` 或 `plan`。
- [x] 2.3 更新 `submitVisibleTrainingProposal` description，表达 `routine` / `plan` 的 `prescription` 可由模型基于本轮目标、动作候选事实和保守训练编排生成，并继续由 validator 校验。

## 3. 测试

- [x] 3.1 更新或新增 prompt / model-visible contract tests，覆盖 plan 停止条件、`prescription` / `schedule` 来源边界和不新增固定业务流程。
- [x] 3.2 更新 `searchExerciseResources` tool description 测试，覆盖“不产出处方、日程或 plan”以及“缺口是 `prescription` / `schedule` 时重复查询不会新增事实”。
- [x] 3.3 更新 `submitVisibleTrainingProposal` tool description 测试，覆盖 `prescription` 和 `schedule` 的模型构造来源说明。
- [x] 3.4 增加或更新等价语义回归样例，覆盖直接生成健身房每周 4 练增肌 plan 的场景不应因补 `prescription` / `schedule` 陷入重复动作查询。

## 4. 验证和收尾

- [x] 4.1 运行与本次改动相关的最窄测试。
- [x] 4.2 按需运行 `npm run typecheck`，或说明无法运行原因。
- [x] 4.3 运行 `git diff --check` 并检查 diff，确认没有混入无关工作区改动，且没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
