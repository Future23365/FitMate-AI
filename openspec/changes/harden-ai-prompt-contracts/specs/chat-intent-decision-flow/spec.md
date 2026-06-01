## ADDED Requirements

### Requirement: resolved intent 必须成为模型意图输出的主契约
系统 SHALL 让聊天意图模型以 resolved intent 作为主输出契约；旧版 intent 字段继续存在时，MUST 由 resolved intent 派生，不得成为独立语义决策来源。

#### Scenario: 模型返回 resolved intent
- **WHEN** `/api/chat` 请求聊天意图模型解析用户输入
- **THEN** 模型输出 MUST 以 `action.kind`、`action.shouldTrigger`、`responseMode`、`fieldSources`、`referenceRequirement` 和 `workoutIntent` 表达本轮执行决策
- **AND** 服务端 MUST 从该结果派生兼容字段 `type`、`canTriggerAction`、`missingActionFields` 和 `suggestedReplies`
- **AND** 服务端 MUST NOT 让旧字段覆盖 resolved intent 的动作类型

#### Scenario: 旧字段与 resolved intent 冲突
- **WHEN** 模型输出的旧字段与 resolved intent 表达不同动作类型或触发状态
- **THEN** 系统 MUST 以 resolved intent 一致性门控为准
- **AND** 系统 MUST 进入 repair、澄清或确定性失败路径
- **AND** 系统 MUST NOT 直接触发与 resolved intent 冲突的卡片生成

### Requirement: 默认字段不得伪装成用户确认条件
系统 SHALL 使用字段来源控制用户可见表达，所有默认值和模型推断值 MUST 保留来源信息。

#### Scenario: 模型使用默认值满足 schema
- **WHEN** 用户没有明确提供经验、时长、频率、器械或其他字段
- **THEN** 模型 MAY 使用默认值填充结构化字段
- **AND** 对应字段来源 MUST 标为 `default` 或等价来源
- **AND** 用户可见回复 MUST NOT 将该字段描述为用户明确提供或确认过的条件

#### Scenario: 当前消息覆盖历史字段
- **WHEN** 当前最新用户消息与历史 summary 或 artifact 事实表达不同训练条件
- **THEN** resolved intent MUST 使用当前用户消息覆盖对应字段
- **AND** fieldSources MUST 标明该字段来自 `current_user_message`
- **AND** 后续动作生成和用户回复 MUST 使用覆盖后的字段

### Requirement: 执行型回复必须由服务端事实驱动
系统 SHALL 让执行型用户可见回复基于最终 resolved intent、字段来源和 artifact 结果生成，避免回复与内部动作或卡片结果不一致。

#### Scenario: artifact 生成成功
- **WHEN** resolved intent 的 `action.shouldTrigger = true`
- **AND** artifact generator 返回成功结果
- **THEN** 用户可见回复 MUST 基于 action kind、artifact result 和非 default 字段来源生成
- **AND** 回复 MUST NOT 承诺“马上生成”“稍后生成”“后台生成”或其他流程状态
- **AND** 回复 MUST NOT 重新列出一套与 artifact 可能冲突的动作清单

#### Scenario: artifact 生成失败
- **WHEN** resolved intent 要求触发 artifact
- **AND** artifact generator 返回失败或可恢复错误
- **THEN** 用户可见回复 MUST 基于失败原因给出恢复路径
- **AND** 回复 MUST NOT 声称已经生成成功
- **AND** 系统 MUST NOT 展示未通过校验的 artifact
