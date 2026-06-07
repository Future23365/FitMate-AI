## ADDED Requirements

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
