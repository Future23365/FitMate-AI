## ADDED Requirements

### Requirement: 手动 LLM 黑盒必须覆盖计划退化为 routine 的回归
系统 SHALL 在手动 LLM 黑盒测试中覆盖“用户目标需要周期 / 每周训练计划，但最终结构化输出退化为无 `schedule` 的单次 `routine`”的失败类型。该测试 MUST 只在专用手动 LLM 命令中运行，不得进入默认 `npm run test`。

#### Scenario: 每周训练计划必须输出 plan
- **WHEN** 手动 LLM 黑盒用例的用户目标明确要求每周训练频次、单次时长和训练限制
- **AND** 后续用户允许热身和拉伸由系统自行选择
- **THEN** 最终用户可见输出若包含 `visibleTrainingProposal`，其 payload MUST 使用 `kind = "plan"`
- **AND** payload MUST 包含 `schedule.assignments`
- **AND** `schedule.assignments` MUST 包含与用户目标一致或合理解释的训练日 / 休息日安排
- **AND** 仅输出正文中的每周说明、`kind = "routine"`、无 `schedule.assignments` 的单次 routine、或建议用户下一轮再生成计划 MUST 判定为失败

#### Scenario: judge 不把建议问题当作已完成计划
- **WHEN** 手动 LLM 黑盒期望生成周期训练计划
- **AND** assistant 只在 `suggestedQuestions` 中提供“改成每周 N 练”或等价下一轮建议
- **THEN** judge MUST NOT 将该轮判定为已完成计划
- **AND** 若 visible output 已经是错误 kind 或缺少 `schedule.assignments`，judge MUST 返回失败
