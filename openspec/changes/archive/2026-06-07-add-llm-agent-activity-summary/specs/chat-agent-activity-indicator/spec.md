## ADDED Requirements

### Requirement: 聊天活动条必须展示安全活动摘要
聊天页活动条 SHALL 在当前请求处理中优先展示服务端投影的安全 `activitySummary`。当摘要缺失或不安全时，活动条 MUST 继续使用现有 `AgentProgressStage` 固定中文文案或安全兜底文案。

#### Scenario: 展示 activitySummary
- **WHEN** 前端收到合法 `agent_progress` 事件
- **AND** 事件包含通过前端二次校验的 `activitySummary`
- **THEN** 活动条 MUST 展示该摘要作为右侧中文文案
- **AND** 活动条 MAY 继续使用当前 stage 对应的图标、色调和紧凑布局
- **AND** 活动条 MUST NOT 展示 `toolName`、trace step name、runtime event type、schema 字段或调试 payload

#### Scenario: 摘要缺失时使用 stage fallback
- **WHEN** 前端收到合法 `agent_progress` 事件
- **AND** 事件不包含可展示 `activitySummary`
- **THEN** 活动条 MUST 按现有 `messageKey` / `stage` 映射展示固定中文短文案
- **AND** 未知 stage MUST 使用安全兜底文案
- **AND** 活动条 MUST NOT 渲染未知 stage 原文

#### Scenario: 前端二次防御非法摘要
- **WHEN** stream event 中的 `activitySummary` 不是字符串、trim 后为空、超过前端允许长度或包含明显内部实现标识
- **THEN** 前端 MUST 忽略该摘要
- **AND** 前端 MUST 保持 stream 可继续消费
- **AND** 当前 assistant message 内容 MUST NOT 被该非法摘要污染

#### Scenario: activitySummary 不进入聊天历史
- **WHEN** 前端保存或恢复聊天会话
- **THEN** `activitySummary` MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、conversation context、visible output、artifact payload 或本地历史兼容字段
- **AND** 恢复历史会话时 MUST NOT 重放旧 `activitySummary`

### Requirement: 活动摘要必须保持用户可访问展示
聊天页 SHALL 以现有活动条可访问性和紧凑样式展示 `activitySummary`。新增摘要文案 MUST 不破坏当前回答框布局、loop 前缀或辅助技术状态提示。

#### Scenario: 摘要与 loop 前缀同屏展示
- **WHEN** 活动条同时存在合法 `loopTurn` 和安全 `activitySummary`
- **THEN** 活动条 MUST 展示 `#N` 前缀和摘要文案
- **AND** `#N` MUST 只来自 `agent_loop.loopTurn`
- **AND** 摘要文案 MUST NOT 改写、递增或隐藏合法 loop 前缀

#### Scenario: 摘要使用 polite 状态提示
- **WHEN** 活动条展示 `activitySummary`
- **THEN** 活动条 MUST 继续使用 `aria-live="polite"` 或等价方式暴露状态变化
- **AND** 动效 MUST 继续支持 `prefers-reduced-motion`
- **AND** 文案长度 MUST 受控，避免遮挡消息列表、输入框、发送按钮、建议按钮或训练卡片操作
