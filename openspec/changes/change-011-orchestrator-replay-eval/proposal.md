## Why

`change-001` 到 `change-010` 已完成第一批 AI 训练计划编排基础能力，但总方案中仍有几类能力只被保留为后续阶段或 Non-Goals：复杂多步编排、未来 schedule 写入执行、完整 Replay、自动 Eval、统一修复策略、健康风险分类和响应解释边界。需要用 `change-011` 把这些未完成部分收敛成下一批可实施文档，避免后续继续散落在各个模块里。

## What Changes

- 新增服务端 `AiTaskOrchestrator` 或等价编排层，统一管理多工具、多步骤、多状态任务，支持 checkpoint、工具 guardrails、确认续跑和失败恢复。
- 扩展 Patch 与 Schedule Service 的执行闭环，让 `move_training_day`、`mark_rest_day`、`change_weekly_frequency` 和 `future_schedules` 在通过 Policy、Confirmation 和 Validator 后可真实写入未来安排。
- 新增 Replay Runner，基于 `AiRunTrace`、artifact 快照、用户画像快照、工具版本和 promptVersion 复盘一次 AI 决策链路。
- 新增 Eval Suite，覆盖引用解析、Patch、计划展开、推荐去重、确认门、健康风险边界和修复策略，防止 prompt、模型或工具版本变更造成回归。
- 新增统一 Repair Orchestrator，将训练草稿、Patch、PlanEngine 和 schedule 写入的可恢复校验失败收敛到确定性修复优先、必要时受控 LLM 修复的流程。
- 新增健康风险分类能力，只处理用户主动表达的疼痛、不适或高风险信号，不恢复已移除的默认健康问询阻断。
- 新增 Response Writer 边界，统一生成解释、确认问题、失败恢复引导和变更摘要，确保用户可见文案与 Policy、Validator、Trace 结果一致。

## Capabilities

### New Capabilities

- `ai-task-orchestrator`: 定义多步骤 AI 编排、工具 guardrails、checkpoint、确认续跑和失败恢复要求。
- `schedule-patch-execution`: 定义未来 schedule Patch 在确认后真实写入、版本化和历史保护要求。
- `ai-replay-eval`: 定义 Replay Runner、Eval Suite、评测夹具和回归验收要求。
- `ai-repair-orchestration`: 定义训练草稿、Patch、长期计划和 schedule 写入的统一修复流程。
- `health-risk-classifier`: 定义用户主动表达健康/不适信号时的风险分类、训练边界和非医疗诊断要求。
- `response-writer-boundary`: 定义 AI 编排结果到用户可见回复、确认问题、失败引导和变更摘要的输出边界。

### Modified Capabilities

- `workout-session-step-flow`: 未来 schedule 修改必须继续保护已完成训练历史，并保持训练执行入口只读取有效安排。
- `training-calendar-layout`: 日历中未来安排被 AI 修改后，页面必须能体现新增、移动、休息日和重排后的真实数据。
- `workout-generation-validation-recovery`: 现有训练草稿失败恢复需要升级为统一 Repair Orchestrator 的一个场景，而不是孤立补丁。
- `manual-llm-consistency-tests`: 手动 LLM 一致性测试需要补充 `011` 的关键多步链路和健康边界用例。

## Impact

- 影响 `/api/chat` 编排层、`/api/ai/workout-plan`、ReferenceResolver、PatchEngine、DomainPlanEngine、Schedule Service、PolicyEngine、ConfirmationGate、Validation Service、AiRunTrace 和 `/dev/ai-traces`。
- 可能新增 replay/eval 运行脚本、测试夹具、trace 快照格式和开发文档。
- 可能需要扩展未来 schedule 写入服务、Patch result schema、repair result schema、response writer schema 和 trace step 类型。
- 不引入自由 Agent runtime；如后续接入 LangGraph / Agents SDK，也必须服从本 change 定义的工具 schema、Policy、Validator、Confirmation 和 Trace 边界。
