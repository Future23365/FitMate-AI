## Context

基础黑盒报告显示，`/api/chat` 的真实请求形态已经接近首页聊天：每轮只提交 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary` 和 `thinkingEnabled`。这种形态能验证真实用户路径，但也暴露了一个边界问题：`conversationSummary` 只是自然语言摘要，足够让模型在回复正文里“知道”历史，但不足以让服务端 action gate 稳定获得 `weeklyFrequency`、`sessionMinutes`、最近 plan artifact 等结构化事实。

当前 `prepareAiChatRequest()` 在请求没有携带 `messages` 或 `conversationContext` 时，只能用最新用户消息构建 `internalConversationContext`。因此 F05 第 3 轮会把“增肌，有健身房器械”当成新的动作推荐目标，F06 第 2 轮会把“改成每周6练”降级为继续追问，而不是在已有 plan 上调整。

另一个问题是确定性动作讲解：服务端可以读取 artifact payload 并生成用户可见讲解，但因为该路径没有 `assistant_action` 事件，黑盒 runner 无法记录 `referenceResolution=resolved`，导致报告把用户可见正确结果记为语义失败。

## Goals / Non-Goals

**Goals:**

- 让 `/api/chat` 在服务端根据 `conversationId + current user` 恢复已保存会话、结构化上下文和 recent artifact summaries。
- 让服务端 action gate 优先使用可信的 hydrated context，而不是依赖自然语言 summary 正则或模型稳定性。
- 保持模型可见 payload 克制，不把完整历史消息重新暴露给模型作为默认方案。
- 修复基础黑盒 F05、F06、F15 暴露的真实问题，并补充普通自动化回归。
- 让手动 LLM 报告的 token 预估基于最近真实运行校准。

**Non-Goals:**

- 不重写整个 resolved intent 架构。
- 不改变训练计划草稿 schema、数据库 schema 或 artifact payload schema。
- 不把真实 LLM 黑盒测试纳入默认 `npm run test`。
- 不通过放宽 F05/F06 期望来掩盖主链路问题。
- 不把客户端提交的上下文当作最终可信事实源。

## Decisions

### Decision 1: 服务端优先 hydrate 已保存会话上下文

`/api/chat` 收到 `conversationId` 后，应在鉴权通过后读取当前用户可访问的已保存会话。若存在会话，则从已保存的 `messages`、`conversationContext`、`recommendationIntents`、可见训练卡片和 artifact summaries 构造服务端 `internalConversationContext`。

选择这个方案，是因为 action gate 的事实来源必须可审计、可权限隔离、可被普通测试复现。`conversationSummary` 可以继续作为模型提示摘要，但不能作为唯一结构化事实来源。

备选方案：

- 只让前端发送完整 `messages` / `conversationContext`：实现更直接，但客户端可篡改，且黑盒 runner 和前端容易各自构造出不同上下文。
- 从 `conversationSummary` 正则恢复所有 facts：不需要改 API，但 summary 是模型生成文本，稳定性和字段边界不如结构化会话状态。

### Decision 2: 客户端上下文作为 fallback，不作为主事实源

前端可以把当前轮本地构造出的 `messages` 或 `conversationContext` 发给 `/api/chat`，用于新会话尚未保存、保存读取失败或测试环境缺历史状态时的降级路径。但服务端必须先校验 schema，并且在有已保存会话时以服务端读取结果为准。

这样保留了无保存状态下的用户体验，同时不把权限和业务决策交给客户端。

### Decision 3: recent artifact summaries 继续从服务端读取

引用解析、局部修改和动作讲解必须使用当前用户、当前会话下的 recent artifact summaries。runner 和前端都不应手工注入 recent artifact 来绕过真实保存链路。

这能保证 F15 类型用例既验证用户可见回复，也验证 artifact index、payload 读取和 userId 隔离。

### Decision 4: 确定性回复也要发出可诊断事件

对于 `exercise_explanation` 这类不触发训练卡片的确定性路径，服务端应通过流事件或 `done` metadata 暴露引用解析摘要，至少包含状态、artifactId、artifactKind 和是否读取 payload。runner 应统一消费这类诊断事件，而不是只从 `assistant_action.referenceResolution` 推断引用结果。

这不是向用户暴露内部字段；它只用于服务端流式协议、测试报告和 trace 诊断。

### Decision 5: token 预估用真实报告校准

基础和详细 LLM 黑盒测试启动前，应优先读取最近一次真实运行报告中的 `total_tokens` 与轮次数，计算当前套件的预估成本。只有找不到真实报告、报告是跳过状态或关键字段缺失时，才使用 fallback。

## Risks / Trade-offs

- [Risk] 读取会话增加 `/api/chat` 首包前耗时。→ Mitigation: 只按 `conversationId + userId` 读取必要字段，并复用现有会话保存结构；trace 记录 hydration 状态。
- [Risk] 保存会话与当前请求本地状态短暂不一致。→ Mitigation: 以服务端保存状态为主，客户端上下文作为经过 schema 校验的 fallback；报告记录 hydration source。
- [Risk] 新诊断事件被前端误当作用户可见内容。→ Mitigation: 使用独立 stream event type，前端只消费需要的状态，不渲染内部诊断。
- [Risk] 真实 LLM 报告受模型漂移影响。→ Mitigation: 普通自动化测试覆盖服务端确定性边界；真实 LLM 仅作为高成本验收入口。
