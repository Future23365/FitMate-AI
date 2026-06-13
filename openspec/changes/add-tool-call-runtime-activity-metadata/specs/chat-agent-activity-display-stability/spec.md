## ADDED Requirements

### Requirement: 活动条必须区分文案变化和 Loop 前缀变化
聊天页 SHALL 将 `agent_loop` 造成的 `#N` 前缀变化与右侧活动文案变化建模为两个独立 UI 更新。当前缀变化但活动文案未变化时，活动条 MUST 更新前缀；但右侧文案 MUST NOT 重新触发滚动、替换动画或重复可访问性播报。

#### Scenario: 仅 Loop 更新不重新滚动相同文案
- **WHEN** 当前活动条展示 `#1 正在查询动作库...`
- **AND** 前端收到合法 `agent_loop` 事件，`loopTurn=2`
- **AND** 当前右侧活动文案仍为 `正在查询动作库...`
- **THEN** 活动条 MUST 更新为 `#2 正在查询动作库...`
- **AND** 右侧活动文案 MUST NOT 重新触发滚动、逐字替换、fade-in 或等价“新文案”动画
- **AND** `aria-live` 或等价可访问性状态 MUST NOT 仅因前缀变化而把同一活动文案当作新摘要重复播报

#### Scenario: 新 activitySummary 仍然更新文案
- **WHEN** 当前活动条展示 `#2 正在查询动作库...`
- **AND** 前端收到合法 `agent_progress.activitySummary = "正在整理可用动作候选"`
- **THEN** 活动条 MUST 保持当前合法 `#N` 前缀
- **AND** 右侧文案 MUST 更新为 `正在整理可用动作候选`
- **AND** 文案变化 MAY 触发当前设计允许的短动画或可访问性提示

#### Scenario: 重复 fallback 文案不制造滚动刷屏
- **WHEN** 前端连续收到多个 `agent_progress` 事件
- **AND** 这些事件都只能降级到相同 fallback 文案
- **THEN** 活动条 MAY 保持当前 fallback 文案
- **AND** 活动条 MUST NOT 因 sequence、stage fallback 或 loop 前缀变化而重复滚动同一右侧文案
- **AND** 该保护 MUST NOT 阻止后续不同合法 `activitySummary` 覆盖当前 fallback 文案

#### Scenario: 测试覆盖前缀和文案动画状态
- **WHEN** 自动化测试构造 `agent_loop` 递增、重复 `agent_progress.activitySummary`、fallback 重复和新摘要到达的事件序列
- **THEN** 测试 MUST 分别断言 `loopTurn`、右侧文案、文案动画触发状态和生命周期清理结果
- **AND** 测试 MUST 证明相同文案不会仅因 `agent_loop` 递增而重复滚动
- **AND** 测试 MUST 证明新合法摘要仍可更新右侧文案
