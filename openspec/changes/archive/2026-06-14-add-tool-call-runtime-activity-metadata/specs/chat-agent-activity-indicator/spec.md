## REMOVED Requirements

### Requirement: 聊天活动条必须展示模型生成的活动摘要
**Reason**: 该 requirement 将活动摘要来源绑定到“模型通过活动汇报 tool 生成”，会继续暗示 `reportAgentActivity` / `model_activity` 是当前生产活动条主合同。新的合同把摘要迁移到业务 tool call 的 `runtimeMetadata.activitySummary`、tool 静态默认摘要或安全 fallback。

**Migration**: 使用“聊天活动条必须展示安全活动摘要”表达当前 UI 行为。前端只消费 `/api/chat` 已校验的 `agent_progress.activitySummary`，不得依赖独立 activity tool、旧 `AgentAction.activitySummary` 或固定 `model_activity` stage。

## MODIFIED Requirements

### Requirement: 聊天活动条必须展示安全活动摘要
聊天页活动条 SHALL 在当前请求处理中优先展示服务端投影的安全 `activitySummary`。当摘要缺失或不安全时，活动条 MUST 继续使用现有 `AgentProgressStage` 固定中文文案或安全兜底文案。`activitySummary` 的当前生产来源 MUST 是 `/api/chat` 已校验 runtime metadata、tool wrapper 静态默认摘要或服务端安全 fallback，不得要求模型通过独立 activity tool 生成。

#### Scenario: 展示 runtime metadata activitySummary
- **WHEN** 前端收到合法 `agent_progress` 事件
- **AND** 事件包含通过前端二次校验的 `activitySummary`
- **THEN** 活动条 MUST 展示该摘要作为右侧中文文案
- **AND** 活动条 MAY 继续使用当前 stage 对应的图标、色调和紧凑布局
- **AND** 活动条 MUST NOT 展示 `toolName`、trace step name、runtime event type、schema 字段或调试 payload
- **AND** 前端 MUST NOT 要求事件 `stage` 固定为 `model_activity`

#### Scenario: 前端不恢复旧 activity 来源
- **WHEN** 聊天活动条消费 `agent_progress.activitySummary`
- **THEN** 前端 MUST NOT 从 `reportAgentActivity`、旧 `AgentAction.activitySummary`、旧 `agent_activity` 事件或 assistant `content` 文本恢复摘要
- **AND** 前端 MUST NOT 根据用户输入、业务 `toolName` 或 stage 原文生成替代摘要
- **AND** 摘要仍 MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、conversation context、visible output、artifact payload 或本地历史兼容字段
