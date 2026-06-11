## Context

本次问题来自一次真实 `/api/chat` trace：模型连续调用 `searchExerciseResources`，均传入 `"published": "true"`，而服务端 schema 要求 `z.literal(true)`，导致每次在 tool wrapper 执行 handler 前失败。失败反馈返回给模型的内容只有泛化错误码和提示，具体 `schemaIssues` 只进入 trace，没有进入模型可见 tool message。

当前生产主链是 `LangChain Agent Runtime + DeepSeek native tool_calls`。按照 `docs/agent-tool-orchestrator-design.md` 第 24-26 节，本次不得修改 `/api/chat` 主链路、不得在 runtime 写具体业务 `toolName` 分支、不得通过服务端自然语言规则修正模型参数。

## Goals / Non-Goals

**Goals:**

- 让所有 LangChain tool input schema 失败都能给模型返回可局部修正的字段级事实。
- 从 `searchExerciseResources` 的 Planner 可见 input 合同中移除 `published`。
- 保持服务端 schema、权限、数据库事实和 output validator 的确定性边界。
- 补齐最窄相关自动化测试。

**Non-Goals:**

- 不把 LangChain 原始 stack trace、Zod 完整 schema、内部 handler payload 或 provider 原始 trace 直接暴露给模型。
- 不新增 `searchExerciseResources` 专属 runtime 分支。
- 不通过兼容 `"true"` 字符串或服务端 silent coercion 修复本 case。
- 不改变动作自然语言语义解析，不新增关键词、正则、同义词表或短句模板。

## Decisions

1. **使用通用字段级 repair payload，而不是透传原始 trace。**

   原始 trace 适合开发者诊断，不适合进入模型上下文。实现应复用已有 `summarizeZodIssues` 的脱敏字段，生成模型可见 `issues[]`，只包含 `path`、`code`、`message`、`expected`、`actual` 等稳定字段。这样适用于所有 tool schema 失败，不需要业务 `toolName` 分支。

2. **删除 `published` 模型输入，而不是兼容字符串 `"true"`。**

   `published` 表达的是服务端动作可用性边界，不是用户目标、器械、肌群或 section 等动作事实筛选条件。让模型传这个字段只会扩大 schema 失败面。实现应从 input schema 和模型可见说明中移除该字段，并同步清理 query summary / applied filters 中的 `published`。

3. **服务端动作可用性不由模型控制。**

   如果服务端仍需要动作可用性边界，应在 repository 或下游 validator 中用内部事实处理，不把该字段作为 Planner input 或模型可见 query 条件。当前用户确认数据库动作默认可用，因此本 change 不再要求 `searchExerciseResources` 通过模型输入执行发布态过滤。

4. **测试优先覆盖真实执行入口。**

   wrapper 测试应直接执行 `executeLangChainToolWrapper` 或真实 runtime 入口；业务 tool 测试应覆盖 `searchExerciseResources` 的成功路径、非法旧字段拒绝和 production catalog 不暴露旧字段。

## Risks / Trade-offs

- **风险：移除 `published` 后旧测试仍依赖发布态过滤。**
  缓解：更新测试 fixture 和期望，使动作可用性不再由 Planner input 控制；下游需要发布态校验的结构化输出仍由对应 validator 负责。

- **风险：模型可见 repair payload 过多泄漏内部信息。**
  缓解：只投影脱敏 schema issue，不暴露 stack trace、完整 schema、内部路径、数据库对象或 handler payload。

- **风险：OpenSpec 旧条目仍残留 `published`。**
  缓解：本 change delta 显式修改最相关的输入、输出、repository 和测试要求；实现后用 `rg` 检查 production tool model-visible schema 和相关测试残留。
