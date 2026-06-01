## 1. 回归复现与测试基线

- [ ] 1.1 基于现有 trace 复现 `exercise_replacement` 被恢复为 `action.kind = "none"`、`responseMode = "answer_only"` 的单元测试。
- [ ] 1.2 增加“请求替换动作但未指定替代动作”测试，断言服务端返回 `assistantSuggestions` 而不是仅在正文中列 Markdown 候选。
- [ ] 1.3 增加“用户选择候选动作后触发 Patch 或修订 artifact”的测试，断言结果不是普通 `answer_only`。
- [ ] 1.4 增加“未触发 action 时最终回复不得承诺更新卡片”的测试。

## 2. Resolved Intent 与引用解析

- [ ] 2.1 梳理 `parseChatIntentModelOutput`、`createResolvedChatIntent`、`deriveChatIntentFromResolvedIntent` 和 `validateResolvedIntentGate` 中 `exercise_replacement` 的结构恢复边界。
- [ ] 2.2 修复 `type = "exercise_replacement"` 且 `action.kind` 缺失或为 `none` 时的 resolved action 推导，确保保留 `action.kind = "exercise_replacement"`。
- [ ] 2.3 为 `exercise_replacement` 补齐 `referenceRequirement.required = true`，并确保 `/api/chat` 在 Patch 前进入 ReferenceResolver。
- [ ] 2.4 确保引用解析失败、歧义或缺少 source exercise 时返回澄清建议，不执行 Patch。

## 3. 替换候选与 Pending Selection

- [ ] 3.1 定义 pending replacement selection 的结构，包含 artifactId、artifactKind、sourceExerciseId、sourceExerciseName、candidateExerciseIds、createdAt 和过期边界。
- [ ] 3.2 在“已定位 source exercise 但缺少 replacement exercise”时生成替换候选，并把候选归一化为 `assistantSuggestions`。
- [ ] 3.3 确保每条候选 suggestion 的 `message` 是完整用户口吻替换表达，例如“把上斜哑铃前平举换成侧平举至前平举”。
- [ ] 3.4 将 pending selection 保存到当前会话可恢复的结构化上下文中，并保持 userId/sessionId 隔离。
- [ ] 3.5 在下一轮消费 pending selection：按钮消息直接执行完整替换表达，手动输入只允许在候选集合内唯一命中。
- [ ] 3.6 对候选选择歧义、过期、artifact 已失效或 source exercise 不存在的情况返回澄清或恢复建议。

## 4. Workout Patch 执行

- [ ] 4.1 将 pending selection 或完整替换表达转化为 `replace_exercise` operation。
- [ ] 4.2 应用 Patch 前重新读取并校验目标 artifact payload，确认当前用户可访问且仍包含 sourceExerciseId。
- [ ] 4.3 确保 replacementExerciseId 来自服务端候选集合和数据库，不接受模型编造或候选外动作。
- [ ] 4.4 Patch 成功后返回新的 artifact revision、Patch diff 或等价修订结果，并保留未被替换训练内容。
- [ ] 4.5 Patch 失败时返回可恢复 `assistantSuggestions`，不展示未通过校验的修订 artifact。

## 5. 回复、Trace 与前端边界

- [ ] 5.1 收紧最终回复上下文：当 `assistantAction` 为空或 artifact 未请求时，模型不得承诺会生成、更新或展示训练内容。
- [ ] 5.2 对候选建议、引用澄清、Patch 成功和 Patch 失败分支优先使用确定性回复或受控回复模板。
- [ ] 5.3 在 AI Trace 中记录 replacement resolved intent、referenceResolution、pending selection、候选建议归一化、Patch 执行和回复一致性判断。
- [ ] 5.4 检查前端仍只消费 `assistantSuggestions`，不新增从 Markdown 正文解析候选按钮的逻辑。

## 6. 验证与文档

- [ ] 6.1 运行相关单元测试：`npm run test -- tests/chat-service.test.ts tests/workout-patch-chat-service.test.ts`。
- [ ] 6.2 如修改黑盒 flow fixture 或 runner，运行对应的手动 LLM flow 策略测试或说明未运行真实模型的原因。
- [ ] 6.3 运行 `npm run typecheck`。
- [ ] 6.4 运行 `openspec validate fix-exercise-replacement-selection-flow --strict`。
- [ ] 6.5 如实现涉及核心链路或架构调整，在 `docs/方案变更历史` 新增方案变更记录，并按需追加 `docs/项目演变历程.md`。
