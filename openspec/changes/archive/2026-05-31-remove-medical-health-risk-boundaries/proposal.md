## Why

当前系统仍会把用户主动表达的疼痛、伤病或身体不适转成候选过滤、长期记忆约束或替换拒绝原因，导致用户明明已经决定训练时，系统替用户做“是否能练”的决策并阻断正常结果。

产品方向调整为：系统只负责生成训练内容和避免医疗诊断，不再基于医疗健康信号替用户决定动作、计划或替换是否可生成。

## What Changes

- **BREAKING**：健康、疼痛、伤病、不适、身体限制和动作风险标签不再作为动作推荐、单次编排、长期计划或 workout patch 的候选排除、拒绝或降级原因。
- 用户消息中的健康/不适信息不再被写入会影响候选选择的长期约束，不再触发健康确认流。
- 用户只表达身体不适时，不再被固定降级为一般建议；如果同时能推断训练/动作诉求，系统按普通训练诉求处理。
- 保留“不得提供医疗诊断或治疗承诺”的回复边界；这只约束文案，不参与训练生成决策。
- 更新相关测试与文档，确保旧的健康风险阻断断言被删除或改成“不阻断”。

## Capabilities

### New Capabilities
- 无

### Modified Capabilities
- `health-safety-gating-removal`: 扩展为完全移除健康/医疗风险对训练结果生成的决策影响，而不仅是移除触发前置问询。
- `user-feedback-memory`: 健康/不适信号不再作为训练保守约束或长期候选排除记忆。
- `policy-confirmation`: 健康/不适信号不再进入长期记忆确认流。
- `workout-patch`: 替换动作不再因为 `riskTags` 中的高风险/高冲击标签被拒绝。

## Impact

- 影响 `lib/server/workout-plans/exercise-candidate-service.ts` 的候选排除逻辑。
- 影响 `lib/server/user-feedback-memory/user-feedback-memory-service.ts` 和 `lib/server/policy-confirmation/policy-engine.ts` 的健康信号记忆/确认逻辑。
- 影响 `lib/server/chat/chat-service.ts` 的健康独立消息归一化和动作讲解文案。
- 影响 `lib/server/workout-patches/workout-patch-engine.ts` 的替换动作风险拒绝。
- 影响 `lib/server/ai/prompt-config.ts` 中健康/疼痛作为动作选择边界的提示词。
- 影响相关测试、架构文档、数据库设计说明和方案变更历史。
