# LangChain support section 模型合同回补

## 时间

2026-06-11 15:08:47 CST

## 问题

生产聊天迁移到 LangChain DeepSeek native `tool_calls` 后，旧 `visibleTrainingProposal` output contract 中关于 `routine` / `plan` 应优先补齐 `warmup` / `stretch` 的模型可见规则没有等价迁移。实际 trace 中，模型已经通过 `searchExerciseResources` 得到 `training` 动作事实，并看到 `missingSections = ["warmup", "stretch"]`，但仍直接调用 `submitVisibleTrainingProposal` 提交了只含主训练的 `routine`。

这不是动作库不支持热身或拉伸查询，也不应通过服务端读取用户原文或自动补动作修复。服务端 validator 当前只把 `training` 作为硬边界，`warmup` / `stretch` 是模型生成偏好。

## 调整思路

- `searchExerciseResources` 继续保持只读动作事实查询能力，但在模型可见 description 和 observation 中明确：当目标需要 `routine` 或 `plan`，已有 `training` 但缺少 `warmup` / `stretch` 且仍可继续查询时，应优先用缺失 section 的 `suitabilities` 查询 support section 候选。
- `submitVisibleTrainingProposal` 继续作为结构化训练卡片收口工具，但在模型可见说明中强调：提交 `routine` / `plan` 前应优先具备 `warmup`、`training`、`stretch` 三类当前可见动作事实；不能把正文建议当作结构化动作事实。
- 不新增服务端关键词、正则、短句模板、固定 tool 调用顺序或自动补动作逻辑。

## 关键改动

- 更新 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 的 `searchExerciseResources` description 和 model-visible summary。
- 更新 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 的 `submitVisibleTrainingProposal` description 和 `payload` schema description。
- 补充 LangChain tool 测试，断言生产 tool catalog、查询 observation 和收口工具说明都保留 support section readiness 合同。

## 验证

已运行：

```bash
npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts
npm run typecheck
openspec validate --all --strict
```
