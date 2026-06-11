# 2026-06-02 Agent Routine 分段器械边界修复

记录时间：2026-06-02 20:31:54 +0800

## 当前真实问题

最新 `codex_logs/ai_trace_log.js` 中，用户已经回答了训练经验、热身偏好、拉伸偏好，并明确说“热身/拉伸无器械，训练阶段全部用哑铃”。但 Agent 仍反复把 `equipment.in = ["dumbbell"]` 当作整套 routine 的全局约束，后续虽然 `searchExercises` 已经用 `controlledSupplementalCandidates` 补出了 warmup / stretch 动作，`generateRoutineDraft` 仍报 `candidate_set_missing_warmup`，最终 tool loop `timeout`。

旧的资源合同修复已经要求“有哑铃”默认只约束主训练，但真实实现中 draft builder 没有消费补充候选的 section evidence，而是重新按动作通用元数据分段。动态拉伸类动作因此被挪到 `stretch`，warmup 覆盖再次丢失。

## 调整思路

这次不通过服务端关键词判断用户语义，也不让模型自由发明动作。修复点放在结构化证据链：

- `searchExercises` 产生的 `candidateSetEvidence.controlledSupplementalCandidates` 是本轮服务端工具事实。
- `generateRoutineDraft` 生成三段式 routine 时优先使用该 evidence 中的 `section`。
- 缺少 warmup / stretch 时，默认优先选择无器械或自重候选；training 仍优先匹配用户器械。
- prompt / tool description 只做辅助说明，核心行为由服务端可测逻辑保证。

## 关键改动

- `buildRoutineDraftFromCandidates()` 接收 `candidateSetEvidence`。
- `buildRoutineSectionBuckets()` 对命中 `controlledSupplementalCandidates` 的动作按 evidence section 放置。
- `pickSupplementalExerciseForSection()` 对 warmup / stretch 优先无器械或自重动作，不再默认匹配 `intent.equipment`。
- `searchExercises` 工具说明同步强调普通器械默认约束 training，不默认约束 warmup / stretch。
- OpenSpec change `relax-routine-phase-equipment-boundaries` 记录了分段器械边界和受控补充 evidence 的验收要求。

## 验证结果

- `npm test -- tests/agent-orchestrator.test.ts tests/exercise-service.test.ts`：通过，81 个测试通过。

后续仍需继续观察真实 LLM trace，确认模型在相同对话里能从 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> saveConversationArtifactRevision` 完整收口。
