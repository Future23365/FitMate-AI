# LangChain 主链回归复查与硬化

记录时间：2026-06-11 13:04:33 CST

## 背景

生产 `/api/chat` 刚迁移到 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。迁移范围较大，首次提交后需要复查是否存在“旧主链已切走，但调试、预算和失败路径仍按旧假设工作”的遗漏。

## 发现的问题

1. 配置缺失路径先构造 production tool catalog，导致缺少 `DEEPSEEK_API_KEY` 时仍可能先读取动作库 facet catalog。
2. `maxToolCalls` 已进入集中配置，但 runtime 主要依赖 LangChain recursion limit，tool wrapper 执行前没有共享硬门禁。
3. dev trace viewer 仍以旧 `ToolRegistry / Manifest`、`Planner / ModelAdapter`、`Response Renderer` 等模块组织视图，没有把新 LangChain trace 摘要作为一等 view model。
4. 架构扫描只做了临时命令验证，缺少长期回归测试防止生产 LangChain 路径重新导入旧 `agent-core` 合同。

## 调整思路

- 配置错误应先短路，不依赖动作库或数据库读取。
- 工具调用预算应在 wrapper 执行前阻断，不能只靠模型或 LangChain graph 递归限制。
- trace view model 以当前生产事实为准，展示 LangChain runtime、DeepSeek `tool_calls`、tool wrapper、结构化校验和 response adapter。
- 旧 core 删除尚未确认前，扫描只覆盖当前生产 LangChain 路径，不误扫待删除的旧目录。

## 关键改动

- `createLangChainAgentTextChatResponse()` 先检查 DeepSeek provider 配置，只有配置有效时才构造 production tool catalog。
- `runLangChainAgentRuntime()` 为每次 run 创建共享 tool call budget，超过 `maxToolCalls` 的调用不进入业务 handler，并按 `budget_exhausted` 失败收口。
- `components/dev/ai-trace-viewer.tsx` 的模块语义迁移为 `LangChain Tool Catalog`、`LangChain / DeepSeek`、`Runtime / Tool Wrapper / Validator` 和 `Production Response Adapter`。
- trace log 导出新增 `langChainRuntimeSummaries`、`providerToolCalls` 和 `langChainToolExecutions`。
- `tests/architecture-agent-core-removal.test.ts` 增加当前生产 LangChain 路径旧 core 合同扫描。

## 验证方式

已运行：

```txt
npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/ai-trace-viewer.test.ts tests/api-routes.test.ts tests/architecture-agent-core-removal.test.ts
```

验证结果：4 个测试文件通过，34 个用例通过。

后续仍需在旧 core / 旧 tests / manual runner 删除前单独做高风险删除确认。
