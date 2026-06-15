## ADDED Requirements

### Requirement: Dev LLM Blackbox Reviewer Page

项目 SHALL 提供开发态 LLM 黑盒审核页，用于读取基础 LLM 黑盒 JSON fixture、执行单个或全部 flow，并展示每轮真实用户可见结果。该页面 MUST 只在开发态或显式开启开发诊断能力时可访问。

#### Scenario: Reviewer loads JSON fixture

- **WHEN** 开发者打开 `/dev/llm-blackbox`
- **THEN** 页面 MUST 展示 JSON fixture 中的 flow 列表、flow 目标和 turn 数
- **AND** 页面 MUST 显示每个 turn 的 `userInput` 和 `expectedOutput`

#### Scenario: Reviewer is unavailable outside dev diagnostics

- **WHEN** 应用运行在 production 且未显式开启开发诊断能力
- **THEN** `/dev/llm-blackbox` MUST 不向普通用户展示审核页面
- **AND** 相关 fixture / run API MUST 不暴露测试用例或运行结果

### Requirement: Reviewer Can Run Single Or All Flows

开发态审核页 SHALL 支持运行单个 flow 和串行运行全部 flow。runner MUST 按 fixture 中的 `turns[]` 顺序发送用户消息，并等待当前 turn 的 `/api/chat` NDJSON stream 收到 `done` 后再发送下一轮。

#### Scenario: Run selected flow

- **WHEN** 开发者选择某个 flow 并点击运行
- **THEN** runner MUST 创建独立 run 记录
- **AND** runner MUST 按该 flow 的 `turns[]` 顺序发送消息
- **AND** runner MUST 在每个 turn 收到 `done` 后再进入下一 turn

#### Scenario: Run all flows

- **WHEN** 开发者点击运行全部 flow 并确认真实模型调用成本
- **THEN** runner MUST 串行执行 fixture 中全部 flow
- **AND** 每个 flow MUST 使用独立 conversation
- **AND** 一个 flow 的失败 MUST NOT 阻止后续 flow 开始执行

#### Scenario: Stop active run

- **WHEN** 开发者停止当前批次
- **THEN** runner MUST 取消正在进行的请求或在当前 turn 结束后停止队列
- **AND** 未执行的 flow / turn MUST 标记为 skipped 或 cancelled

### Requirement: Reviewer Records User-visible Turn Results

开发态审核页 SHALL 为每个 turn 记录用户可见结果。记录 MUST 包含用户输入、期望输出说明、assistant 用户可见文本、可见训练输出、建议提问、安全错误、事件类型、耗时、conversationId、responseMessageId 和 token / trace 诊断。

#### Scenario: Turn completes with visible answer

- **WHEN** `/api/chat` stream 返回 `done` 且当前 assistant message 存在用户可见回答面
- **THEN** turn execution status MUST 标记为 passed
- **AND** 页面 MUST 展示 assistant 文本、可见训练输出和建议提问

#### Scenario: Turn fails before visible answer

- **WHEN** 请求失败、NDJSON 解析失败、缺少 `done` 或没有任何用户可见回答面
- **THEN** turn execution status MUST 标记为 failed
- **AND** 页面 MUST 展示失败原因
- **AND** 同一 flow 后续依赖该上下文的 turn MUST 标记为 skipped

#### Scenario: Expected output remains review context

- **WHEN** fixture 中提供 `expectedOutput`
- **THEN** 页面 MUST 将其作为人工审核对照展示
- **AND** runner MUST NOT 因为模型回复和 `expectedOutput` 的语义差异自动判定失败

### Requirement: Reviewer Provides Temporary Run Storage And Statistics

开发态审核页 SHALL 暂存当前浏览器会话中的黑盒运行结果，并提供批次级统计。临时结果 MUST 可清空，且 MUST 有容量或数量上限，避免长期累积大段模型输出。

#### Scenario: Run result remains available during browser session

- **WHEN** 一个 flow 或批次执行完成
- **THEN** 页面 MUST 允许开发者重新选择该 run 并查看每个 flow / turn 的结果
- **AND** 刷新页面后 SHOULD 能恢复最近的临时 run 结果，除非开发者已清空结果或浏览器清理 session storage

#### Scenario: Reviewer shows summary statistics

- **WHEN** 页面存在一个或多个 run 结果
- **THEN** 页面 MUST 展示 flow 总数、turn 总数、执行通过数、执行失败数、跳过数、运行耗时和 token 诊断摘要
- **AND** 页面 MUST 区分自动执行状态和人工审核状态

#### Scenario: Reviewer stores manual review verdicts

- **WHEN** 开发者审核某个 flow 或 turn
- **THEN** 页面 MUST 支持记录人工审核状态，例如 unreviewed、accepted、rejected 或 needs_followup
- **AND** 人工审核状态 MUST 独立于自动执行状态保存

### Requirement: Reviewer Stays Decoupled From Homepage Shell

开发态审核页 SHALL 复用稳定的聊天事件解析、消息投影和只读消息展示组件，但 MUST NOT 依赖首页整页、输入框、侧栏、欢迎态、滚动容器、CSS selector 或 DOM 自动点击来运行用例。

#### Scenario: Runner sends messages headlessly

- **WHEN** runner 执行某个 turn
- **THEN** 它 MUST 通过共享 chat client / NDJSON parser 调用真实 `/api/chat`
- **AND** 它 MUST NOT 通过查找首页输入框、点击首页按钮、iframe 内页面或 DOM selector 来发送消息

#### Scenario: Reviewer reuses message rendering only

- **WHEN** 页面展示某轮结果
- **THEN** 它 MUST 复用首页聊天的消息内容、Markdown 和 visible output 渲染组件或等价共享组件
- **AND** 它 MUST NOT 复用首页 header、sidebar、欢迎态、输入框、焦点管理或整页滚动逻辑作为运行依赖

#### Scenario: Homepage layout changes do not break reviewer execution

- **WHEN** 首页调整 shell layout、导航、欢迎态、输入框位置或快捷问题入口
- **THEN** reviewer 的自动发送、等待 `done`、结果记录和统计 MUST 不需要修改
- **AND** 只有共享消息展示合同变化时，首页和 reviewer 才需要一起调整

### Requirement: Reviewer Verification Covers Boundaries

实现该审核页时 SHALL 提供自动化测试和手动验证，证明 JSON fixture、headless runner、消息投影、统计和解耦边界按预期工作。

#### Scenario: Automated tests cover runner state machine

- **WHEN** 实现完成
- **THEN** 自动化测试 MUST 覆盖单 flow、多 flow、失败后跳过、停止运行、统计计算和临时存储恢复

#### Scenario: Automated tests cover shared rendering boundary

- **WHEN** 实现完成
- **THEN** 自动化测试 MUST 证明 reviewer 不导入首页整页 `ChatPage` 作为运行依赖
- **AND** 测试 MUST 覆盖消息展示组件能够渲染 assistant 文本、visible outputs 和 suggested questions

#### Scenario: Browser verification covers dev review page

- **WHEN** 实现完成且本地已有可用 dev server
- **THEN** 验证 MUST 覆盖 `/dev/llm-blackbox` 页面加载、单 flow 运行、全部 flow 队列启动和停止、结果详情查看、统计展示和临时结果清空
- **AND** 如果无法使用真实浏览器验证，最终交付 MUST 说明原因和剩余风险
