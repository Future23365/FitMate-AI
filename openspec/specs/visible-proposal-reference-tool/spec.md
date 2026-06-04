# visible-proposal-reference-tool Specification

## Purpose
TBD - created by archiving change extend-visible-proposal-reference-tool. Update Purpose after archive.
## Requirements
### Requirement: inspectVisibleTrainingProposals 必须同时支持 list_recent 和 read_recent 操作
系统 SHALL 将现有 `readRecentVisibleTrainingProposal` delete-only 重命名为 `inspectVisibleTrainingProposals`，并删除旧 toolName 注册、manifest、examples、trace/replay fixture 和测试引用，不保留 alias。`inspectVisibleTrainingProposals` SHALL 作为当前生产聊天中可见训练方案事实的只读入口，并通过显式 `operation` 区分 `list_recent` 和 `read_recent`。系统 SHALL NOT 新增独立 `listRecentVisibleTrainingProposals` tool 来承担同类事实查询能力。

#### Scenario: 使用同一个 tool 查询事实列表
- **WHEN** Planner 需要确认当前 actor 和 conversation 是否存在可引用的可见训练方案事实
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "list_recent"` 完成最近事实列表查询
- **AND** 该调用 MUST 不需要 `factRef` 或 `messageId`
- **AND** handler MUST 只查询当前 actor 和当前 conversation 可访问的事实索引

#### Scenario: 使用同一个 tool 读取具体事实
- **WHEN** Planner 需要复用某条可见训练方案事实
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "read_recent"` 完成最近具体事实读取
- **AND** input MUST 提供当前 run 可见的真实 `factRef` 或 `messageId`
- **AND** handler MUST 校验 actor、conversation、status、kind、schemaVersion 和 payload 边界后再返回成功结果

#### Scenario: 禁止隐式操作
- **WHEN** Planner 调用 `inspectVisibleTrainingProposals`
- **AND** input 缺少 `operation`、同时混用 `list_recent` 专用字段和 `read_recent` 专用字段，或使用未知 operation
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** runtime MUST 按结构化非法输入或 repair 边界处理

### Requirement: list_recent 必须只返回轻量事实索引
`inspectVisibleTrainingProposals(operation = "list_recent")` SHALL 返回当前可引用 `visibleTrainingProposal` 的轻量索引。`list_recent` MUST NOT 返回完整训练方案 payload，也 MUST NOT 产出当前 run 的 consumable resource。

#### Scenario: 返回最近可见训练方案索引
- **WHEN** `list_recent` 查询到当前 actor 和 conversation 可访问的事实
- **THEN** output MUST 使用 `status = "succeeded"` 和 `operation = "list_recent"`
- **AND** output MUST 包含 `facts[]`
- **AND** 每个 fact 摘要 MUST 至少包含 `factRef`、`messageId`、`proposalKind`、`status`、`visibleOutputSchemaVersion`、`factSchemaVersion`、section 摘要和可复用训练动作数量
- **AND** 如 output 包含 `reusableTrainingExercises[]`，字段范围 MUST 限制为 `exerciseId`、`order`、可展示名称和 section 摘要

#### Scenario: list_recent 不泄漏完整事实
- **WHEN** `list_recent` 返回 fact 摘要
- **THEN** output MUST NOT 包含完整 `visibleTrainingProposal.payload`
- **AND** output MUST NOT 包含完整 `prescription`、完整 `schedule`、完整 handler output、未进入用户可见方案的 tool 候选或跨用户数据
- **AND** output MUST NOT 暴露可被模型直接复制为新训练方案的完整动作事实

#### Scenario: list_recent 空结果
- **WHEN** 当前 actor 和 conversation 没有可访问的可见训练方案事实
- **THEN** `list_recent` MUST 返回 `status = "succeeded"`、`operation = "list_recent"` 和空 `facts[]`
- **AND** fulfillment MUST 表示本次事实状态查询已完成
- **AND** 该结果 MUST 能作为模型解释当前没有可引用方案或向用户澄清的事实依据
- **AND** 该结果 MUST NOT 支撑成功训练方案生成

### Requirement: read_recent 必须导入当前 run 可消费事实
`inspectVisibleTrainingProposals(operation = "read_recent")` SHALL 读取 `list_recent` 或真实上下文暴露的具体事实，并在成功时把该事实作为当前 run 可消费事实导入。`read_recent` 失败 MUST 结构化归一，不能退化为通用 `handler_error`。

#### Scenario: 成功读取并导入事实
- **WHEN** `read_recent` 收到当前 run 可见的真实 `factRef` 或 `messageId`
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

### Requirement: 模型可见合同必须表达 list_recent / read_recent 的规划方式
`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 让模型知道它可以先查询最近事实列表，再决定是否读取事实、查询动作库、澄清或普通回复。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: manifest 说明 list_recent 使用场景
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明 `list_recent` 用于查询当前会话是否存在可引用的用户可见训练方案事实
- **AND** 说明 MUST 表达 `list_recent` 只返回事实索引，不导入完整事实
- **AND** 说明 MUST 使用中文描述业务含义，`operation`、`list_recent`、`read_recent`、`factRef`、`messageId` 和 `visibleTrainingProposal` 保持英文原样

#### Scenario: manifest 说明 read_recent 使用场景
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** 模型可见说明 MUST 表达 `read_recent` 只用于读取 `list_recent` 或真实上下文中出现的具体 `factRef` / `messageId`
- **AND** examples MUST NOT 暴露容易被照抄成真实引用的占位 `factRef`
- **AND** examples MUST 先展示 `operation = "list_recent"`，再展示从 `list_recent` result 复制真实引用进行 `operation = "read_recent"` 的关系

#### Scenario: 不写固定短语路由
- **WHEN** 模型可见说明描述刷新、省略表达、指代不明或上下文引用场景
- **THEN** 说明 MUST 表达“由模型基于上下文和 tool result 自主判断”
- **AND** 说明 MUST NOT 表达成用户说出“换一批”“再来一组”“不要这个”或其他固定短语时必须调用某个 tool
- **AND** 服务端 MUST NOT 根据这些短语选择 `list_recent`、`read_recent` 或 `searchExerciseResources`

### Requirement: inspectVisibleTrainingProposals 必须具备自动化验证
系统 SHALL 为扩展后的 `inspectVisibleTrainingProposals` 提供 tool-level、manifest、production chat 和 architecture boundary 验证。

#### Scenario: Tool 单测覆盖 list_recent / read_recent
- **WHEN** 实现扩展后的 `inspectVisibleTrainingProposals`
- **THEN** tool-level tests MUST 直接覆盖 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** tests MUST 覆盖 `list_recent` 成功、`list_recent` 空结果、`list_recent` 权限隔离、`read_recent` 成功、`read_recent` 无效引用、`read_recent` 跨用户、`read_recent` 跨会话、schemaVersion 不兼容、payload 无效和 store 异常结构化归一
- **AND** tests MUST 证明 `list_recent` 不产出 consumable resource，`read_recent` 成功才产出可消费事实

#### Scenario: 模型可见合同测试
- **WHEN** production registry 序列化 tool manifest
- **THEN** tests MUST 断言 manifest 包含 `inspectVisibleTrainingProposals`、`operation = "list_recent"` 和 `operation = "read_recent"` 的中文说明
- **AND** tests MUST 断言 manifest 不包含旧 `readRecentVisibleTrainingProposal`
- **AND** tests MUST 断言 manifest 不包含可直接复制的占位 `factRef`
- **AND** tests MUST 断言 manifest 不把固定自然语言短语表达成强制 tool 调用条件

#### Scenario: 生产聊天回归覆盖同类省略表达
- **WHEN** production chat replay 测试覆盖省略、指代或上下文断裂表达
- **THEN** tests MUST 至少包含原始失败表达和一个等价语义变体
- **AND** tests MUST 覆盖无可见训练方案时模型可以 `list_recent` 后合法收口
- **AND** tests MUST 覆盖有可见训练方案时模型可以 `list_recent` / `read_recent` 后再选择是否调用 `searchExerciseResources`
- **AND** tests MUST 证明 `/api/chat` 没有基于用户原文新增服务端语义分流

