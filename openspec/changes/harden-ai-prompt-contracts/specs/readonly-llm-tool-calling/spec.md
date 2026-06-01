## ADDED Requirements

### Requirement: 只读工具决策 prompt 必须携带工具级输入契约
系统 SHALL 在只读 tool decision 模型请求中提供每个可用工具的名称、用途和输入 Schema 摘要，使模型只能选择可校验的只读调用。

#### Scenario: 构造 tool decision 请求
- **WHEN** 系统请求模型选择只读工具
- **THEN** prompt MUST 列出每个可用只读工具的 `toolName`、用途说明和 input schema 摘要
- **AND** prompt MUST 明确每次只能返回一个工具调用或 `finish`
- **AND** prompt MUST NOT 只提供工具名枚举和空 input 示例

#### Scenario: 工具不适合当前问题
- **WHEN** 已有 conversationSummary、resolvedIntent、referenceResolution 或 previousToolCalls 足以回答当前问题
- **THEN** 模型 SHOULD 返回 `finish`
- **AND** 系统 MUST 使用服务端校验后的 finish decision 继续生成回复或回退

### Requirement: 只读工具决策不得扩大动作执行边界
系统 SHALL 保证只读工具决策 prompt 只用于补查上下文，不得让模型通过工具决策改变 resolved intent 的动作触发状态。

#### Scenario: tool decision 结果暗示生成训练
- **WHEN** tool decision 或工具结果暗示应生成动作推荐、routine、plan、patch 或其他写操作
- **THEN** 系统 MUST 忽略该触发意图
- **AND** 系统 MUST 继续以最终 resolved intent 和服务端 action gate 为准
- **AND** Trace MUST 记录只读工具没有改变动作触发状态
