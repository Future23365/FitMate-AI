# Agent Runtime 资源合同稳定化

记录时间：2026-06-02 20:13:13 CST

## 原问题

Tool-first Agent 主链已经收敛到“模型传 `toolResultId`，服务端从当前 run 恢复完整 payload”的资源合同，但运行时仍存在几个边界不够明确的问题：

- `searchExercises` 在候选非空但 `resultRequirements` 未满足时容易被当成普通失败或误当成可消费候选。
- failed、partial、feedback 这类诊断结果缺少稳定角色，模型和 Response Writer 容易把诊断证据和成功资源混用。
- `askClarification` 成功后如果模型包装成 `answered`，用户可能看到通用失败，而不是澄清问题。
- routine / plan / patch 链路进入执行阶段后，模型仍可能用自由文本 `answered` 声称已经生成训练。
- 用户说有哑铃时，器械边界会被过度压到 warmup / stretch，导致三段式 routine 因热身或拉伸候选不足而失败。

## 调整思路

本次不在服务端重新解释用户自然语言，而是把资源合同显式化：tool result 先分成 `consumable`、`diagnostic`、`partial`、`feedback`，再由 runtime 按 final result 类型决定能否引用。可消费资源才能驱动生成、校验、保存；诊断资源只能用于解释、澄清、阻断和 trace 展示。

## 关键改动

- Agent runtime 增加资源角色与摘要字段，并将 `availableResources` 拆成可消费资源和诊断资源。
- `validateFinalResultReferences()` 按 `generated`、`patched`、`completed_operation`、`answered`、`blocked`、`failed`、`needs_clarification` 分层校验引用。
- `askClarification` 成功后稳定投影为 `needs_clarification`，保留问题、建议按钮和阻断原因。
- `searchExercises` 对未满足结果要求但候选非空的结果返回 partial candidate 诊断，不进入可消费候选 registry。
- routine / plan / patch 依赖 partial candidate 时返回结构化依赖失败，不允许冒充生成成功。
- routine 候选补齐支持 warmup / stretch 使用数据库中的无器械受控补充动作，并把补充证据纳入 validation。
- prompt、模型输入、trace view model 和手动 LLM 黑盒诊断字段同步展示资源角色、partial candidate、澄清投影和防逃逸证据。

## 验证结果

- `npm run typecheck`
- `npm test -- --run tests/agent-orchestrator.test.ts tests/exercise-service.test.ts tests/readonly-tools.test.ts tests/chat-service.test.ts tests/ai-trace-viewer.test.ts tests/manual-llm-flow-policy.test.ts`
- `npm test -- --run tests/workout-plan-validation.test.ts`
- `openspec validate stabilize-agent-runtime-resource-contract --strict`

