## Context

当前生产聊天页活动条由 `/api/chat` 的 `agent_progress` 和 `agent_loop` NDJSON 事件驱动。`agent_loop` 表达当前 runtime loop 轮次，`agent_progress.stage` 由服务端根据 runtime trace event、tool definition 或 resource contract 投影，再由前端白名单映射成固定中文文案。这个设计足够安全，但不能表达 LLM 在本轮 action 中“准备做什么”的用户目标。

`AgentAction` 目前是严格 schema。模型如果额外输出字段会被拒绝，因此不能只通过 prompt 让模型“顺便写一句”。本 change 需要同时更新 `AgentAction` schema、模型可见 action contract、runtime trace、chat stream 和前端展示状态。

本 change 对照 `docs/llm-prompt-guidance.md` 的分层结论：

- `Action Contract` 定义 `activitySummary` 的结构形状和字段语义。
- `System Prompt` 只补短规则，说明该字段是用户安全活动摘要，不是最终回答或内部推理。
- `Validator` 只校验长度、安全词边界和结构，不根据用户语义改写摘要。
- `Runtime / Chat Adapter` 只把已校验摘要投影成当前请求内临时 UI 事件。
- `Frontend` 只展示或丢弃摘要，不持久化，不反向影响模型上下文。

## Goals / Non-Goals

**Goals:**

- 允许 LLM 在每个合法 `AgentAction` 中提供一句短中文 `activitySummary`，用于展示本轮动作意图。
- 让聊天活动条优先显示已校验 `activitySummary`，摘要不可用时继续显示现有固定 stage 文案。
- 保持 `agent_loop` 轮次、`agent_progress.stage` 和用户可见摘要三个状态来源独立。
- 保持活动摘要为 request-local 临时 UI 状态，不进入历史、summary、artifact、visible output 或后续模型输入。
- 用测试证明摘要不泄漏内部字段、不污染最终回答、不改变服务端语义边界。

**Non-Goals:**

- 不展示 `reasoning_content`、模型原始思考、raw response 或 trace 详情。
- 不让 LLM 直接生成 NDJSON event；LLM 只生成 `AgentAction.activitySummary`。
- 不用 `activitySummary` 决定 `toolName`、action type、tool input、最终回答、grounding、权限或业务流程。
- 不新增业务 tool、训练生成规则、数据库持久化或用户记忆写入。
- 不新增服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判。

## Decisions

### Decision 1: 新增顶层 `AgentAction.activitySummary`

`activitySummary` SHOULD 作为 `tool_call`、`final_answer`、`ask_user` 三类 action 的共同可选字段，而不是复用现有 `tool_call.rationale`。

原因：

- `rationale` 只存在于 `tool_call`，无法覆盖 terminal action。
- `rationale` 语义偏内部理由，容易被误用为模型推理解释。
- 顶层字段能表达“本轮 action 的用户态活动摘要”，与 action type 无关。

字段约束：

- 可选，缺失时不触发 repair，UI 继续 fallback。
- 字符串 trim 后长度建议 `1..40` 或相近短长度。
- 必须是用户可见中文短句，允许少量数字和常见标点。
- 不得包含 `toolName`、schema 字段路径、`AgentAction`、`validator`、`runtime`、`resource`、`trace`、provider、错误码、raw model output 或类似内部实现词。

### Decision 2: 服务端只校验与投影，不解释摘要语义

服务端只做确定性检查：字段类型、长度、空白、内部标识泄漏和流事件白名单。服务端 MUST NOT 根据 `activitySummary` 或用户原文选择 tool、改写 action、调整最终回答或决定业务流程。

摘要安全策略：

- Schema 层收敛字段形状。
- 可新增独立 sanitizer / guard 只判断是否适合展示。
- 不安全摘要被丢弃或降级到 stage fallback，不使主 Agent run 失败。
- trace 可记录摘要是否被采用的安全摘要，不记录被拒绝的原始长文本。

### Decision 3: `agent_loop` 仍先发轮次，摘要在 action 返回后更新

`agent_loop` 在每次调用 Planner 前发出，因此它不能包含模型尚未生成的摘要。实现应保持当前时序：

1. 进入 runtime loop，服务端发送 `agent_loop`，前端显示或更新 `#N`。
2. Planner 返回 action，服务端校验 `AgentAction`。
3. 如果 action 合法且 `activitySummary` 安全，服务端发送带摘要的 `agent_progress`。
4. 后续 tool execution、validation、content 等事件继续按现有逻辑推进。

这意味着用户可能先看到固定兜底“正在规划下一步...”，随后同一 `#N` 内更新为模型摘要，例如“需要查询动作库”。这是合理的流式渐进体验。

### Decision 4: NDJSON event 仍由服务端生成

`AgentProgressEvent` 可以新增 `activitySummary?: string`。该字段只能来自服务端对已校验 `AgentAction.activitySummary` 的安全投影，不能由模型直接输出 stream event。

服务端 stream 事件仍保留：

- `stage`: 稳定粗粒度阶段，用于 fallback、样式和未知摘要场景。
- `messageKey`: 现有固定文案 key，用于 fallback。
- `sequence`: 事件顺序。
- `activitySummary`: 可选用户态摘要。

前端解析时应对该字段做二次防御：非法类型、过长或空白时忽略摘要但不破坏整个 stream。

### Decision 5: 前端优先展示摘要，但不改变生命周期

活动条展示顺序：

1. 当前 activity event 有安全 `activitySummary` 时展示摘要。
2. 否则根据 `messageKey` / `stage` 展示现有固定文案。
3. 未知 stage 继续使用安全兜底文案。

活动摘要必须跟随现有活动条生命周期：

- `done`、`error`、abort、timeout、会话切换、新建会话时立即清空。
- 不写入 `ChatMessage` 或聊天历史保存 payload。
- 不进入 conversation summary、conversation context、visible output 或 artifact payload。
- `content` 到达后的 `writing_reply` 仍可按现有规则覆盖或延迟展示，但不能从 content 文本解析新摘要。

## Risks / Trade-offs

- [Risk] 模型输出内部术语或过长文案。→ Mitigation: schema 长度限制、服务端 sanitizer、前端二次忽略、fallback 固定文案。
- [Risk] 摘要与实际 tool 执行失败不一致。→ Mitigation: 摘要只表达 action 计划，不表达成功结果；错误和最终内容仍由 renderer / terminal failure projection 负责。
- [Risk] 频繁动态文案造成 UI 跳动。→ Mitigation: 复用现有 `reduceVisibleAgentActivity` 最小展示时间、sequence 和 pending 规则；摘要只替换右侧文案，不影响 loop 前缀。
- [Risk] prompt 字段增加带来少量 token 和输出长度成本。→ Mitigation: 字段短句化、可选、只放在 action contract，不扩写业务 tool manifest。
- [Risk] 开发者误把摘要当作业务决策信号。→ Mitigation: spec、测试和架构边界明确禁止 route/runtime/validator/tool/renderer 读取摘要做语义判断。

## Migration Plan

1. 扩展 `AgentAction` schema、类型、prompt contract 和 adapter / validator 测试。
2. 扩展 runtime trace / chat service 投影和 NDJSON event 类型。
3. 扩展前端 stream parser、activity reducer、组件展示和持久化边界测试。
4. 更新相关文档和 OpenSpec tasks。
5. 验证通过后再启用；如出现问题，可保留 schema 字段但停止服务端投影 `activitySummary`，前端会自动 fallback 到固定 stage 文案。

## Open Questions

- 无需要阻塞实现的问题。具体最大长度可在实现中按 UI 宽度和测试确定，建议从 40 个字符以内开始。
