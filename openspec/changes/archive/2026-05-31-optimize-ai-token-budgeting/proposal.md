## Why

整体 AI 编排完善后，单轮聊天可能同时触发意图解析、上下文总结、动作候选构建和最终回答，导致输入与输出 token 消耗快速上升。需要在不削弱服务端 grounding、结构化校验和用户可见回答质量的前提下，为 AI 调用建立可观测、可裁剪、可跳过的 token 预算机制。

## What Changes

- 新增 AI token budget 编排层：按本轮意图、动作触发条件和上下文需求决定需要执行哪些 LLM 调用、传入哪些上下文、使用哪些 prompt module。
- 将模型可见输入限制为当前任务所需内容：优先使用 `conversationSummary`、最新用户消息、必要的服务端结构化摘要和瘦身后的候选动作字段。
- 为候选动作上下文定义模型可见字段白名单，避免把完整数据库字段、长描述或无关 metadata 传给模型。
- 为 AI Trace 增加按阶段的 token 分账视角，开发者可以看到意图解析、上下文总结、候选动作上下文和最终回答各自消耗。
- 增加规则化跳过路径：当用户操作、确认、取消、普通问答或模板化回复不需要 LLM 时，不触发对应模型调用。
- 本 change 暂不新增测试用例、测试 fixture 或真实 LLM 手测预算验收，不修改 `manual-llm-consistency-tests` 的专用命令、报告或预算输出要求。

## Capabilities

### New Capabilities
- `ai-token-budgeting`: 定义聊天与训练生成链路中的 token 预算、上下文裁剪、prompt module 选择和 LLM 调用跳过规则。

### Modified Capabilities
- `ai-trace-debugger`: 增加按 AI 阶段展示 token 分账、跳过原因和上下文裁剪摘要的要求。
- `chat-context-summarization`: 强化 summary 在预算链路中的模型可见边界，确保历史上下文继续通过 summary 而不是消息窗口进入模型。

## Impact

- 影响 `lib/server/chat/chat-service.ts`、`lib/server/ai/prompt-config.ts`、动作推荐与训练计划生成相关服务端编排模块。
- 影响 AI Trace 事件结构、trace 存储字段和 `/dev/ai-traces` 的开发者展示。
- 影响模型请求构造、候选动作 payload、prompt 组织和 LLM 调用 gating。
- 不改变前端聊天 API 的公开请求契约，不引入新的外部依赖，不要求新增测试或执行真实 LLM 手测预算验收。
