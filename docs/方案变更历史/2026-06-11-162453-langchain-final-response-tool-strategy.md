# LangChain 终态结构化输出改为 toolStrategy

记录时间：2026-06-11 16:24:53 CST

## 真实问题

LangChain 成功回复建议提问合同恢复后，生产 `/api/chat` 持续进入 `provider_unavailable_fallback`。最新 trace 显示 DeepSeek 在第一轮模型调用阶段直接返回：

```txt
400 This response_format type is unavailable now
```

这说明失败发生在 provider 请求阶段，不是模型没有返回 `suggestedQuestions`，也不是前端没有渲染按钮。

## 原方案为什么不合适

原方案把项目的 final response JSON Schema 直接传给 `createAgent({ responseFormat })`。LangChain 会根据模型 profile 自动选择 provider-native structured output；当前 DeepSeek 生产模型在这条链路中不接受 LangChain 发出的该类 `response_format`。

DeepSeek 官方 JSON Output 支持的是 `{ type: "json_object" }` 形态，和 LangChain provider-native JSON Schema structured output 不是同一个合同。

## 调整思路

保留 `content` / `suggestedQuestions` 的结构化成功终态，但显式使用 LangChain `toolStrategy(...)`。最终回答通过 DeepSeek 已支持的 tool calling 承载，LangChain 继续把结构化结果写入 `state.structuredResponse`，服务端继续做 Zod 校验和 NDJSON 投影。

## 关键改动

- `runLangChainAgentRuntime()` 中的 `responseFormat` 改为 `toolStrategy(langChainFinalResponseJsonSchema)`。
- 默认 prompt 改为说明“结构化终态工具”，不再暗示 provider-native `responseFormat`。
- Runtime 回归测试补充模型声明 `structuredOutput: true` 时仍暴露终态 tool 的断言。
- OpenSpec design / tasks 同步记录 provider 兼容性边界。

## 边界

- 不修改前端 `suggested_questions` 协议。
- 不从正文提取建议问题。
- 不新增服务端关键词、自然语言模板路由或 phrasing 特判。
- 不修改业务 tool handler 或 `/api/chat` 主链路。
