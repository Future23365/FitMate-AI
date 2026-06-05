## MODIFIED Requirements

### Requirement: inspectVisibleTrainingProposals 必须同时支持 list_recent 和 read_recent 操作
系统 SHALL 将现有 `readRecentVisibleTrainingProposal` delete-only 重命名为 `inspectVisibleTrainingProposals`，并删除旧 toolName 注册、manifest、examples、trace/replay fixture 和测试引用，不保留 alias。`inspectVisibleTrainingProposals` SHALL 作为当前生产聊天中可见训练方案事实的只读入口，并通过显式 `operation` 区分 `list_recent` 和 `read_recent`。系统 SHALL NOT 新增独立 `listRecentVisibleTrainingProposals` tool 来承担同类事实查询能力。`read_recent` SHALL 使用统一 `ref` 字段表达要读取的可见事实引用。

#### Scenario: 使用同一个 tool 查询事实列表
- **WHEN** Planner 需要确认当前 actor 和 conversation 是否存在可引用的可见训练方案事实
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "list_recent"` 完成最近事实列表查询
- **AND** 该调用 MUST 不需要 `ref`
- **AND** handler MUST 只查询当前 actor 和当前 conversation 可访问的事实索引

#### Scenario: 使用同一个 tool 读取具体事实
- **WHEN** Planner 需要复用某条可见训练方案事实
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "read_recent"` 完成最近具体事实读取
- **AND** input MUST 提供当前 run 可见的真实 `ref`
- **AND** `ref.type` MUST 表达引用类型，例如 `fact_ref` 或 `message_id`
- **AND** `ref.value` MUST 复制当前 run 可见的真实引用值
- **AND** handler MUST 校验 actor、conversation、status、kind、schemaVersion 和 payload 边界后再返回成功结果

#### Scenario: 禁止隐式操作
- **WHEN** Planner 调用 `inspectVisibleTrainingProposals`
- **AND** input 缺少 `operation`、同时混用 `list_recent` 专用字段和 `read_recent` 专用字段，或使用未知 operation
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** runtime MUST 按结构化非法输入或 repair 边界处理

#### Scenario: 拒绝旧引用字段
- **WHEN** Planner 使用 `operation = "read_recent"`
- **AND** input 传入顶层 `factRef` 或顶层 `messageId`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** repair feedback MUST 说明读取引用统一使用 `ref`
- **AND** repair feedback MUST 给出 `ref.type` 和 `ref.value` 的合法形状
- **AND** 服务端 MUST NOT 静默把顶层 `factRef` 或 `messageId` 转换为 `ref`

### Requirement: read_recent 必须导入当前 run 可消费事实
`inspectVisibleTrainingProposals(operation = "read_recent")` SHALL 读取 `list_recent` 或真实上下文暴露的具体事实，并在成功时把该事实作为当前 run 可消费事实导入。`read_recent` 失败 MUST 结构化归一，不能退化为通用 `handler_error`。

#### Scenario: 成功读取并导入事实
- **WHEN** `read_recent` 收到当前 run 可见的真实 `ref`
- **AND** `ref.type` 和 `ref.value` 指向当前 run 可见的 `factRef`、`messageId` 或当前实现支持的等价引用
- **AND** 当前 actor 有权访问该事实
- **AND** 事实 status、kind、schemaVersion 和 payload 可被当前实现支持
- **THEN** tool MUST 返回 `status = "succeeded"` 和 `operation = "read_recent"`
- **AND** runtime MUST 将该事实登记为当前 run 内可消费的 `visible_training_proposal_fact` resource 或等价可消费事实
- **AND** observation MUST 说明该事实已导入当前 run，后续不要重复读取同一引用

#### Scenario: 拒绝不可访问或无效引用
- **WHEN** `read_recent` 引用不存在、跨用户、跨会话、已归档、状态不可读、schemaVersion 不兼容、payload 无效或引用不唯一
- **THEN** tool MUST 返回结构化失败 output
- **AND** fulfillment MUST 表示 `satisfied = false`
- **AND** runtime MUST NOT 登记 consumable resource
- **AND** 失败结果 MUST NOT 支撑成功训练方案刷新或可见训练方案生成

#### Scenario: fact store 异常结构化归一
- **WHEN** `read_recent` 或 `list_recent` 的事实存储读取抛出异常
- **THEN** tool MUST 捕获异常并返回稳定结构化失败 code
- **AND** trace MUST 记录该结构化失败边界
- **AND** runtime MUST NOT 将其记录为通用 `handler_error`
