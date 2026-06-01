## Context

首页聊天已经通过 `/api/chat` 的 NDJSON stream 返回 `content`、artifact、suggestions、`done` 和 `agent_execution_result` 等事件。前端 `useChatController` 逐行解析 stream，并把通用的 `isReasoning` / “正在思考”状态渲染到聊天消息区域。

Agent loop 模式后，首个用户可见文本到达前可能会经历更多内部阶段：构建 `ContextPackage`、调用模型决策、执行动作库查询或 artifact 读取、生成 routine / plan / recommendation、经过 validator / policy / persistence、最后由 Response Writer 投影成用户回复。用户等待时间变长，但当前 UI 只有一个模糊 loading 提示。

这个问题的关键不是缺少开发者 trace，而是缺少面向普通用户的、低泄漏风险的活动提示。生产聊天页不应该直接展示 `/dev/ai-traces` 的 step title、toolName、resource id 或模型阶段字段；需要一个受控的用户可见活动协议。

## Goals / Non-Goals

**Goals:**

- 在聊天输入框上方展示当前 Agent 大致活动，让用户知道系统正在推进。
- 使用中文短文案表达阶段，例如“正在理解训练需求...”“正在查询动作库...”“正在校验训练内容...”。
- 让服务端通过稳定枚举提供活动阶段，前端负责文案、图标和动效映射。
- 保持 activity 状态短生命周期：只服务于当前请求，不保存到聊天历史。
- 用简洁视觉特效表达 Agent 编排感，同时符合现有浅色 MD3 风格。
- 覆盖成功、失败、超时、取消和未知事件的清理与兜底测试。

**Non-Goals:**

- 不展示完整 Agent timeline、trace、prompt、tool payload、候选池、资源 id 或 token 信息。
- 不让前端根据用户自然语言推断 Agent 阶段。
- 不改变 AgentOrchestrator 的工具选择、模型输出 Schema、训练计划生成规则或权限边界。
- 不新增数据库表，不持久化 activity 状态。
- 不把 activity 当成精确进度条；它只表达当前大致阶段，不承诺剩余时间或完成百分比。

## Decisions

### 1. 新增 UI 专用 `agent_activity` stream 事件

服务端在 `/api/chat` stream 中新增 `agent_activity` 或等价事件，事件只包含面向 UI 的安全字段：

- `stage`: 稳定枚举，例如 `preparing_context`、`analyzing_request`、`querying_exercises`、`reading_artifacts`、`generating_workout`、`validating_result`、`saving_result`、`writing_reply`、`finalizing`。
- `status`: `active`、`completed`、`skipped` 或 `failed`，首版可只消费 `active`。
- `messageKey`: 可选文案键，用于前端映射；不直接信任服务端自由文案。
- `sequence`: 可选递增序号，避免乱序事件覆盖较新的阶段。

不直接复用 trace step 的 `name`、`aiStage` 或 `toolName`。这些字段服务于开发者诊断，语义太细且容易泄漏内部实现。activity 事件是生产 UI 合同，必须比 trace 更稳定、更粗粒度。

替代方案是前端从 `agent_execution_result` 或 artifact 事件反推状态。这个方案只能在关键结果已经产生后更新，无法覆盖首个回复前的等待期，也容易重新引入基于内部字段的脆弱推断，因此不采用。

### 2. 服务端在明确边界处发 activity，而不是为每个 trace step 发事件

activity 应绑定到 Agent 主链的稳定边界，而不是逐条 trace step 镜像输出：

- 请求进入 Agent 前：`preparing_context`。
- 模型决策或理解需求前：`analyzing_request`。
- 执行 `searchExercises`、推荐候选、routine / plan 候选查询等动作库相关工具时：`querying_exercises`。
- 读取或修订已有 artifact 时：`reading_artifacts`。
- 生成推荐、routine 或 plan 草稿时：`generating_workout`。
- Validator / Policy / Confirmation gate 执行时：`validating_result`。
- 保存 artifact revision 或持久化结果时：`saving_result`。
- Response Writer 生成最终回复时：`writing_reply`。
- summary update 或收尾阶段：`finalizing`。

如果某次请求只是普通问答，服务端可以只发准备、分析、整理回复等少量事件。activity 不要求覆盖每个内部工具，也不要求严格数量一致。

### 3. 前端维护独立的短生命周期 `agentActivity` 状态

`useChatController` 新增 `agentActivity` 状态，随 `sendMessage` 开始设置初始兜底阶段，收到 `agent_activity` stream 后更新，收到 `content` 后可以继续保留“正在整理回复...”或在首段内容出现后淡出。请求 `done`、`error`、abort、timeout、hash 切换、新会话、重新加载历史时必须清空。

`agentActivity` 不进入 `ChatMessage`，不写入 `saveChatConversation`，不参与 conversation summary，也不用于测试最终用户可见回复内容是否合格。

### 4. 状态条放在输入框上方，并替代现有通用 thinking 提示

展示组件建议命名为 `AgentActivityIndicator` 或等价名称，放在聊天输入区域上方、消息列表下方。它应使用现有 `SymbolIcon` 和项目 token，形成轻量 surface：

- 左侧动态图标或环形脉冲，表示 Agent 正在执行。
- 中间展示短文案，最多一行，长文本截断或自适应。
- 右侧使用跳动点阵、流动线或阶段小节点，表达编排推进。
- 使用 `aria-live="polite"`，让辅助技术能感知状态变化。
- `prefers-reduced-motion` 下禁用或弱化循环动画。

现有 `ChatThinkingIndicator` 可被复用、重命名或拆分，但最终页面不应同时出现“正在思考”和新的 activity 状态，避免 loading 信息重复。

### 5. 文案由前端白名单映射

前端维护 `AgentActivityStage` 到中文文案的映射，例如：

- `preparing_context`: `正在整理上下文...`
- `analyzing_request`: `正在理解训练需求...`
- `querying_exercises`: `正在查询动作库...`
- `reading_artifacts`: `正在读取已有训练内容...`
- `generating_workout`: `正在生成训练安排...`
- `validating_result`: `正在校验训练内容...`
- `saving_result`: `正在保存训练结果...`
- `writing_reply`: `正在整理回复...`
- `finalizing`: `正在收尾...`

未知 stage 使用兜底文案 `正在推进 Agent 编排...`。不直接展示服务端传入的任意 `delta` 或 `message`，避免把内部英文阶段、工具参数或错误细节暴露给用户。

## Risks / Trade-offs

- [Risk] activity 事件太细会变成生产版 trace。→ Mitigation：只允许白名单枚举和前端文案映射，不透传 tool payload、id、prompt 或 trace step。
- [Risk] 阶段更新和真实耗时不完全一致，用户误以为是精确进度。→ Mitigation：不展示百分比或进度条，只用“正在...”短句表示大致活动。
- [Risk] 首版服务端无法覆盖所有工具类型。→ Mitigation：未知或未映射工具统一落到分析、生成、校验、整理回复等通用阶段。
- [Risk] 动效影响可访问性或让页面显得嘈杂。→ Mitigation：动效克制，支持 `prefers-reduced-motion`，状态条只在请求期间出现。
- [Risk] stream 事件乱序导致状态回退。→ Mitigation：可选 `sequence` 或前端阶段优先级，收到旧序号事件时忽略。

## Migration Plan

1. 扩展聊天 stream 类型，新增 `agent_activity` 事件和 `AgentActivityStage` 类型。
2. 在 `/api/chat` Agent 主链的稳定边界发出 activity 事件，先覆盖上下文准备、需求分析、动作库查询、训练生成、校验、保存、回复整理和收尾。
3. 在 `useChatController` 中新增 `agentActivity` 状态，处理 stream 更新、请求完成清理、失败清理、超时清理和会话切换清理。
4. 在聊天输入区上方新增 activity 展示组件，并替换或整合现有 `ChatThinkingIndicator`。
5. 补充相关测试：stream event 类型/解析、hook 状态生命周期、组件文案/动效 class、未知 stage 兜底和内部字段不泄漏。
6. 运行 `openspec validate add-agent-activity-indicator --strict`、相关测试和 `npm run typecheck`。

Rollback 策略：如果 activity 展示出现问题，可以保留服务端事件但前端隐藏状态条；由于 activity 不参与消息持久化和业务执行，回滚不影响训练计划生成或聊天结果。

## Open Questions

无需要暂停实现的问题。具体 stage 命名可在实现时按当前 AgentOrchestrator 函数边界微调，但必须保持粗粒度、中文映射和不泄漏内部调试信息的边界。
