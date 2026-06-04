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

