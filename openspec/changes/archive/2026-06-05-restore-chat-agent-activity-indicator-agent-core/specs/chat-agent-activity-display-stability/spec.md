## MODIFIED Requirements

### Requirement: Agent activity display prioritizes informative stages

聊天页 SHALL 在展示 Agent 进度状态时优先展示更具体、更有信息量的阶段，而不是把当前 `agent-core` 动态 loop 中的通用 planner / validation 事件直接作为每次可见状态更新。

#### Scenario: 通用阶段不短时间覆盖具体阶段
- **WHEN** 前端已经展示 `querying_exercises`、`reading_artifacts`、`generating_workout`、`validating_result`、`saving_result`、`writing_reply` 或 `finalizing` 等具体阶段
- **THEN** 随后短时间到达的 `preparing_context` 或 `analyzing_request` MUST NOT 覆盖当前具体阶段
- **AND** 展示逻辑 MUST NOT 假设这些具体阶段按固定顺序出现
- **AND** 展示逻辑 MUST NOT 根据用户消息文本补齐缺失阶段

#### Scenario: 通用阶段作为初始兜底
- **WHEN** 当前没有可展示的 Agent 进度状态并收到 `preparing_context` 或 `analyzing_request`
- **THEN** 聊天页 MUST 可以展示通用活动文案
- **AND** 通用文案 MUST 表达 Agent 正在准备上下文或规划下一步，而不是暗示服务端卡住、重新开始执行或已经调用某个 tool

#### Scenario: 未知阶段不泄漏内部字段
- **WHEN** 前端收到未知 Agent 进度 stage
- **THEN** 如果当前没有展示状态，聊天页 MUST 使用安全兜底中文文案
- **AND** 如果当前已经展示具体阶段，未知 stage MUST NOT 抢占当前具体阶段
- **AND** 展示内容 MUST NOT 包含未知 stage 原文、toolName、trace step name、runtime event type 或调试 payload

#### Scenario: sequence 倒退不会回滚 UI
- **WHEN** 前端收到 sequence 小于当前已处理 sequence 的 Agent 进度事件
- **THEN** 展示状态 MUST 保持当前结果
- **AND** 过期事件 MUST NOT 覆盖当前文案、图标或状态

### Requirement: Agent activity display remains ephemeral and interruptible

聊天页 SHALL 保持 Agent 进度展示的短生命周期，并允许请求结束、请求取消或会话切换立即清理展示状态。

#### Scenario: 请求结束立即清理
- **WHEN** stream 收到 `done`、`error`，请求 abort，用户切换会话，或用户新建会话
- **THEN** 当前 Agent 进度展示 MUST 立即清空
- **AND** 最小展示时间规则、动画状态和具体阶段保护规则 MUST NOT 延迟这些清理动作

#### Scenario: 首段内容到达后进入回复整理提示
- **WHEN** stream 收到用户可见 `content`
- **THEN** 前端 MUST 可以将当前 Agent 进度展示更新为 `writing_reply`
- **AND** 该更新 MUST NOT 依赖之前是否出现过固定的工具阶段
- **AND** 前端 MUST NOT 从 `content` 文本中解析训练业务阶段

#### Scenario: 失败状态安全展示
- **WHEN** stream 收到 failed 状态的 Agent 进度事件但尚未收到终态 `error` 或 `done`
- **THEN** 前端 MAY 展示安全失败态文案
- **AND** 失败态文案 MUST 不包含原始错误 message、provider 错误、tool input、tool output、trace id 或内部错误码

### Requirement: Agent activity display stabilization is testable without browser automation

系统 SHALL 用自动化测试覆盖 Agent 进度展示仲裁规则，不依赖真实浏览器截图验证。

#### Scenario: 动态 tool 序列测试
- **WHEN** 测试构造包含 `preparing_context`、`analyzing_request`、具体阶段、重复通用阶段、未知阶段和 `writing_reply` 的动态事件序列
- **THEN** 前端展示仲裁结果 MUST 保留具体阶段并避免短时间回退到通用阶段
- **AND** 测试 MUST 覆盖不按固定顺序出现的具体阶段
- **AND** 测试 MUST 覆盖 sequence 倒退不会回滚 UI

#### Scenario: 生命周期清理测试
- **WHEN** 测试模拟 `done`、`error`、abort、timeout、显式清理、会话切换或新建会话
- **THEN** 当前展示活动 MUST 被清空
- **AND** 清理结果 MUST 不受具体阶段最小展示时间影响

#### Scenario: 旧样式位置测试
- **WHEN** 测试读取或渲染聊天页活动条
- **THEN** 测试 MUST 证明活动条位于当前 assistant 气泡内、回答加载态之前
- **AND** 测试 MUST 证明输入框区域不会渲染活动条
- **AND** 测试 MUST 证明活动条不使用调试页 Agent Loop 卡片样式
