## Why

长期训练计划不应由 LLM 自由铺满完整日历。LLM 适合理解用户目标和选择策略，但训练日、休息日、周频率、周期递进、恢复间隔和 schedule preview 应由服务端领域引擎展开，才能保证计划稳定、可校验、可复盘。

## What Changes

- 新增 `PlanStrategy`，让 LLM 或意图解析层输出计划策略，而不是完整长期日历。
- 新增 `DomainPlanEngine`，根据 strategy、引用 artifact 和用户约束展开训练日、休息日、递进和 schedule preview。
- 支持 `repeat_previous_routine`、`repeat_same_routine_with_progression`、`weekly_split`、`alternating_ab` 和保守 `custom` 策略。
- 对“三周都练这个”“一周三练”“改成一周四练但别太累”等表达生成可解释计划。
- Validator 校验训练日数量、连续负荷、动作阶段、时长、风险和周频率。

## Capabilities

### New Capabilities
- `domain-plan-engine`: 定义 PlanStrategy、长期计划展开、恢复安排、递进策略和 schedule preview 要求。

### Modified Capabilities
- `plan-push-composition`: 长期计划生成应由 PlanStrategy + DomainPlanEngine 展开，而不是由 LLM 自由生成完整日历。
- `workout-patch`: 涉及周频率或计划结构调整时应交给计划引擎重算安全草稿。

## Impact

- 影响 AI 编排层、长期 plan 生成服务、计划卡片 payload、Validator 和保存 schedule preview 的流程。
- 依赖 `change-001` artifact、`change-002` 引用解析、`change-004` 动作候选分池。
- 需要补充 PlanStrategy schema、DomainPlanEngine 单元测试和聊天集成测试。
