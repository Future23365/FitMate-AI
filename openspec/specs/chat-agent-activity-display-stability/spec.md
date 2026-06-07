# chat-agent-activity-display-stability Specification

## Purpose
TBD - created by archiving change stabilize-agent-activity-display. Update Purpose after archive.
## Requirements
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

### Requirement: Activity 展示仲裁不得改变 Agent Loop 轮次

聊天页 SHALL 将 Activity 展示稳定性规则限制在右侧中文文案、图标和状态上。具体阶段优先、通用阶段冷却、未知阶段兜底、sequence 倒退保护等规则 MUST NOT 修改、递增、回滚或推断 Agent Loop 轮次。

#### Scenario: 具体阶段保护只影响文案
- **WHEN** 前端已经展示具体 Activity 阶段，例如 `querying_exercises`
- **AND** 短时间内收到通用 Activity 阶段，例如 `analyzing_request`
- **THEN** 展示仲裁 MAY 保留具体阶段中文文案
- **AND** 展示仲裁 MUST NOT 修改当前 `loopTurn`
- **AND** 展示仲裁 MUST NOT 用通用阶段事件数量推断新的 Loop 轮次

#### Scenario: sequence 倒退不回滚 Loop 轮次
- **WHEN** 前端收到 sequence 小于当前已处理 Activity sequence 的过期 Activity 事件
- **THEN** 该 Activity 事件 MUST NOT 覆盖当前中文文案
- **AND** 该 Activity 事件 MUST NOT 回滚或清空当前 `loopTurn`
- **AND** `loopTurn` 的顺序保护 MUST 基于合法 Loop 事件自身，而不是 Activity sequence 变化次数

#### Scenario: 重复 Activity 阶段不阻止 Loop 前缀更新
- **WHEN** 当前活动条展示 `#1 正在查询动作库...`
- **AND** 前端随后收到合法 Loop 事件，`loopTurn=2`
- **AND** Activity 阶段仍保持 `querying_exercises`
- **THEN** 活动条 MUST 更新为 `#2 正在查询动作库...`
- **AND** 具体阶段保护规则 MUST NOT 因文案未变化而阻止 `#N` 更新

#### Scenario: content 到达不递增 Loop 轮次
- **WHEN** stream 收到用户可见 `content` 事件
- **THEN** 前端 MAY 将 Activity 文案更新为 `writing_reply` 或等价整理回复阶段
- **AND** 该更新 MUST NOT 递增、重置或推断 `loopTurn`
- **AND** 前端 MUST NOT 从 `content` 文本中解析训练业务阶段或 Loop 轮次

#### Scenario: 稳定性测试覆盖两个独立状态
- **WHEN** 自动化测试构造包含 Loop 事件、重复 Activity 事件、通用阶段、具体阶段、过期 Activity 事件和 content 事件的动态序列
- **THEN** 测试 MUST 分别断言 `loopTurn` 和 Activity 文案的最终状态
- **AND** 测试 MUST 证明 Activity 仲裁变化不会改变 `loopTurn`
- **AND** 测试 MUST 证明新的合法 Loop 事件即使 Activity 文案重复也会更新 `#N`

### Requirement: Activity 摘要展示仲裁不得改变 Loop 轮次
聊天页 SHALL 将 `activitySummary` 展示仲裁限制在右侧用户可见文案上。摘要的出现、缺失、延迟、忽略或 fallback MUST NOT 修改、递增、回滚或推断 `loopTurn`。

#### Scenario: 摘要更新只影响文案
- **WHEN** 前端已经展示合法 `loopTurn`
- **AND** 随后收到包含安全 `activitySummary` 的 `agent_progress` 事件
- **THEN** 活动条 MAY 更新右侧文案为该摘要
- **AND** 活动条 MUST 保持当前 `#N` 前缀不变
- **AND** 前端 MUST NOT 根据摘要事件数量推断新的 loop 轮次

#### Scenario: 重复摘要不阻止新 Loop 前缀
- **WHEN** 当前活动条展示 `#1 需要查询动作库`
- **AND** 前端随后收到合法 `agent_loop` 事件，`loopTurn=2`
- **AND** 当前 Activity 文案仍是 `需要查询动作库`
- **THEN** 活动条 MUST 更新为 `#2 需要查询动作库`
- **AND** 展示仲裁 MUST NOT 因摘要文案重复而忽略新的合法 loop 事件

#### Scenario: 非安全摘要不覆盖具体阶段
- **WHEN** 前端已经展示具体 stage 文案或安全 `activitySummary`
- **AND** 随后收到不安全、过期或未知来源的摘要字段
- **THEN** 展示仲裁 MUST 忽略该摘要
- **AND** 如果当前文案仍有效，活动条 SHOULD 保持当前文案
- **AND** 展示仲裁 MUST NOT 清空或回滚 `loopTurn`

### Requirement: Activity 摘要必须服从现有生命周期清理
聊天页 SHALL 将 `activitySummary` 作为当前请求内临时活动状态处理。现有请求结束、取消、失败和会话切换清理规则 MUST 同时清理摘要、stage、pending state 和 loop 轮次。

#### Scenario: 请求结束立即清理摘要
- **WHEN** stream 收到 `done`、`error`，请求 abort、timeout、会话切换或新建会话
- **THEN** 当前 `activitySummary` MUST 立即清空
- **AND** 最小展示时间、pending 摘要、具体阶段保护和动画状态 MUST NOT 延迟清理
- **AND** 活动条 MUST 不再展示旧摘要

#### Scenario: content 到达后不从正文提取摘要
- **WHEN** stream 收到用户可见 `content` 事件
- **THEN** 前端 MAY 按现有规则将 Activity 文案更新为 `writing_reply` 或等价整理回复阶段
- **AND** 前端 MUST NOT 从 `content` 文本解析、生成或覆盖 `activitySummary`
- **AND** 该更新 MUST NOT 递增、重置或推断 `loopTurn`

#### Scenario: 稳定性测试覆盖摘要与 fallback
- **WHEN** 自动化测试构造包含 `agent_loop`、带摘要的 `agent_progress`、不安全摘要、重复摘要、stage fallback、过期 sequence 和 `content` 的动态序列
- **THEN** 测试 MUST 分别断言 `loopTurn`、当前展示文案、fallback 文案和清理结果
- **AND** 测试 MUST 证明摘要仲裁不会改变 `loopTurn`
- **AND** 测试 MUST 证明非法摘要不会进入 `ChatMessage` 或历史保存 payload

