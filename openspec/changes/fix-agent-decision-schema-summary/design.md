## Context

当前 `buildAgentDecisionModelInput` 会把完整 JSON Schema 压缩成 `inputFields`，但数组字段只保留了字段类型和 `maxItems`，没有保留 `items.enum`。`searchExercises.allowedSections` 的合法值来自 `exerciseAllowedSectionSchema`，只能是 `warmup`、`training`、`stretch`；模型看不到这个边界后按语义填了 `upper_body`，导致工具输入 schema 连续失败。

Agent runtime 目前只接受 `action: "call_tool"` 和 `action: "final_result"`。模型在工具失败后返回了 `{ "action": "askClarification", "input": ... }`，本质是想调用已注册工具，但因为输出形态不符合 discriminated union，被解析为 `invalid_decision`。

## Goals / Non-Goals

**Goals:**
- 在 token 瘦身的同时保留关键 schema 枚举、数组 item 类型和边界信息。
- 对“action 直接等于注册工具名”的输出做结构规范化，限制为已注册工具且包含 `input` 的情况。
- 保持所有工具输入仍由原始 Zod schema 校验。

**Non-Goals:**
- 不放宽工具输入 schema。
- 不新增关键词、同义词或服务端自然语言语义纠偏。
- 不恢复旧 `assistant_action` 或旧 intent-first 路径。

## Decisions

1. **保留数组 item 摘要而不是回退完整 schema。**  
   这样既修复 `allowedSections` 这类关键枚举丢失，也继续避免完整 schema 大 payload 进入每轮模型输入。

2. **在 parseDecisionValue 前做工具名 action 规范化。**  
   只有当 `action` 是已注册工具名、`input` 存在且不是 `call_tool` / `final_result` 时才转换为合法 call_tool；转换后仍走原有 `parseAgentToolDecision` 和工具 input schema 校验。

## Risks / Trade-offs

- 模型仍可能填错枚举。→ 保留原 Zod 校验，并通过 trace 暴露具体 path。
- 规范化可能掩盖 prompt 示例不足。→ 仅支持已注册工具名形态，并保留测试；后续可在 prompt 中继续强化格式。
