## 1. 动作推荐 artifact 稳定性

- [x] 1.1 调整聊天动作上下文类型，让 `exercise_recommendation` artifact 生成可以使用完整动作对象补展示字段。
- [x] 1.2 移除动作推荐路径中的半截 `Exercise` 强转，并为图片字段增加安全读取。
- [x] 1.3 增加自动化测试覆盖纯动作推荐生成候选缺少图片时不抛异常。

## 2. 长期计划补齐门控

- [x] 2.1 修正长期计划补齐判断，确保只补频率和时长但仍缺目标或器械时不触发 `workout_plan`。
- [x] 2.2 增加自动化测试覆盖 F05 第 2 轮：笼统计划后补“每周4练，每次45分钟”继续追问。

## 3. 手动黑盒报告完整性

- [x] 3.1 调整手动 LLM 黑盒 runner，任意轮次失败后把同流程剩余轮次记录为 skipped。
- [x] 3.2 增加或更新测试，覆盖中途失败后报告仍记录完整 fixture 轮次。

## 4. 文档与验证

- [x] 4.1 更新方案变更历史和项目演变历程，记录本次黑盒错误修复。
- [x] 4.2 运行 `npm run test -- tests/chat-service.test.ts`。
- [x] 4.3 运行 `npm run test -- manual-tests/llm/llm-consistency.test.ts` 或说明缺少真实模型配置时的替代验证。
- [x] 4.4 运行 `npm run typecheck`。
- [x] 4.5 运行 `openspec validate fix-chat-blackbox-runtime-regressions --strict`。
