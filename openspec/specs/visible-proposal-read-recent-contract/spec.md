# visible-proposal-read-recent-contract Specification

## Purpose
TBD - created by archiving change harden-visible-proposal-read-recent-contract. Update Purpose after archive.
## Requirements
### Requirement: read_recent 输入合同必须在模型可见 schema 中表达真实引用必填
系统 SHALL 确保 `inspectVisibleTrainingProposals(operation = "read_recent")` 的模型可见 input JSON Schema 与 runtime Zod 合同一致表达：调用时必须提供当前 run 可见的真实 `factRef` 或 `messageId`，至少一个字段必填。系统 MUST NOT 只依赖无法稳定导出到 JSON Schema 的 refinement 表达该执行边界。

#### Scenario: read_recent schema 暴露 factRef 分支
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `inputJsonSchema` MUST 包含 `operation = "read_recent"` 且 `factRef` 为 required 的合法分支
- **AND** 该分支 MUST 允许 `messageId` 作为可选辅助引用
- **AND** 字段说明 MUST 使用中文解释 `factRef` 只能从当前 run 可见事实索引或 metadata 中复制真实值

#### Scenario: read_recent schema 暴露 messageId 分支
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `inputJsonSchema` MUST 包含 `operation = "read_recent"` 且 `messageId` 为 required 的合法分支
- **AND** 该分支 MUST 允许 `factRef` 作为可选辅助引用
- **AND** 字段说明 MUST 使用中文解释 `messageId` 只能从当前 run 可见事实索引或 metadata 中复制真实值

#### Scenario: 缺少引用的 read_recent 在执行前被拒绝
- **WHEN** Planner 返回 `inspectVisibleTrainingProposals` tool call
- **AND** input 只有 `operation = "read_recent"`，没有 `factRef` 或 `messageId`
- **THEN** Action Validator MUST 在 handler 执行前拒绝该 action
- **AND** 拒绝 code MUST 为 `invalid_tool_input`
- **AND** runtime MUST NOT 读取 fact store 或登记 consumable resource

### Requirement: read_recent 模型可见示例必须严格匹配 runtime 合同
系统 SHALL 确保 `inspectVisibleTrainingProposals` 的 production manifest examples 不包含会被当前 runtime 拒绝的 input。`read_recent` 的引用来源关系 SHALL 通过中文说明、schema description 或 repair feedback 表达，不能通过无效 input 示例表达。

#### Scenario: examples 不包含无引用 read_recent
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** examples MUST NOT 包含 `{ "operation": "read_recent" }`
- **AND** examples MUST NOT 包含可被模型照抄的占位 `factRef` 或 `messageId`
- **AND** examples MUST 至少包含合法 `list_recent` input

#### Scenario: manifest 说明 read_recent 引用来源
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、`whenNotToUse` 或 schema description MUST 说明 `read_recent` 只能读取当前 run 可见的真实 `factRef` / `messageId`
- **AND** 说明 MUST 表达没有真实引用时应先使用 `list_recent`、澄清或普通收口
- **AND** 说明 MUST NOT 要求服务端根据用户自然语言短语替模型选择引用

### Requirement: read_recent repair feedback 必须指出缺失引用的恢复方式
系统 SHALL 在 `inspectVisibleTrainingProposals(operation = "read_recent")` 因缺少 `factRef` / `messageId` 被拒绝时，向下一轮 Planner 暴露安全的字段级 repair feedback。feedback MUST 只包含可恢复结构原因，不得泄漏完整 payload、数据库内容、secret 或 handler 内部对象。

#### Scenario: invalid_tool_input observation 包含字段级原因
- **WHEN** Planner 返回缺少引用的 `read_recent` input
- **AND** Action Validator 返回 `invalid_tool_input`
- **THEN** 下一轮模型可见 observation MUST 包含 `factRef` / `messageId` 至少一个缺失的中文说明
- **AND** observation MUST 包含可恢复建议，提示从当前 run 可见的 `recentVisibleTrainingProposals`、`list_recent` result 或 diagnostic index resource 复制真实引用
- **AND** observation MUST NOT 伪造或补入具体引用值

#### Scenario: 等价缺失输入得到同类反馈
- **WHEN** Planner 返回 `read_recent` 缺 `factRef` 的输入
- **OR** Planner 返回 `read_recent` 缺 `messageId` 的输入
- **OR** Planner 返回 `read_recent` 同时缺两个引用字段的输入
- **THEN** 系统 MUST 以同一类 `invalid_tool_input` repair feedback 收口
- **AND** 系统 MUST 允许模型在剩余 repair budget 内提交合法 `read_recent`、`list_recent`、`ask_user` 或 `final_answer`

### Requirement: read_recent 成功 observation 必须表达正向可消费事实和覆盖边界
`inspectVisibleTrainingProposals(operation = "read_recent")` 成功后，模型可见 observation SHALL 表达导入的 `visible_training_proposal_fact` 是当前 run 的可消费训练事实来源。Observation MUST 同时表达可正向复用的动作事实、section coverage、`schedule` 是否存在等确定性事实和不可支撑边界；MUST NOT 输出业务 output kind 可行性、下一步 action 建议或固定 tool flow。

#### Scenario: read_recent 投影可复用动作事实
- **WHEN** `read_recent` 成功读取并导入 `visible_training_proposal_fact`
- **THEN** model observation MUST 包含可复用动作项的 `exerciseId`、`section`、`order` 和可安全展示的有限摘要
- **AND** 有限摘要 SHOULD 包含动作名称、主要肌群、器械和 `allowedSections`
- **AND** model observation MUST NOT 暴露完整数据库对象、完整历史 payload、secret 或跨用户 payload

#### Scenario: read_recent 投影 section coverage
- **WHEN** `read_recent` 成功读取并导入 `visible_training_proposal_fact`
- **THEN** model observation MUST 表达 `availableSections`
- **AND** model observation MUST 表达 `sectionSummary`
- **AND** 若资源缺少 `warmup` 或 `stretch`，model observation MUST 表达缺少这些 section 的确定性事实
- **AND** model observation MUST NOT 把 section coverage 派生成 `supportsOutputKinds`

#### Scenario: read_recent 投影 schedule 事实
- **WHEN** `read_recent` 成功读取并导入包含或不包含 `schedule` 的 `visible_training_proposal_fact`
- **THEN** model observation MAY 表达 `schedule` 的安全摘要或 `hasSchedule`
- **AND** model observation MUST NOT 因存在 `schedule` 而输出 `supportsOutputKinds: ["plan"]`
- **AND** model observation MUST NOT 因缺少 `schedule` 而输出 `supportsOutputKinds` 排除 `plan`

#### Scenario: read_recent 不把历史事实当成已生成新方案
- **WHEN** `read_recent` 成功导入历史可见事实
- **THEN** model observation MUST 表达该 tool 只读取并导入事实，不生成新的 `visibleTrainingProposal`
- **AND** 需要推送新方案时最终结构 MUST 仍由 `final_answer.visibleOutputs[]` 承载
- **AND** observation MUST NOT 要求固定调用 `searchExerciseResources` 或固定输出某个 `payload.kind`

#### Scenario: read_recent 不提供下一步 action hints
- **WHEN** `read_recent` observation 暴露给 Planner
- **THEN** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 包含 `final_answer_with_visible_outputs`
- **AND** observation MUST NOT 包含 `continue_tool_call`
- **AND** observation MUST NOT 替 Planner 判断当前请求应保留、派生、调整、替换还是重新生成

### Requirement: read_recent observation 必须区分保留、排除和替换边界
`read_recent` 的模型可见说明 SHALL 表达导入事实可以用于保留、复用、派生、调整、排除或替换，但这些操作由 Planner 基于用户目标和可见事实自主判断。系统 MUST NOT 将导入事实默认转换为排除列表。

#### Scenario: 导入事实默认是可消费来源
- **WHEN** `read_recent` 成功导入事实
- **THEN** model observation MUST 表达导入动作可作为正向事实来源
- **AND** model observation MUST 表达只有替换、排除或避免重复目标才适合把这些动作作为负向排除约束
- **AND** model observation MUST NOT 表达成导入后默认调用带 `excludeExerciseIds` 的动作查询

#### Scenario: read_recent 不做语义判断
- **WHEN** `read_recent` observation 暴露给 Planner
- **THEN** observation MUST NOT 包含固定用户短语作为使用条件
- **AND** observation MUST NOT 包含答案模板
- **AND** observation MUST NOT 替 Planner 判断当前请求是保留、派生、调整还是替换

### Requirement: read_recent 必须只接受本轮索引暴露的引用
系统 SHALL 将 `inspectVisibleTrainingProposals(operation = "read_recent")` 的引用可见性限制为当前 run 中由 `list_recent` 产生的 tool result 或 `visible_training_proposal_fact_index` diagnostic resource。`read_recent` MUST NOT 从 `run.metadata.recentVisibleTrainingProposals`、历史 assistant 消息、示例、trace 摘要或业务存储 id 推断引用可见。

#### Scenario: metadata-only 引用被拒绝
- **WHEN** `run.metadata.recentVisibleTrainingProposals` 中存在最近可见训练方案状态摘要
- **AND** Planner 直接调用 `inspectVisibleTrainingProposals(operation = "read_recent")`
- **AND** 当前 run 尚未通过 `list_recent` 产生包含该引用的 diagnostic index resource
- **THEN** tool MUST 返回 `status = "failed"` 和 `code = "fact_reference_not_visible_in_run"`
- **AND** fulfillment MUST 表示 `satisfied = false`
- **AND** handler MUST NOT 读取 fact store
- **AND** runtime MUST NOT 登记 `visible_training_proposal_fact` consumable resource

#### Scenario: list_recent 后允许 read_recent
- **WHEN** Planner 先调用 `inspectVisibleTrainingProposals(operation = "list_recent")`
- **AND** list result 或 diagnostic index resource 中包含真实 `factRef` 或 `messageId`
- **AND** Planner 随后把该值复制到 `read_recent.ref.value`
- **THEN** `read_recent` MAY 读取该事实
- **AND** 成功时 MUST 将 `visible_training_proposal_fact` 登记为当前 run 的 consumable resource

### Requirement: read_recent 模型可见示例不得包含 fake 引用值
`inspectVisibleTrainingProposals` 的 production manifest examples SHALL NOT 包含可被模型照抄的 fake `factRef`、fake `messageId` 或 fake `read_recent.ref.value`。引用关系 SHALL 通过 schema description、whenToUse、whenNotToUse 和 observations 表达。

#### Scenario: examples 只展示安全 list_recent
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** examples MUST 包含合法 `operation = "list_recent"` 示例
- **AND** examples MUST NOT 包含 `operation = "read_recent"` 且带占位引用值的示例
- **AND** examples MUST NOT 包含 `fact-1`、`fact_recent_visible_training_01` 或等价占位业务引用

