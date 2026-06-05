## ADDED Requirements

### Requirement: searchExerciseResources 模型可见合同必须阻止缺 section 的 routine 和 plan final
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达当前查询结果覆盖了哪些 section，以及缺失 section 对 `routine` / `plan` final 输出的影响。当 `missingSectionsForRoutineOrPlan` 非空且模型目标需要 `routine` 或 `plan` 时，模型可见合同 MUST 指向继续查询缺失 section、澄清或失败收口，而不是提交缺 section 的 `visibleOutputs`。

#### Scenario: Manifest 表达缺 section 查询方式
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST 说明当模型已经判断最终目标需要 `routine` 或 `plan`，且当前 observations、tool results 或 resource coverage 显示缺少 `warmup` 或 `stretch` 动作事实时，模型应先获取缺失 section 的动作事实
- **AND** manifest MUST 说明可以通过 `suitabilities` 填写缺失 section，例如 `["warmup", "stretch"]`，查询对应候选
- **AND** manifest MUST 说明缺失 section 未补齐前，不要输出 `final_answer.visibleOutputs[].payload.kind = "routine"` 或 `"plan"`
- **AND** manifest MUST 使用中文描述业务含义，`searchExerciseResources`、`suitabilities`、`warmup`、`stretch`、`routine`、`plan`、`final_answer`、`visibleOutputs`、`payload.kind` 保持英文原样

#### Scenario: Observation 表达 section coverage 和 forbidden final
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达本次结果实际返回的 `availableSections`
- **AND** model observation MUST 表达 `sectionSummary`
- **AND** model observation MUST 表达 `missingSectionsForRoutineOrPlan`
- **AND** 当 `missingSectionsForRoutineOrPlan` 非空时，model observation MUST 说明当前结果不能支撑 `routine` 或 `plan` 的成功 `visibleOutputs`
- **AND** 当 `missingSectionsForRoutineOrPlan` 非空时，model observation MUST 说明在缺口补齐前禁止提交 `final_answer.visibleOutputs[].payload.kind = "routine"` 或 `"plan"`

#### Scenario: Observation 给出缺失 section 的下一步但不固定调用顺序
- **WHEN** model observation 描述缺少 `warmup` 或 `stretch`
- **THEN** observation MUST 说明如果最终目标需要 `routine` 或 `plan`，模型可以继续用缺失 section 的 `suitabilities` 查询候选
- **AND** observation MUST 允许模型在事实不足、tool 不可用或约束不足时使用 `ask_user`、失败收口或不输出 `visibleOutputs` 的说明
- **AND** observation MUST NOT 表达成所有请求都必须固定再次调用 `searchExerciseResources`
- **AND** observation MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序

#### Scenario: Examples 展示缺 section 查询而非自然语言意图映射
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 包含使用 `suitabilities = ["warmup", "stretch"]` 查询热身和拉伸候选的合法 input 示例
- **AND** examples MUST NOT 把某个固定用户短语映射成固定 `payload.kind`
- **AND** examples MUST NOT 承诺 `searchExerciseResources` 会生成最终 `routine`、`plan`、`prescription`、`schedule` 或训练卡片

#### Scenario: Tool 仍只提供动作事实
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** tool output MUST 仍只提供发布态动作事实查询结果
- **AND** tool output MUST NOT 生成 `visibleTrainingProposal`
- **AND** tool output MUST NOT 生成 `routine`、`plan`、`prescription` 或 `schedule`
- **AND** tool handler MUST NOT 根据用户自然语言、关键词、短句模板或同义词表替模型选择动作或输出结构
