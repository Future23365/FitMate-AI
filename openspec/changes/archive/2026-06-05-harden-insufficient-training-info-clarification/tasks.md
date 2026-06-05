## 1. 范围与治理

- [x] 1.1 使用 `agent-tool-change-governance` 确认本 change 属于已有 tool 合同 / terminal validator 修复，不修改 Agent runtime 主循环、`PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer 或 `/api/chat` 主链路。
- [x] 1.2 使用 `agent-prompt-contract-governance` 检查模型实际可见 prompt、tool manifest、schema description、examples、observation 和 repair feedback。
- [x] 1.3 使用 `agent-fix-abstraction-gate` 审查方案，确认没有把 F03、F05、F12 的具体用户短句升格为生产规则。
- [x] 1.4 运行 `git status --short`，记录已有未提交改动并确保本 change 不混入无关 diff。

## 2. 默认 Prompt 信息充分性合同

- [x] 2.1 更新 `lib/server/config/agent-llm-prompt-config.ts`，表达新输出 `visibleTrainingProposal` 前必须有可解释训练目标和关键约束。
- [x] 2.2 在默认 prompt 中分别表达 `exercise_selection`、`routine`、`plan` 的最低信息门槛，以及信息不足时的 `ask_user` / 无 `visibleOutputs` 收口方式。
- [x] 2.3 检查 prompt 未新增固定用户短句、固定业务 `toolName`、固定调用顺序、服务端自动补齐承诺或隐藏生成 tool。
- [x] 2.4 更新 prompt / production manifest 相关测试，断言新合同进入模型实际可见 system message。

## 3. `searchExerciseResources` broad query 合同

- [x] 3.1 更新 `searchExerciseResources` 的模型可见说明，表达无目标 broad query 只能作为诊断事实，不能支撑成功训练卡片。
- [x] 3.2 基于结构化 input 实现 broad query fulfillment：无可解释筛选条件时返回 `fulfillment.satisfied=false`。
- [x] 3.3 更新 `toModelObservation`，暴露 broad query 诊断、合法恢复方向和 forbidden final 边界。
- [x] 3.4 补充 tool-level 单测，覆盖无筛选 broad query 未满足、有结构化约束 query 仍满足，以及该判断不依赖用户原文。

## 4. `visibleTrainingProposal` 当前 run 来源校验

- [x] 4.1 更新 `visibleTrainingProposal` validator，收集当前 run satisfied `searchExerciseResources` projection 中的 `exerciseId + section` 来源。
- [x] 4.2 更新 validator，收集当前 run consumable `visible_training_proposal_fact` resource 中的 `exerciseId + section` 来源，且不接受 index / metadata-only summary。
- [x] 4.3 在现有数据库 existence / published / allowedSections 校验之外，拒绝缺少当前 run 可消费来源的 `exerciseItems[*]`。
- [x] 4.4 补充 validator 单测，覆盖无来源拒绝、unsatisfied tool result 拒绝、satisfied search result 接受、consumable resource 接受。

## 5. 黑盒与生产回归

- [x] 5.1 更新基础黑盒 fixture / judge 合同，确保 F03、F05、F12 信息不足时出现训练卡片会判失败，不能靠泛泛建议判 `passed_via_suggestion`。
- [x] 5.2 补充 `chat-service` ReplayPlanner 回归：broad query 后提交 visibleOutput 必须被 validator 拒绝并走安全 fallback，不渲染或保存训练卡片。
- [x] 5.3 补充同类变体回归，覆盖不使用原始失败短句的笼统训练请求或目标不清动作推荐。

## 6. 验证与收尾

- [x] 6.1 运行 `openspec validate harden-insufficient-training-info-clarification --strict`。
- [x] 6.2 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-tools/search-exercise-resources.test.ts tests/visible-training-proposal-validator.test.ts tests/chat-service.test.ts tests/manual-llm-basic-blackbox.test.ts`。
- [x] 6.3 运行 `npm run typecheck`。
- [x] 6.4 用 `rg` 检查本 change 没有在 `/api/chat`、Agent runtime、Executor、Policy Guard、ResourceStore、Response Renderer 或 tool handler 中新增用户原文关键词、正则、同义词表、短句模板或服务端语义分流。
- [x] 6.5 最终 diff 检查删除 / 重命名是否属于本次范围，并确认未混入已有无关改动。
