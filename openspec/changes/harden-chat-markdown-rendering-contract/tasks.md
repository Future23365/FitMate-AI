# Tasks

- [x] 1.1 使用 `agent-prompt-contract-governance` 确认本 change 主类型包含模型可见 final response 合同变更。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 审查方案，确认没有把具体 trace、用户原话或格式片段升格成业务语义规则。
- [x] 1.3 运行 `openspec validate harden-chat-markdown-rendering-contract --strict`。

- [x] 2.1 更新 `buildLangChainAgentSystemPrompt()`，把 `content` 输出格式收敛为聊天 Markdown 子集，并保留 emoji。
- [x] 2.2 更新 `langChainFinalResponseJsonSchema.content.description`，同步聊天 Markdown 子集说明。

- [x] 3.1 更新 `MarkdownContent`，关闭 GFM single tilde 删除线解析。
- [x] 3.2 更新 `MarkdownContent`，对删除线、水平线、raw HTML、表格、脚注、任务清单、代码块和一级标题做忽略或降级渲染。

- [x] 4.1 补充 prompt / final response schema 测试，覆盖 Markdown 子集、数字范围和 emoji 允许项。
- [x] 4.2 补充前端 Markdown 渲染测试，覆盖 `8~12` 不生成删除线，以及高风险结构不会按原始结构渲染。
- [x] 4.3 运行相关自动化测试。
- [x] 4.4 运行 `npm run typecheck`。

- [x] 5.1 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
