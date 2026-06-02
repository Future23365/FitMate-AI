## Why

上一次 Agent decision token 瘦身后，模型可见的工具字段摘要丢失了数组 item 的合法枚举，导致模型把 `allowedSections` 误填为 `upper_body` 并连续触发 schema 校验失败。失败后模型又把澄清工具写成 `action: "askClarification"`，不符合 Agent decision 契约，最终整轮退化为 `model_output_invalid`。

## What Changes

- Agent decision 的瘦身 schema 摘要保留数组 `items.type`、`items.enum` 和必要字段边界，让模型仍能看到关键合法值。
- Agent decision 解析边界对注册工具名形式的旧输出做窄范围规范化，例如 `action: "askClarification"` 转为 `action: "call_tool", toolName: "askClarification"`。
- 增加自动化测试覆盖 `allowedSections` 枚举保留和澄清工具输出规范化。

## Capabilities

### New Capabilities

### Modified Capabilities
- `ai-token-budgeting`: Agent decision 瘦身输入必须保留执行关键 schema 边界。
- `chat-exercise-recommendation-trigger`: Agent 工具决策修复后不得因澄清工具输出形态退化为通用失败。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的模型可见 schema 摘要。
- 影响 `lib/server/agent-orchestrator/runtime.ts` 的 Agent decision 解析兼容边界。
- 不恢复旧 intent-first 主链，不新增服务端自然语言语义判断。
