## ADDED Requirements

### Requirement: 聊天活动条必须展示模型生成的活动摘要
聊天页 SHALL 优先展示 `/api/chat` stream 中由模型通过活动汇报 tool 生成的 `activitySummary`。该摘要 MUST 作为当前请求内临时 UI 文案处理，不得进入 assistant message 正文、聊天历史、conversation summary、visible output、artifact payload 或训练事实。

#### Scenario: 展示模型活动摘要
- **WHEN** 前端收到合法 `agent_progress` 事件
- **AND** 事件 `stage` 为 `model_activity` 或等价模型活动阶段
- **AND** 事件包含非空 `activitySummary`
- **THEN** 活动条 MUST 展示该 `activitySummary`
- **AND** 活动条 MUST 继续保持 `aria-live="polite"` 和当前紧凑样式
- **AND** 活动条 MUST NOT 展示 raw stage、toolName、trace step name、runtime event type 或调试 payload

#### Scenario: 活动摘要不污染消息内容
- **WHEN** 当前 assistant message 消费包含 `activitySummary` 的 `agent_progress`
- **THEN** `activitySummary` MUST NOT 被追加到 assistant message `content`
- **AND** `activitySummary` MUST NOT 写入 `suggestedQuestions`、`visibleOutputs` 或历史保存 payload
- **AND** 恢复历史会话时 MUST NOT 重放旧活动摘要

#### Scenario: 摘要缺失时保留现有 fallback
- **WHEN** stream 未提供模型活动摘要
- **THEN** 聊天页 MAY 继续展示已有 loading 或 stage fallback 文案
- **AND** 前端 MUST NOT 根据用户输入、assistant content 或业务 toolName 生成替代摘要

### Requirement: 聊天活动条必须继续独立显示 Agent Loop 轮次
聊天页 SHALL 保持 `agent_loop` 和模型活动摘要为两个独立状态。`#N` MUST 只来自 `agent_loop.loopTurn`，右侧文案 MUST 来自模型活动摘要或安全 fallback。

#### Scenario: 模型摘要不改变 loop 前缀
- **WHEN** 活动条已经展示合法 `loopTurn`
- **AND** 前端收到包含模型 `activitySummary` 的 `agent_progress`
- **THEN** 活动条 MUST 更新右侧文案
- **AND** 活动条 MUST 保持当前 `#N` 前缀不变
- **AND** 前端 MUST NOT 根据摘要事件数量递增、重置或推断 `loopTurn`

#### Scenario: 新 loop 保留当前摘要文案
- **WHEN** 活动条已经展示模型活动摘要
- **AND** 前端随后收到新的合法 `agent_loop` 事件
- **THEN** 活动条 MUST 更新 `#N` 前缀
- **AND** 活动条 MAY 保留当前摘要直到下一条模型活动摘要或请求结束
- **AND** 摘要文案重复 MUST NOT 阻止合法 loop 前缀更新
