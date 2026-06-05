## ADDED Requirements

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
