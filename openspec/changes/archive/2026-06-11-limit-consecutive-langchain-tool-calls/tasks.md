## 1. 合同与门禁

- [x] 1.1 完成 Agent 修复方案抽象层级门禁审查：确认本 change 只修改通用连续业务 tool 调用合同，具体业务 tool 名只作为测试样例或 trace 证据，不作为生产语义分支。
- [x] 1.2 使用 `agent-tool-change-governance` 确认本 change 分类为 LangChain runtime / wrapper 通用合同变更，允许触碰 `lib/server/langchain-agent/runtime.ts`、集中配置注释、默认 system prompt 预算文案和 runtime 单测；禁止触碰业务 tool handler、production tool catalog、`/api/chat` route、response adapter 和服务端自然语言分流。
- [x] 1.3 使用 `agent-prompt-contract-governance` 检查 system prompt 预算文案：只同步连续调用预算合同，不新增固定业务 tool 流程、用户 phrasing、关键词规则或具体 toolName 恢复流程。

## 2. Runtime 实现

- [x] 2.1 将业务 tool 可用性判断从“整轮同 tool 累计达到上限后移除”改为“最近连续业务 tool 调用达到上限后移除”。
- [x] 2.2 将超限 handler 阻断从整轮 `toolCallLimitMiddleware` 语义替换为连续同业务 tool 限制，确保同一 provider response 内第三次连续同 tool 调用不会执行 handler。
- [x] 2.3 确保另一个业务 tool 会打断连续计数，后续 model request 可再次暴露前一个业务 tool。
- [x] 2.4 确保 `reportAgentActivity` 或等价 activity tool 不计入也不打断业务 tool 连续计数。
- [x] 2.5 保留整轮 `maxToolCalls`、`maxModelCalls`、activity report 上限和现有 schema / permission / projection / trace / structured final response 校验边界。

## 3. 配置与模型可见合同

- [x] 3.1 更新 `agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool` 的中文注释，使其表达“连续同业务 tool 上限”。
- [x] 3.2 更新 `buildLangChainAgentSystemPrompt()` 中运行预算文案，使模型看到“同一个业务工具最多连续调用 N 次”，并说明 activity report 不打断该连续计数。

## 4. 测试与验证

- [x] 4.1 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖同一业务 tool 连续第三次调用被拒绝且 handler 不执行。
- [x] 4.2 更新 runtime 测试，覆盖 `businessA -> businessA -> businessB -> businessA` 合法回访。
- [x] 4.3 更新 runtime 测试，覆盖 `businessA -> businessA -> reportAgentActivity -> businessA` 仍被连续限制拒绝。
- [x] 4.4 更新 runtime 测试，覆盖整轮 `maxToolCalls` 全局预算仍会阻断后续业务 tool handler。
- [x] 4.5 运行 `openspec validate limit-consecutive-langchain-tool-calls --strict`。
- [x] 4.6 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts`。
- [x] 4.7 运行 `npm run typecheck`。
- [x] 4.8 最终 diff 检查：确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 toolName 语义分支、业务 tool handler 变更或 `/api/chat` route 变更。
