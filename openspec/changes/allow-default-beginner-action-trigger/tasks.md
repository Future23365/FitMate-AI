## 1. 服务端触发门控

- [x] 1.1 更新 `getActionBlockingMissingFields` / `isMissingFieldSatisfiedByIntent`，让 `experience` 或等价经验字段在 `WorkoutPlanIntent.experience` 已有合法默认值时不再阻断内部动作。
- [x] 1.2 确认健康字段和经验字段都缺失时仍能触发动作推荐、单次 routine 或长期 plan，但候选不足、目标缺失、时长缺失、频率缺失、器械或场地缺失等核心条件仍会阻断。
- [x] 1.3 保持默认经验只作为新手友好生成边界，不把默认值写成用户明确声明的长期事实。

## 2. Prompt 与回复一致性

- [x] 2.1 更新意图解析 prompt，明确用户未说明经验时应默认按简单/新手友好推送，不要把 `experience` 作为单独阻断字段。
- [x] 2.2 更新回复生成 prompt 或服务端传参，让没有内部动作时必须追问仍阻断的缺失信息，已触发内部动作时才使用“按当前条件整理”的自然过渡。
- [x] 2.3 检查会话摘要更新逻辑，避免把默认 `beginner` 表述成用户明确确认的经验水平。

## 3. 自动化验证

- [x] 3.1 补充 `tests/chat-service.test.ts`，覆盖 `routine` 在 `missingActionFields: ["experience"]` 且核心条件满足时触发 `workout_routine`。
- [x] 3.2 补充 `tests/chat-service.test.ts`，覆盖 `workout_plan` 在 `missingActionFields: ["experience", "injuryLimitations"]` 且核心条件满足时触发 `workout_plan`。
- [x] 3.3 补充测试确认候选不足或核心条件不足时不会因为默认经验策略误触发。
- [x] 3.4 运行 `npm test` 和 `npm run typecheck`；如影响构建边界，再运行 `npm run build` 或说明无法运行原因。
