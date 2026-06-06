## MODIFIED Requirements

### Requirement: 模型可见合同必须表达 list_recent / read_recent 的规划方式

`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 让模型知道它可以先查询最近事实列表，再决定是否读取事实、查询动作库、澄清或普通回复。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: manifest 说明 list_recent / read_recent 的最小边界
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明 `list_recent` 用于查询当前会话是否存在可引用的用户可见训练方案事实索引
- **AND** 说明 MUST 表达 `list_recent` 不需要 ref，只返回轻量索引，不能直接作为训练结构事实来源
- **AND** 说明 MUST 表达 `read_recent` 只能使用本轮 `list_recent` 返回的 `factRef` / `messageId` 读取具体历史方案
- **AND** 说明 MUST 表达 `read_recent` 成功后会导入 consumable `visible_training_proposal_fact`
- **AND** 说明 MUST 使用中文描述业务含义，`operation`、`list_recent`、`read_recent`、`factRef`、`messageId` 和 `visibleTrainingProposal` 保持英文原样

#### Scenario: examples 使用完整 tool_call action
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** examples MUST 包含完整 `{ type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: ... }`
- **AND** examples MUST 展示 `operation = "list_recent"` 的合法调用
- **AND** read 示例如存在 MUST 使用不可复制为真实 id 的占位说明，表达 ref.value 来自本轮 `list_recent` 返回值
- **AND** examples MUST NOT 暴露容易被照抄成真实引用的占位 `factRef`

#### Scenario: manifest 不重复全局禁止项
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** 该 tool 的 `whenNotToUse` MUST 只保留 ref、operation 和历史事实读取相关边界
- **AND** 不得反复复制“工具不生成最终 `visibleOutputs`、不保存 artifact、不写用户记忆、不得伪造 id、failed result 不能 grounding”等全局 Planner 禁止项
