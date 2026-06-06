## ADDED Requirements

### Requirement: `inspectVisibleTrainingProposals` 模型可见说明必须聚焦引用事实边界
系统 SHALL 将 `inspectVisibleTrainingProposals` 的模型可见说明收敛为当前会话可见训练方案事实的只读引用工具说明。Manifest MUST 聚焦 `list_recent` / `read_recent` 的 operation、引用来源、resource role 和导入事实边界；MUST NOT 重复完整通用 final answer 终态规则。

#### Scenario: manifest 保留 list_recent / read_recent 独有边界
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** manifest MUST 表达 `operation = "list_recent"` 只返回轻量事实索引
- **AND** manifest MUST 表达 `operation = "read_recent"` 只能读取本轮可见真实 `ref`
- **AND** manifest MUST 表达 `read_recent` 成功后导入当前 run 的 consumable `visible_training_proposal_fact`
- **AND** manifest MUST 表达导入事实不代表本轮最终训练结构已经生成、渲染或保存
- **AND** manifest MUST 使用中文描述业务含义，`inspectVisibleTrainingProposals`、`operation`、`list_recent`、`read_recent`、`ref`、`factRef`、`messageId`、`visibleTrainingProposal` 保持英文原样

#### Scenario: manifest 不重复通用终态长规则
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** manifest MUST NOT 逐段重复 system prompt 中关于 `final_answer.content` 不触发后续自动 tool 调用的完整说明
- **AND** manifest MUST NOT 逐段重复 system prompt 中关于 `visibleOutputs[]`、`usedRefs`、resource id 和 terminal validator 的完整通用规则
- **AND** manifest MUST 用短边界表达“本 tool 只读取事实，不生成最终训练结构”

#### Scenario: examples 避免 fake 引用
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` examples
- **THEN** examples MUST 保留 `operation = "list_recent"` 的合法输入示例
- **AND** examples MUST NOT 包含可被照抄的 fake `factRef`
- **AND** examples MUST NOT 包含可被照抄的 fake `messageId`
- **AND** examples MUST NOT 暗示模型可以从 metadata、历史 assistant 消息或 trace 摘要猜测 `ref.value`

### Requirement: `inspectVisibleTrainingProposals` observation 必须保留真实引用事实并压缩重复说明
系统 SHALL 在 `inspectVisibleTrainingProposals` 的模型 observation 中保留真实 tool result 才能确定的引用状态。Observation MUST 表达 `facts[]` 空结果、`read_recent` 导入状态和 resource consumption boundary；MUST NOT 复制完整 system prompt 或 manifest 长段。

#### Scenario: list_recent observation 保留索引事实
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达 `facts[]` 是当前 actor 和 conversation 可见、可引用的事实索引集合
- **AND** model observation MUST 表达空 `facts[]` 只表示当前可见事实中没有这类引用对象
- **AND** model observation MUST 表达 `facts[].factRef` / `facts[].messageId` 只可作为本轮 `read_recent.ref.value`
- **AND** model observation MUST 表达 `list_recent` 不能作为完整训练方案事实源
- **AND** model observation MUST NOT 提供固定答案模板或固定 tool 调用顺序

#### Scenario: read_recent observation 保留导入事实状态
- **WHEN** `inspectVisibleTrainingProposals(operation = "read_recent")` 成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达该事实已导入当前 run
- **AND** model observation MUST 表达导入 resource 的 `resourceType` 和 `role`
- **AND** model observation MUST 表达 `factRef` / `messageId` 不是 `final_answer.usedRefs.resource.id`
- **AND** model observation MUST 表达该事实可作为 reuse、derive、modify 的正向来源
- **AND** model observation MUST 表达是否转成 `excludeExerciseIds` 由 Planner 基于用户目标判断

#### Scenario: observation 不重复通用终态长规则
- **WHEN** `inspectVisibleTrainingProposals` observation 暴露给 Planner
- **THEN** observation MUST NOT 复制 system prompt 中完整 `AgentAction` 输出格式说明
- **AND** observation MUST NOT 复制完整 `visibleTrainingProposal.payload.kind` 选择指南
- **AND** observation MUST NOT 把某个用户短语、空结果或字段组合写成固定 answer、固定 `payload.kind` 或固定 tool flow
