## MODIFIED Requirements

### Requirement: submitVisibleTrainingProposal 模型可见说明必须只描述 finalization 和 validator 边界
系统 SHALL 将 `submitVisibleTrainingProposal` 作为结构化训练输出 finalization tool。它的模型可见 description、schema description、accepted summary 和 rejected summary MUST 只描述提交结构、服务端 validator、accepted / rejected 事实和确定性 diagnostics；MUST NOT 指挥模型补查特定业务 tool 或补齐固定训练 section。它的模型可见说明 MUST 区分 `exercise_selection`、`routine` 和 `plan` 的处方 / 日程边界，并说明 `exercise_selection` 的正文不能绕过结构合同主动输出组数、次数、时长、休息时间、训练频率或日程。

#### Scenario: accepted summary 表达已验证输出事实
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "accepted"`
- **THEN** model-visible summary MUST 表达结构已通过服务端 validator
- **AND** summary MAY 表达 validated visible output 的有限摘要、payload kind、section coverage 和可渲染状态
- **AND** summary MUST NOT 要求模型复制内部 `resourceId`、`toolResultId`、`factRef`、`messageId` 或 trace id

#### Scenario: rejected summary 只表达确定性失败事实
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "rejected"`
- **THEN** model-visible summary MUST 表达 rejected 状态、错误 code、字段 path、expected、actual、allowedValues、section coverage 或 validator diagnostics
- **AND** summary MUST 表达 rejected payload 不会渲染为训练卡片或保存为已展示事实
- **AND** summary MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定 tool 流程
- **AND** summary MUST NOT 指导模型补查 `warmup`、`training`、`stretch` 或其他固定业务 section
- **AND** summary MUST NOT 根据具体业务字段组合替模型选择下一步
- **AND** summary MUST NOT 包含 `nextActionHints`、`final_answer_with_visible_outputs`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举

#### Scenario: finalization tool 不承担动作查询职责
- **WHEN** production catalog 序列化 `submitVisibleTrainingProposal` description 或 schema description
- **THEN** description MUST 表达该 tool 只提交并校验模型已经构造的结构化训练输出
- **AND** description MUST NOT 表达该 tool 会查询动作库、自动补全动作、保存计划、生成处方或替模型选择动作
- **AND** 若结构需要动作事实，description MUST 只表达动作 id 和 section 会被服务端基于数据库事实校验
- **AND** description 或 schema description MUST 表达 `payload.kind = "exercise_selection"` 只表示动作推荐集合，不承载 `prescription` 或 `schedule`
- **AND** description 或 schema description MUST 表达 `payload.kind = "routine"` 表示一次可执行训练，动作项需要 `prescription`
- **AND** description 或 schema description MUST 表达 `payload.kind = "plan"` 表示多天训练计划，动作项需要 `prescription`，并需要 `schedule`
- **AND** description MUST 表达当 `payload.kind = "exercise_selection"` 时，最终 `content` 只能解释推荐理由、目标肌群、适用场景、动作差异或动作注意事项，不能主动输出组数、次数、时长、休息时间、训练频率或日程
