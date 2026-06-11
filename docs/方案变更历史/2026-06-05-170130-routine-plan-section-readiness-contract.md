# 2026-06-05 17:01:30 CST routine / plan section readiness 合同硬化

## 背景

`visibleTrainingProposal` 统一后，`routine` / `plan` 已经要求同时具备 `warmup`、`training`、`stretch` 三类动作事实。此前 prompt 和 `searchExerciseResources` observation 已经提示模型“应优先补齐”，validator 也会用 `section_coverage_missing` 兜底拒绝缺 section 的结构。

问题在于这仍偏向建议式合同：当模型已经看到 `missingSectionsForRoutineOrPlan`，仍可能在正文解释缺热身或拉伸后提交缺 section 的 `routine` / `plan`，最终进入 repair 或 fallback。主成功路径不应该依赖失败后的 repair，而应该让模型在准备输出 `final_answer.visibleOutputs[]` 前就看到明确前置条件。

## 调整思路

本次把 section readiness 前移成模型可见的 final 前置条件：

- 默认 Agent prompt 明确：`final_answer.visibleOutputs[]` 中 `payload.kind = "routine"` 或 `"plan"` 的前置条件，是当前 run 已具备 `warmup`、`training`、`stretch` 三类可消费动作事实。
- 当当前 run 只有 `training`，或 `missingSectionsForRoutineOrPlan` 非空时，禁止输出 `routine` / `plan` 的 `visibleOutputs`，也不能在 `content` 里解释缺口后仍提交不完整结构。
- `searchExerciseResources` manifest 和 observation 明确缺 section 时可用 `suitabilities = ["warmup", "stretch"]` 或等价缺失 section 查询补齐，但不要求固定 tool 调用次数或顺序。
- validator 的 `section_coverage_missing` recovery 增加“不要再次提交缺 section 的 routine / plan”方向，只作为兜底反馈，不作为主成功路径。

## 关键边界

- 没有新增 `generatePlanDraft` / `generateRoutineDraft` 或服务端训练生成 tool。
- 没有修改 `/api/chat`、Agent runtime、Executor、Policy Guard、ResourceStore 或 Response Renderer。
- 没有根据用户原文、关键词、正则、同义词或固定 phrasing 做服务端语义分流。
- `searchExerciseResources` handler、input schema、output schema 和数据库查询语义保持不变，仍只提供发布态动作事实。

## 验证

- `openspec validate harden-routine-plan-section-readiness-contract --strict`
- `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-tools/search-exercise-resources.test.ts tests/visible-training-proposal-validator.test.ts tests/chat-service.test.ts`
- `npm run typecheck`
- 边界扫描确认生产链路没有恢复旧 draft tool，也没有新增服务端自然语言分流。

真实 LLM 黑盒验证本次未执行；当前导出的 `codex_logs/ai_trace_log.js` 已被另一个成功 trace 覆盖，无法复用为原始失败证据。
