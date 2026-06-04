## 1. Agent 默认器械合同

- [x] 1.1 更新 `lib/server/ai/prompt-config.ts`，明确未指定器械时动作推荐、routine 和 plan 默认使用无器械 / 自重候选。
- [x] 1.2 更新 `searchExercises` 工具说明，要求模型把默认无器械写入结构化 filters，而不是只写进自由文本回复。
- [x] 1.3 在 Agent `searchExercises` 输入归一化处实现执行型候选默认无器械；仅在没有正向可用器械、居家条件或已确认可用器械事实时生效。
- [x] 1.4 确保默认无器械不影响动作库页面、composer 或普通 `/api/exercises` 查询。

## 2. Routine 与 Plan 生成

- [x] 2.1 调整 `generateRoutineDraft` 的 intent 默认值：未指定器械时补齐无器械 / 自重边界，并在生成、校验、保存链路中保持一致。
- [x] 2.2 调整 `generatePlanDraft` 的 strategy / intent 默认值：未指定器械时按无器械长期计划生成。
- [x] 2.3 调整长期计划触发门控：目标、周频和单次时长已足够时，不再因缺少器械或场地追问。
- [x] 2.4 保留当前消息或已确认上下文中的正向可用器械优先级，确保“我有哑铃”“有弹力带”等不会被默认无器械覆盖。

## 3. 测试

- [x] 3.1 补充动作推荐回归测试：`今天我想练胸` 未指定器械时，`searchExercises(candidateUse="recommendation")` 必须使用无器械候选并产生推荐卡。
- [x] 3.2 补充 routine 回归测试：`今天练胸30分钟` 未指定器械时，候选集合、draft intent 和 artifact 摘要都应表达无器械。
- [x] 3.3 补充显式器械回归测试：`我有哑铃，今天练胸30分钟` 必须使用哑铃条件，不被默认无器械覆盖。
- [x] 3.4 补充长期计划回归测试：目标、周频和单次时长足够但未指定器械时，应生成无器械 plan，而不是追问器械。
- [x] 3.5 补充当前消息覆盖测试：历史有哑铃但当前消息明确“今天不用器械”时，应使用无器械。

## 4. 验证与文档

- [x] 4.1 运行相关自动化测试，至少覆盖 `tests/agent-orchestrator.test.ts`、`tests/chat-service.test.ts` 和 `tests/exercise-service.test.ts` 中新增或受影响用例。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `openspec validate default-unspecified-equipment-to-no-equipment --strict`。
- [x] 4.4 若实现阶段修改核心链路，按项目规则更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`。
