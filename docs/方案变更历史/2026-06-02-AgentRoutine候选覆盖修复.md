# Agent Routine 候选覆盖修复

时间：2026-06-02 01:29:43 CST

## 背景

最新 AI Trace 中，用户要求把 8 个弹力带臀腿动作编成一套训练。Agent 已正确调用 `searchExercises -> generateRoutineDraft -> validateRoutineDraft -> evaluatePolicy -> saveConversationArtifactRevision`，但 `generateRoutineDraft` 的服务端草稿生成器固定为 `warmup / training / stretch` 各挑 1 个动作，最终 routine 只保留了 2 个唯一动作。

这不是前端展示问题，而是生成工具本身把传入的候选动作当成“可选池”，没有把用户指定动作当成必须保留集合。

## 调整思路

- `generateRoutineDraft` 以传入的 `candidateExerciseIds` 作为必须保留动作。
- training section 支持多个动作项，不再强制每个 section 只有 1 个动作。
- 缺少 `warmup` 或 `stretch` 时，服务端从动作库中选择受控补充动作，并把补充动作加入后续校验候选边界。
- `validateRoutineDraft`、Policy 和保存链路继续从服务端 tool result 解析完整 draft 与扩展后的候选边界，避免让模型复写 payload。
- 动作元数据推断区分“髋伸展 / hip extension”这类力量动作和真正的拉伸动作。

## 关键改动

- `lib/server/agent-orchestrator/workout-tools.ts`
  - `buildRoutineDraftFromCandidates()` 现在返回 `{ draft, candidateExerciseIds }`。
  - 新增 routine section 分桶逻辑，保证指定候选动作全部进入 routine。
  - 缺失阶段时通过动作库补齐，并把补充动作纳入 `candidateExerciseIds`。
- `lib/shared/exercises/metadata.ts`
  - 修正 `伸展 / extension` 的 stretch 推断，避免 `Hip_Extension_with_Bands` 被误判为仅允许拉伸。
- 测试
  - 覆盖 8 个指定动作全部保留、training 多动作、缺热身/拉伸补齐、髋伸展进入主训练、腘绳肌拉伸仍进入拉伸。

## 验证

- `npm test -- tests/agent-orchestrator.test.ts tests/workout-plan-validation.test.ts`
- `npm run typecheck`

两个检查均通过。
