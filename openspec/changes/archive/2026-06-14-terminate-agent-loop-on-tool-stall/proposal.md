## Why

当前 LangChain Agent Runtime 在同一业务 tool 连续调用超限后，只向模型返回一条失败 observation，并继续允许主 Agent loop 调用其他业务 tool。这样连续调用门禁无法真正阻断无进展循环，模型可以通过切换到其他 tool 或重复历史查询打断连续计数，最终直到 `maxModelCalls` 或全局预算耗尽才失败收口。

需要把“连续同业务 tool 超限”从模型可恢复提示升级为 runtime 硬终止条件：一旦触发，主 Agent 不再继续自由 tool calling，而是进入受控失败收口。

## What Changes

- 修改 LangChain runtime 的连续业务 tool 调用合同：同一业务 tool 超过 `maxToolCallsPerTool` 时，runtime SHALL 阻止 handler 执行，并终止当前主 Agent loop。
- Runtime SHALL 保留该超限 tool call 的安全 trace、失败摘要和模型可见失败摘要，用于 trace 复盘和 terminal failure finalizer 输入，但 MUST NOT 发起下一轮自由 provider model call。
- Runtime SHALL 返回稳定失败码，交由现有 terminal failure finalizer 或确定性 fallback 生成用户可见失败说明。
- 保留整轮 `maxToolCalls`、`maxModelCalls`、`recursionLimit` 和 timeout 作为外层安全熔断；这些预算不再是连续同 tool 无进展循环的主要终止点。
- 不新增服务端关键词规则、自然语言模板路由、用户短句特判或具体业务 `toolName` 语义分支。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `langchain-agent-runtime`: 修改生产 LangChain runtime 的连续业务 tool 调用限制要求，使连续超限成为主 Agent loop 的硬终止条件，而不是可被其他业务 tool 打断后恢复的软限制。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/runtime.ts`
  - `lib/server/langchain-agent/types.ts`
  - 相关 LangChain runtime 单元测试
- 影响 OpenSpec：
  - `openspec/specs/langchain-agent-runtime/spec.md` 的 delta
- 不影响：
  - production tool catalog 注册范围
  - 具体业务 tool handler
  - `/api/chat` 用户原文路由
  - DeepSeek provider payload 合同
  - visible output validator 或 response adapter 主流程
