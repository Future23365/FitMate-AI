## ADDED Requirements

### Requirement: 动作库只读问答必须以可引用事实收口
系统 SHALL 让动作库统计和动作详情问答通过 `answered`、`needs_clarification` 或 `blocked` 等合法 Agent 终止结果收口，并引用本轮已登记的只读 tool result。

#### Scenario: 统计查询成功
- **WHEN** Agent 成功读取动作库统计工具结果
- **THEN** 最终 `AgentExecutionResult` MUST 使用 `status: "answered"`
- **AND** `usedToolResultIds` MUST 引用该统计工具结果
- **AND** Response Writer MUST 输出统计答案而不是训练生成、训练修改或保存结果文案

#### Scenario: 动作详情查询成功
- **WHEN** Agent 成功读取单个动作详情工具结果
- **THEN** 最终 `AgentExecutionResult` MUST 使用 `status: "answered"`
- **AND** `replyContext` MUST 基于该动作详情结果组织用户可见回复
- **AND** `usedToolResultIds` MUST 引用动作详情工具结果

#### Scenario: 动作详情需要澄清
- **WHEN** 名称解析工具返回多个候选且无法唯一确定动作
- **THEN** Agent MUST 返回 `needs_clarification`
- **AND** Response Writer MUST 输出候选确认问题
- **AND** 系统 MUST NOT 将该场景投影为 `model_output_invalid`

#### Scenario: 只读查询失败
- **WHEN** 动作库统计、名称解析或详情读取工具无法完成
- **THEN** Agent MUST 返回可诊断的 `blocked`、`failed` 或 `answered` 说明
- **AND** 用户可见回复 MUST 表达动作库查询未完成或未找到动作
- **AND** 回复 MUST NOT 固定描述为“没有生成或修改训练结果”

### Requirement: LLM 润色不得突破动作库事实边界
系统 SHALL 允许 LLM 对动作详情回答做自然语言润色，但所有具体事实必须可追溯到本轮只读工具结果。

#### Scenario: 润色动作步骤
- **WHEN** Response Writer 或 Agent final result 使用 LLM 组织动作详情回复
- **THEN** 模型输入 MUST 只包含动作详情 tool result 的安全投影和必要上下文
- **AND** 输出中出现的具体步骤、器械、肌群、难度和图片说明 MUST 可映射到 `usedToolResultIds`
- **AND** 系统 MUST NOT 让 LLM 基于常识替换数据库步骤

#### Scenario: 防止推荐卡片误投影
- **WHEN** 最终结果只引用动作统计、名称解析或动作详情工具结果
- **THEN** 聊天 artifact 投影 MUST NOT 生成 `exercise_recommendation`、`workout_routine` 或 `workout_plan` 卡片
- **AND** done metadata MUST 保留本轮 Agent 状态和只读工具诊断

#### Scenario: 黑盒流程验证
- **WHEN** 黑盒 LLM 流程测试覆盖动作库总数和动作详情问答
- **THEN** 测试 MUST 验证 assistant 用户可见文本非空且包含工具事实
- **AND** 测试 MUST 验证没有训练卡片被误推送
- **AND** 测试 MUST 验证失败时不出现训练生成/修改兜底文案
