## ADDED Requirements

### Requirement: Terminal failure finalizer 配置必须集中管理

系统 SHALL 在 `lib/server/config/` 下集中定义 terminal failure finalizer 的行为预算和默认值。production `/api/chat` adapter、finalizer service 和 model adapter MUST 从该配置读取默认值，MUST NOT 在业务模块局部散落额外模型调用预算。

#### Scenario: finalizer 预算来自集中配置

- **WHEN** production adapter 判断是否调用 terminal failure finalizer
- **THEN** `enabled`、`maxCallsPerRun`、`timeoutMs`、`maxTokens`、`temperature` 和 `maxSuggestedQuestions` MUST 来自集中配置
- **AND** production adapter MUST NOT 内联这些预算数字
- **AND** `maxCallsPerRun` MUST 默认为 1 或等价单次限制

#### Scenario: 配置有中文意图注释

- **WHEN** 开发者打开 finalizer 配置文件
- **THEN** 导出的 finalizer 配置对象 MUST 有中文意图注释
- **AND** 每个核心配置项 MUST 说明它影响失败收口成本、延迟、输出长度或用户体验
- **AND** 注释 MUST 不只重复变量名本身

### Requirement: finalizer 配置不得改变主 Agent runtime budget

系统 SHALL 将 terminal failure finalizer 的预算与主 Agent runtime budget 分离。新增 finalizer 配置 MUST NOT 改变主 Agent 的 `maxRepairAttempts`、`maxPlannerCalls`、`maxSteps`、`maxToolCalls` 或 tool timeout 语义。

#### Scenario: 主 Agent repair budget 不被调大

- **WHEN** 实现 terminal failure finalizer
- **THEN** 主 Agent 的 repair budget MUST 继续由原 runtime 配置控制
- **AND** finalizer 调用 MUST 不计入主 Agent repair 成功
- **AND** finalizer 调用 MUST 不允许主 Agent 再执行新的 planner 或 tool step

#### Scenario: route 不按用户原文选择 finalizer 配置

- **WHEN** 用户发送聊天消息
- **THEN** `/api/chat` MUST NOT 基于用户原文关键词、正则、同义词表、短句模板或 phrasing 动态选择 finalizer token、timeout、启用状态或调用次数
- **AND** 是否启用 finalizer MUST 基于集中配置和确定性失败事实

### Requirement: provider availability gate 必须有可测试配置边界

系统 SHALL 提供可测试的 provider availability gate，确保 provider 不可用时不会再触发 finalizer 调用。该 gate MUST 能消费模型配置状态、adapter diagnostics、HTTP status 分类、timeout 和当前请求剩余时间等确定性事实。

#### Scenario: provider 不可用阻止 finalizer

- **WHEN** provider availability gate 接收到 quota、rate limit、auth failure、HTTP failure、network failure、adapter exception、模型请求 timeout 或配置缺失证据
- **THEN** gate MUST 返回 finalizer 不可调用
- **AND** production adapter MUST 使用确定性 fallback
- **AND** 测试 MUST 能断言 finalizer service 未被调用

#### Scenario: 内部校验失败允许 finalizer

- **WHEN** 主 Agent failure 来自内部 terminal validation 或 repair exhausted
- **AND** provider availability gate 没有发现模型不可用证据
- **THEN** gate MUST 允许 production adapter 调用 finalizer
- **AND** 该允许结果 MUST 不代表主 Agent 可以继续 repair
