## Why

当前 Tool-first Agent 已能为“安排一套训练”成功调用 `generateRoutineDraft`，但下一步 `validateRoutineDraft` 要求模型再次提交完整 `draft` payload，而模型可见上下文只包含压缩后的 tool result summary，导致 schema 校验失败。失败后 Agent 退回纯文本 `answered`，没有执行 Policy 与 artifact revision 写入，因此聊天页面无法展示 routine 编排卡片。

## What Changes

- 将 routine draft 的后续校验、Policy 和保存链路调整为基于本轮服务端 tool result 中登记的 `draftId` 读取完整草稿。
- 保留模型只引用 `draftId`、`candidateSetId`、`validationId`、`policyDecisionId` 等资源 id 的调用方式，避免要求 LLM 复写大 payload。
- 当模型传入的资源 id 无法在本轮 dependency graph / tool result 中解析时，返回结构化失败，不展示或保存卡片。
- 补充回归测试，覆盖 `generateRoutineDraft` 成功后无需模型回传完整 `draft` 也能完成 validation / policy / artifact revision。

## Capabilities

### New Capabilities

### Modified Capabilities
- `chat-routine-composition`: routine 生成链路的 validation / policy / persistence 工具必须基于服务端登记资源解析 draft，而不是依赖模型回传完整 draft payload。

## Impact

- 影响 `lib/server/agent-orchestrator` 下的工具契约、运行时 tool result 资源登记与 dependency 解析。
- 影响 `/api/chat` 的 routine 编排闭环：成功生成草稿后应继续完成校验、策略评估和 artifact revision 写入。
- 需要更新相关单元测试或 Agent runtime 测试，避免真实模型再次把 routine 编排退化成纯文本回答。
