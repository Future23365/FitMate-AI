## Context

当前生产 `/api/chat` 已重新接入新的 `agent-core` 文本聊天主链：请求经聊天接入层构造 `AgentRunInput`，由 `LlmPlanner` 产出 `AgentAction`，`runAgentRuntime()` 执行 Planner / Validator / Policy / Executor / ResourceStore / Response Renderer 链路，最后通过 NDJSON 白名单事件投影给前端。该链路已经脱离旧 `AgentOrchestrator`，旧 `ChatStreamEvent` 中的 `agent_activity`、旧训练卡片触发和旧 activity reducer 也在删除旧 runtime 时被移除。

用户要恢复的是聊天气泡中的活动条体验，不是恢复旧 AI 主链。旧活动条样式是一个很轻的行内状态：Material Symbols 图标、中文短文案、`text-primary/80`、`px-xs py-[2px]`、`motion-safe:animate-pulse` 和 `aria-live="polite"`。当前调试页 `/dev/ai-traces` 的 Agent Loop 展示仍在，但它面向开发排查，不适合直接搬到首页聊天。

本 change 归类为 production 接入变更，并带一个小型 core contract 扩展：需要从当前 runtime 生命周期或已有 `AgentTraceEvent` 产生用户安全进度事件。该扩展只能观察和投影，不能影响 Planner 决策、tool 执行、Policy Guard、ResourceStore、Resource Contract Validator 或最终 Response Renderer 结果。

## Goals / Non-Goals

**Goals:**

- 恢复首页聊天当前 AI 气泡顶部的活动条，并以旧 `AgentActivityIndicator` 的紧凑样式作为视觉基线。
- 在当前 `agent-core` 主链中产生实时或准实时的用户安全进度事件，默认事件名为 `agent_progress`。
- 保持活动阶段粗粒度、中文、用户安全，不展示内部 stage 原文、toolName、trace step name、prompt、raw model output、resource id 或 token usage。
- 保持活动状态为请求级临时 UI 状态，不进入消息、聊天历史、conversation summary、conversation context 或 artifact payload。
- 通过自动化测试覆盖事件解析、展示仲裁、生命周期清理、历史持久化边界、production stream 边界和 architecture boundary。

**Non-Goals:**

- 不恢复旧 `AgentOrchestrator`、旧 `agent_activity` stream 合同、旧 `assistant_action`、旧 `agent_execution_result` 或旧训练卡片触发事件。
- 不新增业务 tool，不修改 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 等 tool 的业务能力。
- 不在 `/api/chat` 中基于用户原文、关键词、正则、同义词表或短句模板推断活动阶段或选择 tool。
- 不让 LLM 生成活动事件；活动事件只能由服务端根据已发生的 runtime 生命周期投影。
- 不把 `/dev/ai-traces` 的完整 loop 时间线、token 用量、trace JSON 或调试模块展示搬进首页聊天。

## Decisions

### 1. 新增 `agent_progress`，不复活旧 `agent_activity`

新增一个当前 NDJSON 白名单事件，例如：

```ts
type AgentProgressEvent = {
  type: "agent_progress";
  stage: AgentProgressStage | string;
  status: "active" | "completed" | "skipped" | "failed";
  messageKey?: AgentProgressStage;
  sequence: number;
};
```

选择新事件名，是为了把当前 `agent-core` 的安全进度投影和旧 `AgentOrchestrator` 时代的 `agent_activity` 合同切开。旧事件名容易让后续实现误用旧 `ChatStreamEvent`、旧 reducer、旧 compatibility tests 或旧 runtime 字段；新事件名能让架构扫描明确区分“恢复旧样式”和“恢复旧链路”。

备选方案是继续使用 `agent_activity`。这个方案前端改动更少，但会和当前 architecture boundary 中“禁止旧 stream 事件回流”的测试冲突，也更容易把旧数据字段带回生产聊天主链，因此不采用。

### 2. 进度事件由聊天接入层投影，core 只提供通用观察点

`agent-core` 可以增加一个可选、非致命的观察点，例如 `RunAgentRuntimeInput.onTraceEvent` 或等价 `onRuntimeEvent`。Runtime 在现有 `traceEvents.push(...)` 的同一语义边界调用观察点；观察点失败不得中断 runtime，不得触发 planner 重试，不得修改 action、tool result、resource 或 terminal action。

production chat 接入层负责把这些通用 runtime 事件映射成用户安全阶段：

- 请求开始或 run input 构造完成：`preparing_context`
- Planner 调用开始、预算使用或 `planner_action` 前后：`analyzing_request`
- 可安全识别为动作查询 / 事实读取类只读 tool 执行：`querying_exercises` 或 `reading_artifacts`
- validation、terminal grounding、policy/resource 注册等确定性收口：`validating_result` 或 `finalizing`
- 首个用户可见 `content` 前后：`writing_reply`

映射不得读取用户原始自然语言，不得决定是否执行 tool，不得绕过 `ToolRegistry`。如果某个具体 tool 需要更准确的阶段名称，应优先通过 tool 定义中的安全 UI activity metadata 或安全 projection 元数据提供，而不是在 core 中写具体 `toolName` 分支。

备选方案是在 Response Renderer 中根据最终 `AgentRunResult.traceEvents` 一次性生成全部活动事件。这个方案实现更窄，但无法在请求处理中实时展示阶段，只能在最终内容到达前后一次性刷出历史阶段，不符合活动条的产品目标。

### 3. `/api/chat` 使用真实 streaming response 发送进度，终态事件仍来自 Response Renderer

当前聊天服务可以继续把最终 `AgentRunResult` 交给 `renderAgentResponseEvents()` 生成 `content`、`visible_output`、`tool_result`、`confirmation_request`、`assistant_suggestions`、`error` 和 `done`。但 response body 应允许在 runtime 执行过程中先发送 `agent_progress` 事件。

因此实现应把 production chat response 调整为 streaming writer：

1. 创建 trace、registry、run input 后立即写入初始 `agent_progress`。
2. runtime 运行过程中由观察点写入安全 `agent_progress`。
3. runtime 完成后调用现有 Response Renderer 写入终态用户事件。
4. 最后写入 `done` 并关闭 stream。

这个方案保持 Response Renderer 对最终用户内容和 tool result 安全投影的所有权，同时让 progress 成为独立的临时 UI 信号。它不允许 LLM 直接生成 NDJSON，不允许进度事件改变最终事件。

### 4. 前端复用旧视觉基线，但状态合同改为 `agent_progress`

恢复或重建 `AgentActivityIndicator` 时，以历史组件的视觉为准：

- 在当前 assistant 气泡顶部展示。
- 使用 `agent-activity-indicator` 类名或等价稳定 hook 方便测试。
- `flex items-center gap-xs px-xs py-[2px] font-label-sm text-label-sm font-bold`。
- 使用 `SymbolIcon` / Material Symbols，图标尺寸约 `16px`。
- 默认色为 `text-primary/80`，失败态可用 `text-error`。
- 使用 `motion-safe:animate-pulse motion-reduce:animate-none`。
- 保留 `aria-live="polite"` 和 `role="status"`。

前端状态层不复用旧事件名，但可以复用旧 reducer 的展示仲裁思想：具体阶段短时间内不被通用阶段覆盖、未知阶段不泄漏原文、请求结束立即清理、首段内容到达后可切到 `writing_reply`。

### 5. 测试优先用单测和架构扫描，不要求浏览器截图

本 change 的 UI 是小型状态条，不需要主动打开浏览器验证。验证重点应放在：

- `AgentProgressEvent` parser 拒绝非法 payload 和未知事件泄漏。
- reducer 对动态阶段、未知阶段、sequence 倒退、done/error/abort 清理的处理。
- `ChatPage` 将活动条放在当前 assistant 气泡顶部、`ChatThinkingIndicator` 之前，且不放在输入框上方。
- chat service stream 在首个 `content` 前发送至少一个 `agent_progress`，并且终态事件仍来自 Response Renderer。
- architecture boundary 证明没有恢复旧 `AgentOrchestrator`、旧 `agent_activity`、旧 `assistant_action` 或 `/api/chat` 关键词路由。

## Risks / Trade-offs

- [Risk] 进度事件被误用为业务事实或持久化内容。→ Mitigation：spec 明确禁止写入消息、历史、summary、context 和 artifact；测试覆盖持久化 payload 不含 progress。
- [Risk] 为了显示“查询动作库”在 `/api/chat` 或 core 写具体 toolName 分支。→ Mitigation：core 只发通用观察事件；阶段映射放在 chat adapter 或 tool 安全 metadata，不读取用户文本，不影响执行。
- [Risk] streaming 改造引入终态事件顺序回归。→ Mitigation：测试断言 `agent_progress` 只在 `content` 前或请求中出现，最终 `content` / `visible_output` / `done` 顺序保持当前 Response Renderer 合同。
- [Risk] 旧活动条样式被改成调试页卡片或多模块 trace。→ Mitigation：spec 固化旧紧凑视觉基线，明确不得使用 `/dev/ai-traces` loop 卡片样式。
- [Risk] 观察点异常影响 runtime。→ Mitigation：观察点失败只记录非致命诊断，不改变 runtime result，不重试模型或 tool。

## Migration Plan

1. 在 `agent-core` 增加非致命 runtime event 观察点或等价安全进度观察机制，并用 core 单测证明观察失败不影响 runtime。
2. 在 production chat service 中生成 `agent_progress` 事件并使用 streaming writer 输出；保持终态用户事件由现有 Response Renderer 生成。
3. 在前端 chat client / controller 中增加 `agent_progress` 解析、reducer、生命周期清理和历史持久化隔离。
4. 恢复旧活动条视觉组件并接入 ChatPage 当前 assistant 气泡顶部。
5. 更新 architecture boundary、chat service、client parser、controller、component 和 history tests。
6. 实现完成后补充 `docs/方案变更历史` 与 `docs/项目演变历程.md`，记录旧样式恢复和新核心链路接入边界。

## Open Questions

无。事件名默认使用 `agent_progress`；如果实现阶段发现项目已有更合适的当前主链命名，可在不恢复旧 `agent_activity` 合同的前提下同步更新 spec 和测试。
