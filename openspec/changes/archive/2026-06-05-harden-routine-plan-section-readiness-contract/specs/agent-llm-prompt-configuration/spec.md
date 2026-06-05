## ADDED Requirements

### Requirement: 默认 prompt 必须把 routine 和 plan section readiness 表达为 final 前置条件
系统 SHALL 在默认 Agent LLM prompt 中表达：`final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload.kind = "routine"` 或 `"plan"` 只有在当前 run 已具备 `warmup`、`training`、`stretch` 三类可消费动作事实时才允许输出。该合同 SHALL 作为首轮模型可见规则出现，MUST NOT 只依赖 validation failure 或 repair feedback 才表达。

#### Scenario: Prompt 表达 routine 和 plan 的 final 前置条件
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明如果最终输出 `final_answer.visibleOutputs[].payload.kind = "routine"` 或 `"plan"`，当前 run 必须已经具备 `warmup`、`training`、`stretch` 三类当前可消费动作事实
- **AND** system message MUST 说明 `exerciseItems[*].exerciseId` 和 `exerciseItems[*].section` 必须由当前 run 可见动作事实支撑
- **AND** system message MUST 使用中文描述业务含义
- **AND** `final_answer`、`visibleOutputs`、`visibleTrainingProposal`、`payload.kind`、`routine`、`plan`、`exerciseItems`、`exerciseId`、`section`、`warmup`、`training`、`stretch` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 禁止缺 section 时输出 routine 或 plan visibleOutputs
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当当前 run 只有 `training`，或 `missingSectionsForRoutineOrPlan` 非空时，模型不得输出 `final_answer.visibleOutputs[]` 中的 `routine` 或 `plan`
- **AND** system message MUST 说明不得在正文中解释“缺少热身或拉伸”后仍提交不完整的 `routine` 或 `plan`
- **AND** system message MUST 说明这种禁止只约束 `routine` / `plan` 的结构化输出，不阻止模型输出当前事实可支撑的普通解释或 `exercise_selection`

#### Scenario: Prompt 表达缺 section 时的允许下一步
- **WHEN** 默认 prompt 描述 `routine` / `plan` 输出前置条件
- **AND** 当前可见事实不足以支撑 `warmup`、`training`、`stretch` 三类 section
- **THEN** system message MUST 说明模型可以继续调用当前可见且合法的 tool 获取缺失 section 的动作事实
- **AND** system message MUST 说明模型可以使用 `ask_user` 澄清必要约束
- **AND** system message MUST 说明模型可以不输出 `visibleOutputs`，只用正文说明当前事实不足或失败收口
- **AND** system message MUST NOT 要求固定 tool 调用次数、固定 tool 调用顺序或固定业务 `toolName`

#### Scenario: Prompt 不引入服务端生成或旧 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺服务端会自动补齐 `warmup` 或 `stretch` 动作
- **AND** system message MUST NOT 要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏训练生成服务或绕过 `ToolRegistry` 的训练生成能力
