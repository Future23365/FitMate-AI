## Context

当前 `agent_progress` 是生产聊天流里的用户安全 UI 事件，只包含 `stage`、`status`、`messageKey` 和 `sequence` 等短生命周期字段。前端用 `agentActivityDisplayByStage` 将 stage 映射成中文短文案，并对未知 stage 使用兜底文案，避免泄漏内部 toolName、trace step 或错误细节。

问题出在 production chat adapter 当前还维护了一个具体业务 `toolName -> AgentProgressStage` 表。这个表不在 tool 定义旁边，后续新增或重命名 tool 时很容易忘记同步。更好的边界是：tool 自己声明“这个 tool 被执行时适合展示哪类用户安全活动阶段”，chat adapter 只读取 tool definition 上的服务端内部字段并做安全投影。

本 change 归类为 production 接入变更和既有 tool definition 调整。它不新增业务 tool，不改变 tool 执行合同，不修改 Planner / Executor / Policy Guard / ResourceStore / Resource Contract Validator / Response Renderer 主流程。

## Goals / Non-Goals

**Goals:**

- 让生产 tool 的 UI activity stage 与 tool definition 同源，减少新增 tool 后忘记同步活动条映射的风险。
- 移除 production chat service 中具体业务 `toolName` 活动阶段表。
- 保留前端 stage 白名单和中文文案表，继续阻止内部技术标识直接进入用户 UI。
- 用测试证明生产 tool definition、chat service 映射和 architecture boundary 不会回退。

**Non-Goals:**

- 不新增 `AgentProgressStage`，除非现有粗粒度阶段无法表达新的用户可理解活动类别。
- 不让 LLM 决定活动条文案或阶段。
- 不根据用户原始自然语言、关键词、正则、同义词表或固定短句模板生成活动阶段。
- 不让每个 tool 直接提供任意用户文案；tool 只能选择稳定 stage enum。

## Decisions

### 1. 保留前端 `stage -> 中文文案` 白名单

`agentActivityDisplayByStage` 不是问题本身。它承担用户安全边界：前端只展示项目认可的中文短文案，未知 stage 只走兜底。把中文文案放到 tool definition 或后端 stream payload 会扩大泄漏面，也会让 UI 文案和 tool 合同耦合过重。

因此本 change 不把文案搬到后端，不让 tool 输出任意 label，只让 tool definition 声明稳定 `AgentProgressStage`。该字段只供服务端投影活动条使用，不进入 Planner manifest。

### 2. Tool 通过 `uiActivityStage` 声明活动阶段

production chat adapter 优先读取：

```ts
tool?.uiActivityStage
```

本 change 将现有生产 tool 的活动阶段补到各自定义中：

- `searchExerciseResources` -> `querying_exercises`
- `resolveExerciseResourceMentions` -> `querying_exercises`
- `inspectVisibleTrainingProposals` -> `reading_artifacts`

这样 toolName、tool 能力和 UI activity stage 在同一文件中维护。新增 tool 时，如果需要展示具体阶段，就在 tool definition 里声明；如果不声明，chat service 可以退回通用 `analyzing_request` 或基于稳定 resource contract 的 fallback。

### 3. Chat service 不维护具体业务 `toolName` map

`lib/server/chat/agent-text-chat-service.ts` 只允许：

- 根据 runtime event type 投影通用阶段，例如 `preparing_context`、`analyzing_request`、`validating_result`、`finalizing`。
- 对 `tool_execution` 优先读取 tool definition 的 `uiActivityStage`。
- 在 `uiActivityStage` 缺失时，使用稳定 resource contract fallback，例如生产 `visible_training_proposal_fact` 的 tool 可展示为 `reading_artifacts`。
- 最后退回 `analyzing_request`。

它不再维护 `toolActivityStageByToolName` 这种具体 toolName 表。

### 4. 用测试约束新增 tool 同步风险

测试应覆盖两类风险：

- 现有生产 tool 必须声明预期的 `uiActivityStage`。
- chat service 不得重新出现 `toolActivityStageByToolName` 或具体业务 toolName 的活动阶段映射。

这比只检查页面文案更有效，因为真正容易漏同步的是 tool 定义和 production adapter 之间的映射来源。

## Risks / Trade-offs

- [Risk] 未来 tool 忘记声明 `uiActivityStage` 后仍会退回 `analyzing_request`。  
  Mitigation: 增加 production tool definition 测试；新增需要具体进度的 tool 时测试会要求声明。
- [Risk] `uiActivityStage` 扩展被误用成任意用户文案。  
  Mitigation: `uiActivityStage` 只允许 `AgentProgressStage`，前端仍以白名单中文文案展示。
- [Risk] 完全删除 fallback 后未知 tool 阶段过于泛化。  
  Mitigation: 保留 resource contract fallback 和 `analyzing_request` 兜底，避免 UI 空白。

## Migration Plan

1. 补 OpenSpec proposal、design、spec delta 和 tasks。
2. 给现有生产 tool 增加 `uiActivityStage`。
3. 删除 production chat service 的具体 `toolName -> stage` 映射。
4. 更新测试，覆盖 tool activity stage 同步和 architecture boundary。
5. 运行 OpenSpec strict validation、相关单测和 `npm run typecheck`。
