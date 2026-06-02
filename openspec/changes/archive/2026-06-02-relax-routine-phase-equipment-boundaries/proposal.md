## Why

最新 `codex_logs/ai_trace_log.js` 显示，用户已经三轮补齐训练经验、热身偏好、拉伸偏好和“训练阶段全部用哑铃”的边界，但 Agent 仍反复把 `equipment.in = ["dumbbell"]` 当作整套 routine 的全局约束，最终在候选搜索和 `generateRoutineDraft` 之间耗尽循环并 `timeout`。

旧 change 已要求“有哑铃”默认约束主训练，不默认压到 warmup / stretch；这次需要把该规则落成服务端可验证合同，避免仅靠 prompt 解释。

## What Changes

- 让 routine 候选 evidence 中的 `controlledSupplementalCandidates.section` 参与 `generateRoutineDraft` 分段，补充为 `warmup` 的动作不得被 draft builder 重新按元数据挪到 `stretch`。
- 调整 routine 缺失 section 的服务端补齐策略：warmup / stretch 默认优先使用无器械或自重动作；用户普通器械表达只约束 training，除非结构化输入明确把器械约束作用到全部 section。
- 补强 `searchExercises` / `generateRoutineDraft` 工具合同和 prompt 提示，使模型看到稳定的分段器械边界与恢复路径。
- 增加自动化测试覆盖最新日志场景：上肢 30 分钟、有哑铃、热身/拉伸无器械时不得再次询问用户，不得因 `candidate_set_missing_warmup` 失败。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-routine-composition`: 明确受控补充候选的 section evidence 必须作为 routine draft 分段事实源，并且普通器械表达不得默认约束 warmup / stretch。
- `agent-exercise-facet-contract`: 明确 `searchExercises` 与 Agent 工具输入需要表达 routine 分段器械边界，避免用全局 equipment 硬过滤污染三段式候选。

## Impact

- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 routine draft 构造、缺失 section 补齐和候选 evidence 消费。
- 影响 `lib/server/exercises/exercise-service.ts` 中 routine section coverage 受控补充证据和分段器械边界诊断。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts`、`lib/server/ai/prompt-config.ts` 中模型可见工具说明。
- 影响 `tests/agent-orchestrator.test.ts`、`tests/exercise-service.test.ts` 中相关回归测试。
- 不修改 Prisma Schema、数据库迁移、外部 `/api/chat` 请求契约或权限边界。
