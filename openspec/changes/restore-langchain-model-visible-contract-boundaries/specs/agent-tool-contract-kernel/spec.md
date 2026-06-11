## ADDED Requirements

### Requirement: LangChain tool model-visible summary 必须只表达事实和确定性诊断
系统 SHALL 将所有生产 LangChain tool 的 `toModelVisibleSummary()` 限定为模型可见事实摘要和确定性诊断。Summary MUST 表达工具执行事实、查询事实、受控业务事实、字段级错误、权限 / schema / validator 诊断和可安全展示的有限业务摘要；MUST NOT 表达用户业务目标是否满足，也 MUST NOT 指导模型下一步必须调用哪个业务 tool 或按哪个固定 workflow 收口。

#### Scenario: summary 不暴露业务目标满足度字段
- **WHEN** 任意生产 LangChain tool 生成 model-visible summary
- **THEN** summary MUST NOT 包含 `fulfillment`
- **AND** summary MUST NOT 包含 `satisfied`
- **AND** summary MUST NOT 包含 `fulfillment.satisfied`
- **AND** summary MUST NOT 使用 `satisfied = true` 或 `satisfied = false` 表达该 tool result 是否能完成用户目标
- **AND** summary MAY 使用事实等级字段表达结果类型，例如 `factLevel = "query_facts"`、`"resolved_candidates"`、`"diagnostic"` 或 `"validated_output"`

#### Scenario: summary 不承载下一步 workflow 指导
- **WHEN** 任意生产 LangChain tool 生成 model-visible summary
- **THEN** summary MUST NOT 包含 `visibleDeliveryBoundary`
- **AND** summary MUST NOT 包含 `supportSectionCompletionBoundary`
- **AND** summary MUST NOT 包含 `routinePlanCompositionBoundary`
- **AND** summary MUST NOT 包含 `supportsOutputKinds`
- **AND** summary MUST NOT 包含 `nextActionHints`、`finalAnswerSupport`、`supportsSuccessfulVisibleOutputs` 或等价下一步指导字段
- **AND** summary MUST NOT 包含“下一步应调用某 tool”“缺少某 section 应继续查询”“若要交付应调用结构化收口 tool”或等价固定 workflow 文案

#### Scenario: summary 保留可恢复诊断但不替模型决策
- **WHEN** tool input schema、handler output schema、业务 validator 或数据库事实校验失败
- **THEN** model-visible summary MUST 表达稳定错误 code、字段 path、expected、actual、allowedValues、当前事实覆盖或 diagnostics
- **AND** summary MUST 表达失败结果不能伪装成成功事实
- **AND** summary MUST NOT 根据用户原文、具体 `toolName`、字段组合或业务 section 替模型选择后续 tool、固定回答或固定结构化输出

#### Scenario: repair feedback 不输出下一步 action 枚举
- **WHEN** tool schema、domain validator、finalization validator、duplicate input 或 runtime 预算生成模型可见 repair feedback
- **THEN** feedback MAY 表达错误 code、字段 path、expected、actual、allowedFields、requiredFields、allowedValues、当前事实覆盖和可恢复边界
- **AND** feedback MUST NOT 包含 `nextActionHints`
- **AND** feedback MUST NOT 包含 `final_answer_with_visible_outputs`
- **AND** feedback MUST NOT 包含 `final_answer_without_visible_outputs`
- **AND** feedback MUST NOT 包含 `final_answer_with_current_tool_result`
- **AND** feedback MUST NOT 包含 `continue_tool_call`
- **AND** feedback MUST NOT 包含 `ask_user` 作为下一步建议
- **AND** feedback MUST NOT 根据用户自然语言、具体 phrasing、具体业务 `toolName` 或字段组合改写下一轮 tool call 或最终回答策略

### Requirement: LangChain tool description 必须描述能力边界而非业务编排
系统 SHALL 让生产 LangChain tool 的 description、schema description 和 examples 只描述该 tool 的稳定资源、能力、输入来源、输出事实含义和确定性边界。Tool description MUST NOT 承担完整业务 workflow、Planner policy 或 finalization 编排职责。

#### Scenario: description 不写固定调用流程
- **WHEN** production tool catalog 序列化任意 LangChain tool
- **THEN** tool description MUST NOT 根据用户短句、关键词、正则、同义词表或具体 phrasing 规定必须调用该 tool
- **AND** tool description MUST NOT 规定“先调用 A，再调用 B”的固定业务流程
- **AND** tool description MUST NOT 表达成某个 tool result 缺少某字段或某 section 时必须调用指定业务 tool
- **AND** tool description MUST 使用中文描述业务含义，`toolName`、字段名、enum、schema id 和代码标识符保持英文原样

#### Scenario: schema description 只写字段来源和确定性边界
- **WHEN** production tool catalog 序列化任意 LangChain tool input schema
- **THEN** schema description MUST 表达字段可用值、输入来源、结构边界和本工具特有约束
- **AND** schema description MUST NOT 写完整训练生成 workflow
- **AND** schema description MUST NOT 把服务端 validator、runtime budget 或 response adapter 的职责复制为该字段的业务下一步说明

### Requirement: submitVisibleTrainingProposal 模型可见说明必须只描述 finalization 和 validator 边界
系统 SHALL 将 `submitVisibleTrainingProposal` 作为结构化训练输出 finalization tool。它的模型可见 description、schema description、accepted summary 和 rejected summary MUST 只描述提交结构、服务端 validator、accepted / rejected 事实和确定性 diagnostics；MUST NOT 指挥模型补查特定业务 tool 或补齐固定训练 section。

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
