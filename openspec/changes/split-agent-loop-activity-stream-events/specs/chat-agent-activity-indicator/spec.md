## ADDED Requirements

### Requirement: 聊天活动条必须独立消费 Agent Loop 和 Activity 事件

聊天页 SHALL 将 Agent Loop 轮次和当前活动文案建模为两个独立的临时 UI 状态。`#N` MUST 只来自后端 stream 的 Loop 事件；右侧中文文案 MUST 只来自 Activity stage 映射或安全兜底文案。

#### Scenario: 收到 Loop 事件只更新轮次前缀
- **WHEN** 前端聊天客户端收到合法 `agent_loop` 事件
- **THEN** 当前活动条状态 MUST 更新为该事件的 `loopTurn`
- **AND** 活动条在存在活动文案时 MUST 展示 `#N` 前缀
- **AND** 该更新 MUST NOT 修改当前 Activity stage、中文文案、图标或失败状态
- **AND** 非正整数、非有限数字或过期的 `loopTurn` MUST NOT 覆盖当前轮次

#### Scenario: 收到 Activity 事件只更新中文文案
- **WHEN** 前端聊天客户端收到合法 `agent_progress` 或等价 Activity 事件
- **THEN** 当前活动条状态 MUST 更新对应 Activity stage
- **AND** 活动条右侧 MUST 展示该 stage 映射出的中文短文案
- **AND** 该更新 MUST NOT 递增、重置或推断 `loopTurn`
- **AND** 未知 stage MUST 使用安全兜底中文文案，不得直接渲染原始 stage 字段

#### Scenario: 同一 Loop 内多次 Activity 更新保持同一前缀
- **WHEN** 前端先收到 `agent_loop` 的 `loopTurn=1`
- **AND** 随后收到多个 Activity 事件，例如 `analyzing_request`、`querying_exercises`、`validating_result`
- **THEN** 活动条 MUST 可以更新右侧中文文案
- **AND** 活动条 MUST 保持 `#1` 前缀不变
- **AND** 前端 MUST NOT 按 Activity 事件数量显示 `#2`、`#3` 或更高轮次

#### Scenario: 新 Loop 内重复相同 Activity 文案仍更新前缀
- **WHEN** 前端已经展示 `#1 正在查询动作库...`
- **AND** stream 随后发送合法 `agent_loop` 事件，`loopTurn=2`
- **AND** 新轮次内 Activity stage 仍为 `querying_exercises`
- **THEN** 活动条 MUST 展示 `#2 正在查询动作库...`
- **AND** 前端 MUST NOT 因中文文案重复而忽略新的 Loop 轮次

#### Scenario: 未进入 Loop 前不显示虚假前缀
- **WHEN** 当前请求只有准备阶段 Activity 事件，尚未收到合法 Loop 事件
- **THEN** 活动条 MAY 展示准备阶段中文文案
- **AND** 活动条 MUST NOT 显示 `#0`、`#1` 或基于本地计数生成的前缀

#### Scenario: 请求结束时同时清理两类临时状态
- **WHEN** stream 收到 `done`、`error`，请求 abort、timeout、会话切换或新建会话
- **THEN** 前端 MUST 清空当前 `loopTurn` 和 Activity stage
- **AND** 两类状态 MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、visible output、artifact payload 或模型上下文

### Requirement: Agent Loop 前缀必须保持简约用户可见样式

聊天页活动条 SHALL 以简约行内样式展示 Agent Loop 前缀。该前缀 MUST 只使用 `#N` 形式表达轮次，不得展示“Agent Loop”、runtime step、planner call、tool call 或其他技术诊断文本。

#### Scenario: 活动条展示简约轮次前缀
- **WHEN** 活动条同时存在合法 `loopTurn` 和 Activity 文案
- **THEN** 活动条 MUST 在中文文案前展示 `#N`
- **AND** `#N` MUST 与中文文案视觉相邻但状态来源独立
- **AND** 活动条 MUST NOT 展示 `Loop 1`、`第一轮`、`Step1`、`S1`、runtime step、planner call 或 tool call 诊断信息

#### Scenario: 前缀不与文案语义绑定
- **WHEN** 第五个 Agent Loop 内 Activity stage 仍是 `querying_exercises`
- **THEN** 活动条 MUST 能展示 `#5 正在查询动作库...`
- **AND** 系统 MUST NOT 把 `querying_exercises` 文案解释为第几轮含义
