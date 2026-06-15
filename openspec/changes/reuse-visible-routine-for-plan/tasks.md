## 1. 合同治理

- [x] 1.1 完成 Agent 修复方案抽象层级门禁审查，确认不新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。
- [x] 1.2 完成 Agent prompt/model-visible 合同检查，确认规则分别落在默认 prompt、tool description、schema description 或 tool result summary 的正确层级。
- [x] 1.3 运行 `openspec validate reuse-visible-routine-for-plan --strict`。

## 2. 模型可见合同实现

- [x] 2.1 更新默认 Agent prompt 的停止条件和周期计划示例，表达已有可消费训练事实可派生 `plan` 并只补 `schedule`。
- [x] 2.2 更新 `inspectVisibleTrainingProposals` description 和 model-visible summary，增加历史 fact 可复用字段、`plan` 缺失字段和非 action 指令边界。
- [x] 2.3 更新 `submitVisibleTrainingProposal` description，明确 `payload.exerciseItems[]` 可以来自已导入历史 `visibleTrainingProposal` fact，`schedule` 由模型构造并交给 validator 校验。

## 3. 当前上下文投影

- [x] 3.1 更新聊天请求 hydration，保留 saved context 长期事实，同时用本轮 raw messages 覆盖 current-run `latestUserMessage` 和低歧义当前事实。
- [x] 3.2 确认该合并逻辑不根据用户原文决定 `toolName`、`payload.kind`、动作查询或结构化推送。

## 4. 测试

- [x] 4.1 更新或新增 `inspectVisibleTrainingProposals` tool-level tests，覆盖完整 `routine` fact 的 `derivationFacts`、`exercise_selection` 缺 prescription 的缺口，以及 summary 不包含固定下一步 action。
- [x] 4.2 更新 production tool catalog / model-visible contract tests，覆盖新增模型可见说明并防止 `supportsOutputKinds`、`nextActionHints` 或固定 tool flow 回流。
- [x] 4.3 更新 chat hydration tests，覆盖 saved `conversationContext.knownFacts.latestUserMessage` 不覆盖本轮最新用户消息。

## 5. 验证和收尾

- [x] 5.1 运行与本次改动相关的最窄测试。
- [x] 5.2 运行 `npm run typecheck`。
- [x] 5.3 运行 `git diff --check` 并检查 diff，确认没有混入无关工作区改动。
