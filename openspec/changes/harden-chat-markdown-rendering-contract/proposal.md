## Why

当前聊天正文同时暴露给 LLM 自然语言输出和前端 Markdown/GFM 渲染。真实 trace 显示，模型会输出 `8~12`、`2~3` 这类训练区间，前端默认 GFM single tilde 解析会把中间内容渲染成删除线；同类风险也存在于水平分割线、HTML、表格、脚注、任务清单和代码块等会改变聊天正文结构的 Markdown 语法。

这类问题不能只靠继续追加 prompt 禁止项解决。系统需要定义一个用户可见 Markdown 子集：模型只被要求输出安全子集，前端渲染层对高风险结构做确定性兜底，同时保留 emoji 和普通训练文本表达。

## What Changes

- 将 `fitmate_final_response.content` 的模型可见格式合同收敛为“聊天正文 Markdown 子集”。
- 保留 emoji、段落、短标题、编号列表、项目列表、加粗、斜体和行内代码。
- 禁止模型在用户可见正文中使用 raw HTML、水平分割线、删除线、表格、脚注、任务清单和代码块。
- 要求数字范围使用 `8-12`、`8 到 12` 或 `8 至 12`，不使用 `~` 表达范围。
- 调整前端聊天 Markdown 渲染：关闭 single tilde 删除线解析，并对不属于聊天正文子集的结构做降级或忽略。
- 不新增服务端关键词、正则、同义词、短句模板或具体业务 toolName 语义分支。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 模型可见 final response 合同需要声明聊天正文 Markdown 子集。
- `agent-text-chat-flow`: 前端聊天正文渲染需要按受控 Markdown 子集展示 assistant `content`。

## Impact

- `lib/server/langchain-agent/prompt.ts`
- `lib/server/langchain-agent/final-response-schema.ts`
- `features/chat/components/markdown-content.tsx`
- 相关 LangChain prompt / final response schema 测试
- 相关前端 Markdown 渲染测试
