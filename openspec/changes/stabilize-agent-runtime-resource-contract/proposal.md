## Why

最新 trace 显示，Agent 已经进入 Tool-first 主链并成功拿到动作候选诊断和澄清工具结果，但最终仍因 `final_result` 引用失败 tool result 被判为 `model_output_invalid`。根因不是旧链路残留或动作库完全无数据，而是 runtime 将“模型可见证据”“可执行成功资源”“可用于解释/澄清的诊断资源”混在同一套 `toolResultId` 合同中，导致基础 routine 流程在可恢复分支上被错误终止。

本 change 需要一次性修复第 1-7 项稳定性问题：资源合同、final result 引用校验、`askClarification` 收口、`searchExercises` 部分满足语义、routine 器械/section 约束、routine 链路防逃逸和相关测试。Token 输入压缩不在本 change 范围内。

## What Changes

- 将 Agent tool result 按用途拆分为可执行成功资源和诊断资源：成功且满足约束的结果才能驱动 draft、validation、policy、save；失败或部分满足的结果可用于 `answered`、`blocked`、`failed`、`needs_clarification` 的解释和澄清，但不能作为生成或写入依赖。
- 调整 final result 引用校验：`generated` / `patched` / `completed_operation` 继续只允许引用成功 producer；`answered` / `blocked` / `failed` / `needs_clarification` 可以引用本轮已登记诊断型 tool result，并在 Response Writer 中保留可追踪引用。
- 将 `askClarification` 作为一等终止路径处理：工具成功后 runtime 必须稳定投影为 `AgentExecutionResult.status = "needs_clarification"`，或强制模型以该结构化结果结束，不再把澄清问题塞进普通 `answered`。
- 调整 `searchExercises(candidateUse="routine"|"plan"|"patch")` 的部分满足语义：有候选但 `resultRequirements` 未满足时返回可诊断 partial candidate set，包含候选、缺失 section、履约证明和恢复建议；该结果不得被消费为可生成 candidate set。
- 修正 routine 生成中的器械和 section 约束表达：用户说“有哑铃”时，默认只把哑铃作为主训练候选硬约束；热身和拉伸可通过无器械或受控补充候选满足三段式结构，除非用户明确要求所有 section 都使用哑铃。
- 增加 routine / plan 链路防逃逸规则：一旦本轮已经进入 `searchExercises(candidateUse="routine"|"plan")` 或 `generateRoutineDraft` / `generatePlanDraft`，不能用普通 `answered` 自由文本宣称已生成；必须继续 validation / policy / save，或返回 `needs_clarification`、`blocked`、`failed`。
- 更新 Agent prompt、模型输入摘要、trace 诊断和黑盒断言，使模型和开发者能区分可消费资源、诊断资源、partial candidate、澄清终止和 routine 防逃逸。
- 补充相关单元测试、chat-service / Response Writer 测试、OpenSpec 验证和不触发真实模型费用的黑盒/fixture 验证步骤。

## Capabilities

### New Capabilities

- `agent-runtime-resource-contract`: 定义 Agent runtime 中可消费资源、诊断资源、partial tool result、final result 引用校验和澄清终止的统一合同。

### Modified Capabilities

- `tool-first-agent-orchestrator`: Agent loop、`AgentExecutionResult`、Response Writer 和 trace 的终止与引用规则需要区分成功资源和诊断资源，并稳定支持 `needs_clarification`。
- `agent-exercise-facet-contract`: `searchExercises` 对 routine / plan / patch 的部分满足结果需要返回可诊断 partial candidate，而不是把有用候选完全等同于不可消费工具失败。
- `chat-routine-composition`: routine 生成链路需要明确主训练器械约束、热身/拉伸补齐边界、partial candidate 恢复路径和防止自由文本 `answered` 逃逸。

## Impact

- 影响 `lib/server/agent-orchestrator/contracts.ts` 中 tool result、resource availability、partial candidate、final result 引用和澄清结果相关类型。
- 影响 `lib/server/agent-orchestrator/runtime.ts` 的 `visibleToolResultIds`、资源登记、`validateFinalResultReferences()`、`askClarification` 收口、routine / plan 防逃逸和 trace metadata。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 与 `lib/server/exercises/exercise-service.ts` 中 `searchExercises` 对 `resultRequirements` 未满足但候选非空时的输出合同。
- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 routine / plan draft 对 candidate set 的依赖校验，确保 partial / diagnostic candidate 不能进入生成。
- 影响 `lib/server/agent-orchestrator/response-writer.ts` 和 `lib/server/chat/chat-service.ts` 中 `needs_clarification`、blocked / failed 引用和 routine 结果投影。
- 影响 `lib/server/ai/prompt-config.ts` 和 Agent decision model input，使模型明确可引用诊断结果但不能消费失败资源。
- 影响 `/dev/ai-traces` view model、手动 LLM 黑盒 runner 和相关报告字段，用于展示 partial candidate、diagnostic tool result、clarification terminal 和 routine 防逃逸。
- 不修改 Prisma Schema、不新增数据库表、不改变 `/api/chat` 外部请求契约，不引入服务端关键词分流、同义词匹配或基于用户原文的语义纠偏。
