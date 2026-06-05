## Context

当前 `/api/chat` 已通过 NDJSON stream 暴露 `agent_progress`，前端活动条用 stage 映射中文文案，并曾尝试在前端按已接受 progress 事件数量递增 `#N`。这个模型把“后端 Agent Loop 轮次”和“当前可展示活动阶段”混在一起：同一轮内 planner、tool、validation、content 等多个进度事件都会让前端误以为进入了新 Loop。

本 change 属于 production stream contract 和前端状态模型调整。它不改变 LLM 决策、tool 执行、ResourceStore、Policy Guard 或最终 Response Renderer 内容，只把当前请求生命周期中的两个用户安全事实拆开投影。

## Goals / Non-Goals

**Goals:**

- 用独立 `agent_loop` stream 事件表达后端真实 Agent Loop 轮次。
- 继续用独立 Activity 事件表达当前可展示阶段，例如 `agent_progress.stage`。
- 前端活动条拆成 `loopTurn` 和 `activityStage` 两个状态，分别由不同事件更新。
- 保持 UI 简约：仅展示 `#N` 加中文短文案，不展示内部技术名、runtime step、toolName 或 trace 详情。
- 保持后续扩展空间：同一 Loop 内可以继续增加 validation、policy、resource、saving、rendering 等 Activity 阶段，不影响 Loop 事件合同。

**Non-Goals:**

- 不新增 HTTP 请求；所有事件仍通过当前 `/api/chat` NDJSON stream 发送。
- 不改变 Planner prompt、tool manifest、schema summary 或模型可见输入。
- 不让前端根据用户文本、stage 数量、sequence、toolName 或 content 自行推断 Loop 轮次。
- 不把完整 trace、runtime debug payload、tool input/output、resource id 或 token usage 暴露给聊天页 UI。
- 不恢复旧 `AgentOrchestrator`、旧 `agent_activity` 或旧 card trigger 事件。

## Decisions

### Decision 1: Loop 轮次使用独立事件，不作为 Activity 字段

`agent_loop` 表达当前请求进入第几轮 Agent Loop，payload 只包含 `loopTurn` 和必要排序字段。Activity 事件只表达 stage/status/messageKey/sequence 等展示阶段。

原因：Loop 是后端 runtime 边界事实，Activity 是当前轮次内的用户可见状态。两者更新频率不同，如果放在一个事件里，未来每轮增加 validation、resource registration、saving 或 rendering 阶段时，要么重复携带轮次，要么让前端继续猜测状态含义。

备选方案是给 `agent_progress` 增加 `loopTurn` 字段。这个方案短期改动少，但会暗示每个 progress 都必须和某个 Loop 同步绑定，也不利于表示“还未进入 Loop 的准备阶段”。

### Decision 2: 前端只接收 Loop 轮次，不本地推断轮次

前端 reducer 收到 `agent_loop` 才更新 `loopTurn`；收到 Activity 事件只更新 `activityStage`。`sequence` 继续只用于 stream 事件顺序保护，不能用于计算 `#N`。

原因：真实 Loop 边界只有后端 runtime 知道。前端按事件数、stage 变化、重复 stage 或 content 到达推断都会在同一 Loop 多事件场景下失真。

### Decision 3: Activity 阶段保持中文展示映射，技术标识不直接渲染

服务端和 stream 使用英文枚举作为稳定合同，前端继续通过 `agentActivityDisplayByStage` 或等价映射展示中文短文案。未知 stage 使用安全兜底文案，不把原始枚举展示给用户。

原因：技术标识适合作为代码合同，用户界面只需要大致状态。这样也符合当前 prompt/tool/stream 合同中“技术标识英文、用户可见文案中文”的项目规则。

### Decision 4: Loop 与 Activity 均为当前请求临时状态

`loopTurn` 和 `activityStage` 只存在于当前正在生成的 assistant 回复状态中。收到 `done`、`error`、abort、timeout、会话切换或新建会话时一起清理，不进入 `ChatMessage`、conversation summary、artifact 或模型上下文。

原因：它们是运行中 UI 反馈，不是聊天内容、训练事实或模型可消费上下文。

## Risks / Trade-offs

- [Risk] 后端 runtime 当前 trace 事件若没有稳定 Loop 边界字段，可能需要在 runtime 观察点补充通用 loop index。→ Mitigation：只在当前 agent-core 生命周期中增加通用 runtime 观察，不基于具体 toolName 或用户文本推断。
- [Risk] `agent_loop` 和 Activity 事件可能乱序到达。→ Mitigation：保留 sequence 或等价排序保护；过期事件不得回滚 UI，Loop 与 Activity 分别处理。
- [Risk] 初始准备阶段没有 Loop 轮次会让 UI 少显示 `#N`。→ Mitigation：这是正确语义；未进入后端 Agent Loop 前只显示中文活动文案。
- [Risk] 旧测试可能仍假设 `agent_progress` 是唯一活动事件。→ Mitigation：新增 client parser、service stream fixture 和 reducer 测试，证明两类事件可独立消费。

## Migration Plan

1. 在服务端 stream 白名单和类型中新增 `agent_loop` 事件，并保证它不包含 toolName、trace payload 或模型输出。
2. 在 agent-core runtime 或 production chat adapter 的真实 Loop 边界输出 `agent_loop`，进入下一轮才递增。
3. 保留 Activity 事件用于 stage 文案；如沿用 `agent_progress`，不得把轮次字段塞入该事件作为前端计数依据。
4. 前端 parser 增加 `agent_loop` 校验；活动状态 reducer 拆分 `loopTurn` 与 `activityStage`。
5. 更新组件渲染：有 `loopTurn` 时展示 `#N`，没有时只展示中文文案。
6. 补齐 stream、reducer、component、architecture boundary 和 typecheck 验证。
