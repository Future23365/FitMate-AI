## Why

最新 trace 显示 Agent 已完成 `searchExercises -> generateRoutineDraft -> validateRoutineDraft`，但连续三次调用 `evaluatePolicy` 都因 Schema 失败中断。根因是 `evaluatePolicy` 的输入 Schema 是 `oneOf` / discriminated union，而模型输入瘦身逻辑只读取根级 `properties`，导致模型看到的 `inputFields` 为空，并误判 “schema shows no required inputs”。

这会让首次生成 routine / plan 的保存链路无法进入 Policy 与 artifact 写入，最终退化为 `tool_execution_failed`。

## What Changes

- 调整 Agent decision 模型输入的工具 Schema 摘要，支持 `oneOf` / `anyOf` 变体字段。
- 在字段摘要中保留 `const`，让模型能看到 `policyTarget="new_artifact"` 等判别值。
- 补充 `evaluatePolicy` 首次创建 artifact 的明确调用示例，要求带 `artifactKind` 和 `draftId`。
- 增加回归测试，证明瘦身后的模型输入仍包含 `evaluatePolicy` 各变体的必填字段。

## Capabilities

### New Capabilities

### Modified Capabilities
- `ai-model-payload-budget`: Agent decision 模型输入瘦身不得丢失 union / discriminated union 工具 Schema 的必填字段和判别值。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的 Agent decision model input 构造。
- 影响 `lib/server/ai/prompt-config.ts` 中 Agent 工具决策提示。
- 需要更新 `tests/chat-service.test.ts`，并运行 Agent / chat 相关测试、`npm run typecheck` 和 OpenSpec strict validate。
