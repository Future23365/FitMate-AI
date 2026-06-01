## 1. 意图契约收敛

- [ ] 1.1 梳理 `chatIntentSchema`、`resolvedChatIntentSchema` 和当前模型输出字段，明确 resolved intent 到旧字段的兼容派生关系。
- [ ] 1.2 调整 `chatIntentResolution` prompt，使模型主输出围绕 `action`、`responseMode`、`fieldSources`、`referenceRequirement` 和 `workoutIntent`。
- [ ] 1.3 实现旧字段派生或归一化层，确保 `type`、`canTriggerAction`、`missingActionFields` 不再独立覆盖 resolved intent。
- [ ] 1.4 补充 resolved intent 冲突、repair 失败、默认值来源和短指令继承的单测。

## 2. 用户可见回复边界

- [ ] 2.1 为动作推荐、routine、plan 和 patch 成功结果设计服务端 response writer 输出规则。
- [ ] 2.2 确保执行型回复只消费 action kind、artifact result、字段来源和非 default 字段摘要。
- [ ] 2.3 禁止执行型回复输出 raw JSON、内部 trigger、prompt、后台流程、马上生成、稍后生成或等价流程文案。
- [ ] 2.4 补充 artifact 成功、artifact 失败、default 字段不可伪装为用户确认条件的单测。

## 3. Summary 和上下文事实边界

- [ ] 3.1 调整 summary 更新输入和 prompt，使服务端内部动作摘要、resolved intent 和 artifact result 优先于 assistant 自然语言。
- [ ] 3.2 防止默认时长、默认频率、默认经验或 assistant 口误被写入 `conversationSummary` 作为用户事实。
- [ ] 3.3 补充 summary 更新失败、summary 不固化默认值、summary 与 artifact 冲突时以结构化事实为准的单测。

## 4. Prompt 与 payload 瘦身

- [ ] 4.1 将 workout draft schema 按 `intent.intentType` 拆分注入，routine 请求不带完整 plan schema，plan 请求不带完整 routine schema。
- [ ] 4.2 去除 workout draft repair prompt 中重复的基础修复指令，并按 validation errors 注入必要修复指导。
- [ ] 4.3 将最终回复 server context 压缩为 compact summary，避免传入完整 resolved intent、完整 artifact payload 或无关 trace 诊断。
- [ ] 4.4 更新 token budget trace 元数据，记录本阶段 promptModules、schema kind、candidateTrim 和跳过原因。

## 5. 只读工具决策

- [ ] 5.1 调整只读 tool decision prompt，列出每个工具的用途和 input schema 摘要，而不是只给工具名和空 input。
- [ ] 5.2 明确 tool decision 的 finish 条件，并确保工具结果不得改变 resolved intent 的动作触发状态。
- [ ] 5.3 补充只读工具非法入参、finish decision、工具结果不触发写动作的单测。

## 6. 黑盒验收与文档

- [ ] 6.1 扩展手动 LLM 黑盒 fixture，覆盖默认值泄漏、多轮短指令动作类型漂移和执行型流程文案泄漏。
- [ ] 6.2 更新手动 LLM 报告字段，保留 prompt token、completion token、total token、traceId 和失败定位信息。
- [ ] 6.3 运行 `npm test` 或相关单测，并运行 `npm run typecheck`。
- [ ] 6.4 在用户确认真实模型成本后运行相关 `npm run test:llm` 子集或说明未运行原因。
- [ ] 6.5 如实现阶段调整 AI 编排或核心链路，更新 `docs/方案变更历史/` 和 `docs/项目演变历程.md`。
