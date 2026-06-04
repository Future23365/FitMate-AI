## ADDED Requirements

### Requirement: terminal visible output 失败必须作为结构化 invalid action observation 反馈
系统 SHALL 在 `final_answer.visibleOutputs[]` 通过静态 envelope 但未通过业务 terminal output validator 时，把失败结果作为结构化 invalid action observation 提供给下一轮 Planner。反馈 MUST 保留 output index、`outputType`、`schemaVersion` 和业务 validator 返回的脱敏 details。反馈 MUST NOT 把业务流程建议写成固定下一步。

#### Scenario: section_not_allowed 进入下一轮 observation
- **WHEN** `visibleTrainingProposal` 因 `section_not_allowed` 被 terminal output validator 拒绝
- **AND** 当前 run 仍有 repair 预算
- **THEN** 下一轮 Planner 可见 observations MUST 包含 `type = "invalid_action"`
- **AND** observation content MUST 包含 `code = "terminal_reference_invalid"` 或等价 terminal validation failure code
- **AND** observation content MUST 包含业务 details 中的 `code = "section_not_allowed"`
- **AND** observation content MUST 包含失败的 `exerciseId`、输出的 `section`、数据库 `allowedSections` 和字段 `path`
- **AND** observation content MUST NOT 包含完整数据库对象、完整 handler output、secret、stack trace 或跨用户 payload

#### Scenario: repair feedback 不替代 Planner 决策
- **WHEN** runtime 生成 visible output validation failure feedback
- **THEN** feedback MUST NOT 要求 Planner 必须调用某个具体 tool
- **AND** feedback MUST NOT 自动改写 Planner 上一轮 action
- **AND** feedback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板生成下一步 tool input
- **AND** runtime MUST 继续校验下一轮 Planner 输出的 schema、toolName、tool input、resource、policy、grounding 和 terminal output

