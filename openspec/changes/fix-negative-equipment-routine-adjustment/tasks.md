## 1. 回归复现与基线

- [ ] 1.1 基于最新 trace 增加单元测试：已有“30 分钟哑铃上肢 routine”后输入“`不用哑铃了，换一个`”，复现当前返回哑铃候选澄清的问题。
- [ ] 1.2 增加 ReferenceResolver 测试：调整类 resolved intent 且当前会话只有一个 active routine 时，应高置信解析到 recent artifact。
- [ ] 1.3 增加 artifact hybrid search 测试：`不用哑铃` 不得把“哑铃”作为正向 `textScore` / `rerank.reasons` 加分来源。
- [ ] 1.4 增加确定性澄清回复测试：多候选澄清必须是可读列表，不得拼成一整段长文本。

## 2. Resolved Intent 与器械覆盖

- [ ] 2.1 梳理 `parseChatIntentModelOutput`、`createResolvedChatIntent`、`deriveChatIntentFromResolvedIntent` 和 action gate 中器械调整短指令的结构恢复边界。
- [ ] 2.2 当 LLM 已表达调整、替换、重新生成或 patch 语义时，保留该高层 action，不因缺少完整 `workoutIntent` 降级为 `answer_only`。
- [ ] 2.3 将当前消息中的否定器械覆盖写入本轮结构化执行上下文，确保下游候选选择和生成输入不继续使用旧哑铃条件。
- [ ] 2.4 确保本修复不通过服务端关键词规则改写高层 `type`、`action.kind` 或 `workoutIntent.intentType`。

## 3. ReferenceResolver 与 Artifact Search

- [ ] 3.1 为 ReferenceResolver 增加调整类 current artifact hint 或等价参数，优先解析当前会话唯一 active routine/plan。
- [ ] 3.2 在 current recent artifact 不唯一、类型不匹配或用户明确引用历史对象时，保持现有歧义澄清或语义检索边界。
- [ ] 3.3 调整 `buildSemanticQuery`、artifact search query 规范化或 rerank 输入，使否定器械不作为正向匹配词。
- [ ] 3.4 对违反否定器械约束的 artifact 候选降权、过滤或标记 `constraint_mismatch`，并在 AI Trace 中输出原因。
- [ ] 3.5 保持肯定器械检索场景不回归，例如“找之前那套哑铃训练”仍能命中哑铃 artifact。

## 4. Patch / 重新生成执行链路

- [ ] 4.1 判断“整套不用某器械”应走局部 Patch 还是受控重新生成；实现时优先选择能保持目标、时长和校验边界清晰的路径。
- [ ] 4.2 若走 Patch，确保替代动作来自服务端候选集合和数据库，并通过 WorkoutPatchEngine / Validator。
- [ ] 4.3 若走重新生成，确保沿用最近 routine 的目标、时长和经验，只覆盖器械条件，并创建新的 artifact revision 或等价结果。
- [ ] 4.4 失败时返回可恢复建议或明确澄清，不展示违反器械约束或未通过校验的 artifact。

## 5. 用户回复、建议与 Summary

- [ ] 5.1 将 ReferenceResolver 的 `clarificationQuestion` 改为短引导语加多行列表或等价可读结构。
- [ ] 5.2 过滤或降权引用确认 `assistantSuggestions` 中明显违反当前否定器械约束的候选。
- [ ] 5.3 确保自然语言回复、`assistantSuggestions`、resolved intent 和 artifact / patch 结果一致，不再推荐已被用户否定的哑铃方案。
- [ ] 5.4 调整 summary 更新输入和确定性 fallback，使“当前已改为不使用哑铃/无哑铃”写入新 summary。
- [ ] 5.5 在 AI Trace 中记录器械覆盖、recent artifact 命中、否定约束过滤、澄清候选数量和 summary 覆盖结果。

## 6. 验证与文档

- [ ] 6.1 运行相关单元测试：`npm run test -- tests/chat-service.test.ts tests/reference-resolver-service.test.ts tests/conversation-artifact-service.test.ts tests/conversation-summary-service.test.ts`。
- [ ] 6.2 运行 `npm run typecheck`。
- [ ] 6.3 运行 `openspec validate fix-negative-equipment-routine-adjustment --strict`。
- [ ] 6.4 如修改黑盒 flow fixture 或 runner，运行对应策略测试；若不跑真实模型测试，说明原因和替代验证。
- [ ] 6.5 如实现涉及核心链路调整，在 `docs/方案变更历史` 新增方案变更记录，并按需追加 `docs/项目演变历程.md`。
