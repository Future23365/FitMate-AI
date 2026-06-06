## Context

旧 `/api/chat` 链路曾经直接在 Route Handler 中调用 DeepSeek，并使用 `deepseek-v4-flash`、`thinking.type = enabled | disabled` 和流式 `reasoning_content`。Agent Loop 重构后，生产聊天改为 `PreparedChatRequest -> AgentRunInput -> ToolRegistry -> LlmPlanner -> DeepSeekModelAdapter -> runAgentRuntime -> Response Renderer -> NDJSON`。前端思考按钮、`thinkingEnabled` 请求字段和 metadata 仍保留，但新的 `DeepSeekModelAdapter` 没有把该字段映射到 DeepSeek Thinking Mode，默认模型也变成了 `deepseek-chat`。

当前修复不是新增业务能力，而是恢复重构前已存在的模型请求能力，并把它放回新架构的正确边界：DeepSeek 专有协议只属于 adapter 和集中配置，`agent-core` 继续只处理 provider-neutral `PlannerInput` 和 `AgentAction`。

## Goals / Non-Goals

**Goals:**

- 生产 DeepSeek 默认模型恢复为 `deepseek-v4-flash`，仍允许 `DEEPSEEK_MODEL` 覆盖。
- 前端 `thinkingEnabled` 必须真实控制 DeepSeek 请求体中的 `thinking.type`。
- Thinking Mode 默认推理强度为 `reasoning_effort = "high"`，该默认值来自 `lib/server/config/`。
- `reasoning_content` 当前不展示给前端用户，但服务端响应解析、trace 和后续投影边界要保留可扩展能力。
- 保持当前用户可见 `/api/chat` NDJSON 协议稳定。

**Non-Goals:**

- 不接入 DeepSeek 原生 `tools/tool_calls`。
- 不修改 `AgentAction` 输出合同，不新增 action type。
- 不展示原始 `reasoning_content`，不保存未经脱敏的思维链到用户会话历史。
- 不改业务 tool、训练方案生成规则、Response Renderer 业务投影或前端聊天 UI。
- 不基于用户原文、关键词或短句模板决定是否开启 Thinking Mode；开关只来自请求中的 `thinkingEnabled`。

## Decisions

### 1. DeepSeek 专有配置集中到 Agent runtime config

`deepseek-v4-flash`、Thinking Mode 默认开关行为和 `reasoning_effort = "high"` 属于模型请求策略。实现时应把这些默认值放入 `lib/server/config/`，由 `DeepSeekModelAdapter` 消费。`DEEPSEEK_MODEL` 继续作为部署覆盖入口，但 adapter 不应在多个位置重复硬编码模型名或 reasoning effort。

备选方案是只在 adapter 内写局部常量。不采用：项目已有配置集中化规则，且该参数会影响成本、延迟、trace 和黑盒测试，应有统一入口和中文意图注释。

### 2. `thinkingEnabled` 通过 Planner input 进入 adapter，不进入 agent-core 语义逻辑

当前 `thinkingEnabled` 已经存在于 `PreparedChatRequest` 和 `AgentRunInput.metadata`。实现应在 adapter 构造请求时读取该受控 metadata 或等价 provider options，并映射为：

- `thinking.type = "enabled"` 当 `thinkingEnabled !== false`
- `thinking.type = "disabled"` 当 `thinkingEnabled === false`
- `reasoning_effort = "high"` 当 Thinking Mode 开启

该字段不得被 route、runtime、validator、tool handler 或 renderer 用来改变业务语义、tool 调用、卡片类型或最终回答策略。

备选方案是把 Thinking Mode 做成 runtime limit 或 prompt 规则。不采用：这是供应商请求参数，不是 Agent loop 语义能力；放进 prompt 也不能保证 DeepSeek API 真正开启或关闭。

### 3. 用户可见响应不展示 `reasoning_content`，trace 保留受控诊断

实现应扩展 DeepSeek 响应类型，允许读取非流式或后续流式响应中的 `reasoning_content`。当前用户可见 NDJSON 不新增 reasoning 展示事件；前端仍只展示加载态和最终用户回复。服务端 trace 可记录以下安全字段：

- thinking 是否开启
- `reasoning_effort`
- 是否收到 `reasoning_content`
- `reasoning_content` 长度、脱敏摘要或长文本引用

后续若要展示 reasoning，应在单独 change 中定义用户可见事件、存储和隐私边界。

备选方案是立刻把 reasoning 原文作为 stream event 发给前端。不采用：当前产品已经隐藏思考过程，且思维链展示涉及隐私、安全、审查和 UI 体验，不应在本恢复性修复里扩展。

### 4. 不把 Thinking Mode 和原生 tool calling 合并

DeepSeek Thinking Mode 和原生 `tools/tool_calls` 都是 provider 协议能力，但本 change 只恢复 Thinking Mode。内部仍让模型输出项目自定义 `AgentAction` JSON，再由 runtime 进行 Zod 校验、tool execution、repair 和 terminal validation。

备选方案是同时迁移到原生 `tool_calls`。不采用：那会改变工具调用协议、trace、repair loop 和 adapter 转换层，风险明显高于本次回归修复。

## Risks / Trade-offs

- [Risk] `deepseek-v4-flash` 与 `response_format: { type: "json_object" }`、Thinking Mode 的组合在实际 API 上可能有额外限制。→ Mitigation：实现时用 adapter request-body 单测固定结构，并通过手动 LLM 基础黑盒测试验证真实请求。
- [Risk] Thinking Mode 会增加延迟或 token 消耗。→ Mitigation：默认 `reasoning_effort = "high"`，保留前端关闭开关，并在 trace / 黑盒报告中记录 token usage 来源。
- [Risk] `reasoning_content` 原文进入用户会话或日志造成泄漏。→ Mitigation：默认不发送给前端，不保存到 chat history；trace 只记录脱敏摘要、长度或受控 long-text 引用。
- [Risk] 后续开发误以为 `thinkingEnabled` 应影响业务能力。→ Mitigation：spec 明确该字段只控制 provider thinking 参数，不参与 tool 选择、payload.kind 或服务端语义分流。
- [Risk] 环境变量 `DEEPSEEK_MODEL` 仍可覆盖默认模型，导致某些环境不是 V4 Flash。→ Mitigation：README / 测试报告说明默认值和覆盖关系，adapter trace 记录最终 model。

## Migration Plan

1. 在集中配置中增加 DeepSeek 默认模型和 Thinking Mode 默认推理强度。
2. 调整生产 planner factory / adapter 输入，使 `thinkingEnabled` 能进入 `DeepSeekModelAdapter` 请求体。
3. 扩展 DeepSeek 请求体、响应类型和 trace envelope，记录 thinking 配置与 `reasoning_content` 诊断。
4. 更新 adapter、chat service、trace、黑盒 runner 或报告相关测试。
5. 运行 OpenSpec 和相关自动化验证；真实模型验证只通过显式手动 LLM 命令执行。

Rollback 方式是将默认模型和 thinking 配置恢复到旧 adapter 行为，同时保留前端按钮和请求字段不变；不得删除前端 `thinkingEnabled`，因为它仍是公开请求合同的一部分。

## Open Questions

- DeepSeek 当前非流式 JSON 模式下 `reasoning_content` 的具体位置是否稳定为 `choices[0].message.reasoning_content`，实现时需要用官方文档和真实响应确认。
- 是否需要为 finalizer 模型调用单独禁用 Thinking Mode 或沿用同一默认值，需要实现时根据 finalizer 的低延迟失败收口目标确认。
