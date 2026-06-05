# Agent ToolResult satisfied 边界移除

时间：2026-06-06 00:23:06 CST

## 原问题

Agent core 过去把 `ToolResult.fulfillment.satisfied` 同时当成业务目标满足度、普通 `final_answer` grounding gate 和重复 tool 调用成功判断。这样会把 `totalMatches = 0`、候选不足或诊断摘要这类有效事实误判为不能支撑普通回答，导致模型已经拿到事实后仍被 `terminal_reference_invalid` 推进 repair。

## 调整思路

本次把 core 边界收敛为 `ok=true` 表示 tool 执行成功：handler、schema、权限和执行合同成功即可作为普通文本事实来源。`fulfillment.satisfied` 保留为诊断摘要，不再阻断普通 `final_answer.usedRefs[type="tool_result"]`，也不再参与 duplicate feedback 的成功语义。

结构化业务交付仍然由最终 `visibleOutputs` validator 判定。`visibleTrainingProposal` 继续校验 payload schema、数据库动作事实、发布态、section、prescription、schedule 和当前 run 可消费动作来源；正文 `content` 不会被解析或保存成训练事实。

## 关键改动

- `Action Validator` 改为只拒绝不存在、跨 run 或 `ok=false` 的 tool result 引用；`ok=true && satisfied=false` 可支撑普通事实回答。
- `Observation` 把所有 `ok=true` tool result 都投影为轻量索引，详细事实继续由 `toolResults[].projection.model` 承载。
- duplicate feedback 从 `duplicate_tool_success` 改为 `duplicate_tool_input`，只说明相同 input 已执行和既有 `toolResultId`。
- system prompt、tool manifest、observation 文案和 trace 摘要同步改为“tool result 是事实材料，结构化输出由 validator 判定”。
- trace 新增 `factChannel`，区分 `fact`、`diagnostic` 和 `failed`，避免继续把中间 `satisfied` 当业务成败。

## 验证结果

- 已通过 agent-core validator/runtime/renderer/observation、visibleTrainingProposal validator、searchExerciseResources、prompt/manifest 测试。
- 已通过 chat-service、M1/DeepSeek fixture、trace/viewer 和 architecture boundary 测试。

