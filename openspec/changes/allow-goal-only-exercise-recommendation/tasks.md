## 1. 服务端触发规则

- [x] 1.1 调整 `exercise_recommendation` 的服务端 gating，使目标明确且候选可用时不再被 `equipmentOrLocation` 阻断。
- [x] 1.2 保留 `routine` 和 `workout_plan` 的现有缺失字段阻断规则。
- [x] 1.3 更新意图解析 prompt，明确纯动作推荐不需要器械、场地或训练时长才能触发。

## 2. 验证

- [x] 2.1 增加或更新单元测试，覆盖“我想练腿”缺少器械/场地但候选可用时触发 `exercise_recommendation`。
- [x] 2.2 增加或更新单元测试，覆盖动作候选不足时仍不触发推荐事件。
- [x] 2.3 运行相关测试和 OpenSpec strict 校验。
