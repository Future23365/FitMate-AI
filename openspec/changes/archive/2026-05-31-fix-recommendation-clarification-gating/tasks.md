## 1. 服务端编排

- [x] 1.1 调整 `canTriggerAssistantAction()`，让非空 `suggestedReplies` 在 `canTriggerAction = false` 时阻断 `exercise_recommendation`
- [x] 1.2 确认 `resolveVisibleSuggestedReplies()` 在未触发内部动作时保留建议回复
- [x] 1.3 更新 `chatIntentResolution` Prompt，说明纯动作推荐直接触发时不得返回建议追问

## 2. 测试与验证

- [x] 2.1 更新 `tests/chat-service.test.ts`，覆盖“有建议追问不得推送动作”的 trace 回归场景
- [x] 2.2 保留目标明确纯动作推荐可直接触发的测试
- [x] 2.3 运行 `npm test -- tests/chat-service.test.ts`
- [x] 2.4 运行 `npm run typecheck`
- [x] 2.5 运行 `openspec validate fix-recommendation-clarification-gating --strict`
