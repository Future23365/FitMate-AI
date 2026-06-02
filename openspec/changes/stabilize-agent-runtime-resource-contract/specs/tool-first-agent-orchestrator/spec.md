## ADDED Requirements

### Requirement: Agent 终止结果必须使用资源角色校验
AgentOrchestrator SHALL 在结束本轮执行前按资源角色校验 `AgentExecutionResult`。系统 MUST NOT 因诊断资源被用于澄清或阻断说明而返回 `model_output_invalid`，也 MUST NOT 让诊断资源冒充成功写入、生成或校验依赖。

#### Scenario: 澄清结果引用失败搜索诊断
- **WHEN** `searchExercises` 返回 failed 或 partial 诊断结果
- **AND** Agent 随后通过 `askClarification` 请求用户确认
- **THEN** 最终 `needs_clarification` MAY 引用该搜索诊断
- **AND** 系统 MUST 输出澄清问题
- **AND** 系统 MUST NOT 将该结果降级为 `model_output_invalid`

#### Scenario: 生成结果引用失败搜索诊断
- **WHEN** Agent 返回 `generated`
- **AND** `usedToolResultIds` 中包含 failed 或 partial 的 `searchExercises` 结果
- **THEN** runtime MUST reject 该 generated 结果
- **AND** 系统 MUST NOT 生成、保存或推送 routine / plan artifact

### Requirement: Agent 必须把 askClarification 作为澄清终止路径
系统 SHALL 让 `askClarification` 工具结果通过 `AgentExecutionResult.status = "needs_clarification"` 到达 Response Writer。Agent MUST NOT 只用普通 `answered` 表达等待用户补充信息。

#### Scenario: 工具返回澄清问题
- **WHEN** Agent 成功执行 `askClarification`
- **THEN** Response Writer MUST 输出澄清问题
- **AND** Response Writer MUST 输出工具提供的 `assistantSuggestions`
- **AND** done metadata 或 trace MUST 表达 Agent status 为 `needs_clarification`

#### Scenario: 澄清不产生训练 artifact
- **WHEN** Agent status 为 `needs_clarification`
- **THEN** 聊天流 MUST NOT 推送 routine、plan、patch 或 recommendation artifact 事件
- **AND** 用户可见回复 MUST NOT 承诺已经生成或保存训练结果

### Requirement: Agent 执行型生成链不得退化为普通 answered
当 Agent 本轮已经进入 routine、plan 或 patch 的执行型工具链时，系统 SHALL 禁止模型用普通 `answered` 自由文本作为生成成功或半成功结果。

#### Scenario: Routine draft 已生成
- **WHEN** 本轮已经成功执行 `generateRoutineDraft`
- **AND** 模型返回 `answered` 并声称已经生成训练安排
- **THEN** runtime MUST reject 或 repair 该终止结果
- **AND** Agent MUST 继续进入 validation / policy / save，或返回 `needs_clarification`、`blocked`、`failed`

#### Scenario: Routine candidate 已开始但未生成 draft
- **WHEN** 本轮已经调用 `searchExercises(candidateUse = "routine")`
- **AND** 搜索结果不足以生成 routine
- **THEN** Agent MUST 返回 `needs_clarification`、`blocked` 或 `failed`
- **AND** Agent MUST NOT 用 `answered` 输出自由文本训练编排冒充 routine

#### Scenario: 普通知识回答不受防逃逸限制
- **WHEN** 本轮没有进入 routine、plan 或 patch 执行型工具链
- **AND** 用户只是询问动作说明、训练建议或非写入问题
- **THEN** Agent MAY 使用 `answered`
- **AND** 系统 MUST 仍按引用校验确保具体事实来自 tool result 或已知上下文
