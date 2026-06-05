## Why

当前 Agent core 使用 `ToolResult.fulfillment.satisfied` 同时表达“tool 执行完成后是否可作为成功 grounding”和“该结果是否满足某个业务目标”。这个布尔值把过程事实、业务目标满足度和最终输出合法性混在一起，导致 core 可能把 `totalMatches = 0` 这类有效事实误当成不能支撑 `final_answer` 的失败边界。

这违背项目的根本原则：服务端 core 不理解用户语义，不根据中间 tool 结果判断业务目标是否完成。tool result 只应是当前 run 的事实材料；最终是否满足用户要求，应只看模型最终输出是否通过结构化 final output validator。

## What Changes

- 删除或降级 `fulfillment.satisfied` 作为 Agent core 硬边界的作用。
- `ToolResult.ok = true` 表示 tool 成功执行；即使返回 0 条、候选不足或只产生诊断摘要，也可以作为普通 `final_answer` 的事实来源。
- `final_answer.usedRefs[type = "tool_result"]` 只校验引用是否属于当前 run、tool result 是否 `ok = true`，不再因中间业务满足度字段拒绝普通文本回答。
- `visibleOutputs[]` 继续通过 `TerminalOutputValidatorRegistry` 做最终输出验收。训练方案数量、动作 id、section、prescription、schedule、是否能展示或保存，都在最终 validator 判定。
- resource 的 `role` / `resourceContract` 继续保留，但只表达资源用途和消费合同，不表达“业务目标已经满足”。
- duplicate tool 熔断保留成本和循环控制职责，但命名和 feedback 应从 `duplicate_tool_success` 调整为不包含业务成功含义的 `duplicate_tool_input` 或等价表达。
- repair feedback 只表达确定性事实：同 input 已执行、结果摘要、当前 refs/resources、最终输出 validator 要求；不得告诉模型必须调用哪个具体业务 tool。
- 更新 prompt / model input / observation / compressed tool results 中关于 `satisfied`、`unsatisfied`、diagnostic result、0 条结果和 final grounding 的说明，避免继续把中间结果当业务成功 gate。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-tool-contract-kernel`: Agent core 不再用 `ToolResult.fulfillment.satisfied` 判定普通 `final_answer` 是否可成功收口；最终业务成功由 terminal visible output validator 判定。
- `agent-contract-repair-loop`: repair / duplicate feedback 不再以 `satisfied=false` 或 `duplicate_tool_success` 表达业务失败或成功，只表达可验证的重复输入、错误、诊断和最终输出校验边界。
- `agent-llm-prompt-configuration`: 模型可见合同必须说明 tool result 是事实材料，0 条结果可支撑普通事实回答；结构化业务输出必须通过最终 validator。
- `ai-run-trace`: trace / debug 摘要应区分 tool 执行结果、诊断事实、最终 output validation，而不是把中间 `satisfied` 作为业务成败。

## Impact

- 影响核心合同：
  - `lib/server/agent-core/contracts.ts`
  - `lib/server/agent-core/action-validator.ts`
  - `lib/server/agent-core/observation.ts`
  - `lib/server/agent-core/runtime.ts`
  - `lib/server/agent-core/response-renderer.ts`
  - `lib/server/agent-core/resource-contract.ts`
  - `lib/server/agent-core/terminal-output-validator.ts`
- 影响模型可见输入：
  - `lib/server/agent-core/planner-port.ts`
  - `lib/server/agent-planners/**`
  - tool result redaction / compressed observation / repair feedback builder
- 影响业务终态校验：
  - `lib/server/visible-training-proposals/**`
  - production terminal output validator wiring
- 影响测试：
  - agent-core action validator / runtime / renderer / trace tests
  - chat-service production flow tests
  - architecture-boundary tests
  - visibleTrainingProposal final validator tests
- 不影响：
  - 服务端不新增用户 phrasing、关键词、正则、同义词或业务 toolName 语义分支
  - 不改变业务 tool handler 的查询语义
  - 不让 core 理解 `warmup`、`stretch`、`routine`、`visibleTrainingProposal` 的业务含义
  - 不允许未通过最终 validator 的结构化训练方案被渲染、保存或写入历史
