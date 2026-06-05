## 1. 现状确认与边界

- [x] 1.1 读取 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`，确认失败链路是相同文本 user turn 被 hydration 去重吞掉，并且 `recentVisibleTrainingProposals` 暴露完整旧方案动作。
- [x] 1.2 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不触碰 Agent core 主循环、`PlannerPort`、`Response Renderer` 或服务端自然语言分流。
- [x] 1.3 运行 `git status --short`，识别已有无关改动；本 change 不混入 `features/chat/components/chat-page.tsx`。
- [x] 1.4 任务分类：production 接入修复 + context / observation 投影修复；不是新增业务 tool，不做 core contract 变更。

## 2. 消息 hydration 修复

- [x] 2.1 更新 `appendLatestUserMessageIfMissing()`，只在 saved conversation 最后一条消息本身是同内容 `user` 时跳过追加。
- [x] 2.2 覆盖原始失败形态：历史为 `user: 不要` 后已有 `assistant` 回复，新请求 `latestUserMessage = "不要"` 时必须追加新的 user 消息。
- [x] 2.3 覆盖真实重复保护：历史最后一条本身就是同内容 `user` 时，不重复追加。
- [x] 2.4 覆盖等价变体，例如 `"换一批"` 或 `"再来一组"` 在 assistant 已回复后再次发送同文本时仍追加。

## 3. recent fact metadata 投影修复

- [x] 3.1 为 `recentVisibleTrainingProposals` 建立模型可见索引投影，字段范围只包含引用、状态、版本、创建时间、`proposalKind`、`sectionSummary` 和 `reusableTrainingExerciseCount`。
- [x] 3.2 确保 `run.metadata.recentVisibleTrainingProposals` 不再包含 `exerciseItems`、`prescription`、`schedule`、图片、肌群、器械或完整展示详情。
- [x] 3.3 保持 `listRecentVisibleTrainingProposalSummaries()` 和 `readVisibleTrainingProposalFact()` 的持久化读取能力；完整事实只通过 `inspectVisibleTrainingProposals(read_recent)` 导入当前 run。
- [x] 3.4 更新 `inspectVisibleTrainingProposals` 相关测试，确认 `list_recent` output 的轻量索引边界仍成立，`read_recent` 成功才产出 consumable resource。

## 4. 验证

- [x] 4.1 运行 `openspec validate fix-chat-repeat-message-and-visible-fact-projection --strict`。
- [x] 4.2 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 4.3 运行 `npm test -- tests/visible-training-proposal-fact-store.test.ts`。
- [x] 4.4 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [x] 4.5 运行 `npm run typecheck`。

## 5. 收口

- [x] 5.1 检查最终 diff，确认未混入无关 UI 改动、旧链路兼容层或服务端自然语言关键词判断。
- [x] 5.2 在 `docs/方案变更历史` 下新增本次方案变更记录。
- [x] 5.3 在 `docs/项目演变历程.md` 末尾追加本次修复摘要。
- [x] 5.4 完成任务后提交本次变更，提交消息使用中文。
