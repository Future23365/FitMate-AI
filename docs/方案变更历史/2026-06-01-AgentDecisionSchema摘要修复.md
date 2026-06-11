# Agent Decision Schema 摘要修复

记录时间：2026-06-01 20:11:09 CST

## 当前真实问题

Agent decision token 瘦身后，模型可见的工具 schema 摘要丢失了数组 item 的合法枚举。`searchExercises.allowedSections` 实际只允许 `warmup`、`training`、`stretch`，但模型只能看到它是数组，于是把语义上的“上肢”写成 `upper_body`，连续触发 schema 校验失败。

工具失败后，模型尝试澄清时输出了 `action: "askClarification"`。当前 Agent decision 契约只接受 `call_tool` 或 `final_result`，因此这类工具名 action 被解析为 `invalid_decision`，最终回复退化为“这次执行没有完成，我没有生成或修改训练结果。”

## 调整思路

继续保留 token 瘦身，但把执行关键的 schema 边界保留下来，尤其是数组字段的 `items.type` 和 `items.enum`。这样模型不需要看到完整 JSON Schema，也能知道可填枚举。

在 Agent decision 解析边界增加窄范围结构规范化：当 `action` 正好是当前 registry 已注册工具名且携带 `input` 时，转换为合法的 `call_tool` 结构；转换后仍走原工具 Zod schema 校验，不放宽业务边界。

## 关键改动

- `buildAgentDecisionModelInput` 的 `inputFields` 保留数组 item 类型和枚举。
- `parseAgentToolDecision` 支持将 `action: "askClarification"` 规范化为 `call_tool + toolName: "askClarification"`。
- 修正当前 Agent loop trace 可读性改动中的类型错误，保证 `typecheck` 通过。
- 更新相关测试，覆盖 schema 摘要枚举、工具名 action 规范化和新 trace 诊断 code。

## 验证结果

- `npm run test -- tests/chat-service.test.ts tests/agent-orchestrator.test.ts tests/ai-trace-viewer.test.ts`
- `npm run typecheck`
- `openspec validate fix-agent-decision-schema-summary --strict`
