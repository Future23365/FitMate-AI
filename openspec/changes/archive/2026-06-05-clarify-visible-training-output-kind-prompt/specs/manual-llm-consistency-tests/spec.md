## ADDED Requirements

### Requirement: 基础黑盒 judge 必须识别 routine 和 plan 降级失败
基础黑盒 judge prompt SHALL 在文档期望生成 `routine` 或 `plan` 时，把只输出动作推荐、`exercise_selection`、正文动作列表、让用户自行组合或建议下一轮再生成完整结构判为失败，而不是满足期望。

#### Scenario: routine 目标降级为动作列表判失败
- **WHEN** 文档期望明确要求生成 `routine`、单次训练、训练编排或三段式训练
- **AND** 用户最终可见输出只包含动作推荐、`visibleTrainingProposal` 摘要中的 `kind=exercise_selection`、正文动作列表、让用户自行组合，或只建议用户下一轮再生成完整训练
- **THEN** judge MUST 返回 `passed=false`
- **AND** judge MUST 返回 `status=failed`

#### Scenario: plan 目标降级为动作列表或无 schedule 结构判失败
- **WHEN** 文档期望明确要求生成 `plan`、多天安排、周期计划、每周训练安排或训练日 / 休息日安排
- **AND** 用户最终可见输出只包含动作推荐、`kind=exercise_selection`、正文动作列表、无 `schedule.assignments` 的单次 `routine`，或只建议用户下一轮再生成计划
- **THEN** judge MUST 返回 `passed=false`
- **AND** judge MUST 返回 `status=failed`

#### Scenario: Judge 只依据用户最终可见输出
- **WHEN** judge 评估基础黑盒结果
- **THEN** judge MUST 继续只依据 `visibleUserOutput` 判断
- **AND** judge MUST NOT 因缺少 trace、planner action、tool result、agent_progress、raw provider response 或 token diagnostics 而判失败
