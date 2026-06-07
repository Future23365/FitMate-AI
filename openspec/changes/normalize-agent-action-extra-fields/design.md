## Context

当前生产 Agent loop 的执行核心依赖 `AgentAction.type`、`toolName` 和 `input`。在一次真实 trace 中，模型返回了 `type = "tool_call"`、合法 `toolName = "searchExerciseResources"` 和可执行的 warmup/stretch 查询 `input`，但顶层额外携带 `content`，导致 `AgentAction` schema 以 `Unrecognized key: "content"` 判定 `invalid_action_schema`。这使本应继续执行的只读 tool 调用在进入 Executor 前中断，并消耗 repair 预算。

这个问题属于 core contract 变更，不是 `searchExerciseResources` 的业务 tool 问题，也不是前端卡片渲染问题。调整应保持 `docs/agent-tool-orchestrator-design.md` 的边界：Agent core 不读取用户自然语言、不写具体业务 `toolName` 分支、不绕过 ToolRegistry、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer。

## Goals / Non-Goals

**Goals:**

- 让 `AgentAction` validator 能容忍模型在已确定 action variant 顶层输出的无关字段。
- 对 `tool_call` 继续严格校验 `type`、`toolName` 和 `input`，并保持 tool input schema 的强约束。
- 丢弃字段只作为 trace diagnostic，不进入执行、展示、grounding、resource 或 repair 主路径。
- 避免可安全丢弃的格式噪声消耗 repair budget。
- 覆盖本次 `tool_call.content` 中断 warmup/stretch 查询的回归场景，同时用通用合同表达，不写业务 phrasing 或 toolName 特判。

**Non-Goals:**

- 不修改 `searchExerciseResources` 查询逻辑、support section 策略、repository hard filters 或动作库数据。
- 不新增服务端关键词、正则、同义词或用户原文语义分流。
- 不把旧同义字段转换为新字段，例如不把 `question`、`message`、`usedToolResultIds` 自动映射为当前合同字段。
- 不放宽 tool input schema、terminal output validator、resource / policy / grounding 校验。
- 不把 `tool_call.content` 发送到前端，也不把它当作用户可见回答。

## Decisions

### 1. 在 Action Validator 边界做 type-aware normalization

实现应在解析出 JSON object 且 `type` 属于合法 discriminator 后，根据当前 `type` 的顶层字段 allowlist 生成 normalized action：

- `tool_call` 保留 `type`、`toolName`、`input`、`activitySummary`。
- `final_answer` 保留 `type`、`content`、`activitySummary`、`suggestedQuestions`、`usedRefs`、`visibleOutputs`。
- `ask_user` 保留 `type`、`content`、`activitySummary`、`suggestedQuestions`、`usedRefs`。

未知顶层字段只在 selected variant 的 required fields 已存在时被丢弃；normalizer 不使用这些字段补齐缺失字段，不做字段重命名，也不根据字段名推断模型意图。

取舍：继续依赖 strict Zod 会让 LLM 多吐字段直接中断 loop；完全 permissive 会让合同漂移。type-aware normalization 只处理 selected action 顶层无关字段，保留执行关键字段的严格失败边界。

### 2. Tool input 仍由对应 tool schema 严格校验

normalization 只作用于 `AgentAction` 顶层。`input` 内部字段不由 core 静默 strip，仍交给对应 tool 的 input schema / handler 边界处理。缺少 `input`、`toolName` 未注册、`input` 字段类型错误、枚举错误、非法 `resourceId` 或业务确定性边界错误仍进入现有 invalid action / invalid tool input / domain validation 流程。

取舍：如果连 tool input 内部也做宽松丢弃，会把每个业务 tool 的合同变成隐式兼容层；当前需求只证明顶层无关字段会干扰 loop，不证明 tool input 应放宽。

### 3. 丢弃字段写入 trace diagnostic，不进入模型可见 repair

当 action 被 normalization 接受时，runtime / validator 应记录可复盘诊断，例如 selected `type`、dropped field paths、字段数量、是否继续执行。诊断不应包含被丢弃字段的完整值；尤其 `content`、`payload`、`visibleOutputs` 等可能包含用户可见文本或大 payload 时只能记录 path、类型、长度或脱敏摘要。

取舍：静默丢弃会让问题难排查；把这类噪声升级为 repair 会继续打断 loop。trace diagnostic 保留证据，同时不影响用户路径。

### 4. Repair 只处理仍不可执行的结构错误

normalization 后如果 action 通过 schema、registry、tool input、policy、resource 和 terminal 校验，则不进入 repair，不消耗 repair budget。只有以下情况继续进入 repair 或失败边界：

- `type` 缺失或不是合法 discriminator。
- selected variant 缺少必填字段。
- `toolName` 未注册。
- `input` 缺失或不符合 tool schema。
- terminal action 的 `content`、`visibleOutputs`、`usedRefs`、resource、policy 或 grounding 不合法。
- 旧同义字段是唯一可见候选字段，例如 `ask_user.question` 存在但 `content` 缺失。

取舍：这保留了结构化 repair 的价值，也避免把“多余字段”误当成需要模型重新规划的业务失败。

## Risks / Trade-offs

- [Risk] 模型持续输出无关字段，问题被 normalization 掩盖。→ Mitigation: trace 记录 dropped field paths，并补测试断言 diagnostic 存在；必要时后续可加 metrics。
- [Risk] 过度 normalization 形成旧字段兼容层。→ Mitigation: 只丢弃 selected variant 顶层无关字段，不映射旧字段，不用丢弃字段补 required fields。
- [Risk] 丢弃 `content` 后用户看不到模型本想表达的中间说明。→ Mitigation: `tool_call` 本来不是用户可见终态；用户可见文本仍只来自合法 `final_answer.content` / `ask_user.content`。
- [Risk] trace 记录 extra field 值造成隐私或 payload 膨胀。→ Mitigation: trace 只记录 path、类型、长度、hash 或脱敏摘要，不记录完整值。
