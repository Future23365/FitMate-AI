## Context

当前聊天链路先由意图模型输出 `canTriggerAction` 和 `missingActionFields`，再由服务端 `resolveAssistantAction` 决定是否触发 `exercise_recommendation`、`workout_routine` 或 `workout_plan` 内部动作。最新日志显示，用户已经补充“我没有器械”后，系统拥有增肌目标、30 分钟、每周 3 次和无器械条件，但意图模型仍把 `experience` 放入 `missingActionFields`，导致服务端跳过内部动作。

项目已经移除健康/伤病字段的默认阻断，并允许目标明确时触发动作推荐。本次设计延续这个方向：经验缺失时采用保守的新手默认值，而不是继续追问。

## Goals / Non-Goals

**Goals:**

- 让 `experience` 缺失不再单独阻断动作推荐、单次 routine 或长期 plan 的内部动作事件。
- 默认按 `beginner` / 简单训练生成，保持动作候选、强度和校验策略保守。
- 当内部动作没有触发时，让自然语言回复明确追问缺失信息，避免回复承诺和实际推送状态不一致。
- 补充覆盖服务端触发门控的自动化测试。

**Non-Goals:**

- 不改变动作库候选不足时的阻断规则。
- 不放宽目标、时长、频率、器械或场地等核心训练条件的判断边界。
- 不修改数据库结构、Prisma Schema、公开 API 契约或前端卡片数据结构。

## Decisions

### Decision 1: 在服务端兜底门控中把 `experience` 视为可由默认新手策略满足

`chatIntent.canTriggerAction` 仍然是优先信号；当模型返回 `false` 时，服务端继续检查 `missingActionFields`。新增规则是：如果缺失字段是 `experience`，并且 `WorkoutPlanIntent.experience` 已经落到合法默认值（例如 `beginner`），该字段不作为阻断项。

选择服务端兜底而不是只改 prompt，是因为 prompt 仍可能被模型偶发违反；触发边界应由确定性代码最终兜底。

### Decision 2: 默认经验只用于保守生成，不表示用户明确声明

会话摘要和回复中不得把默认 `beginner` 描述成用户亲口确认的事实。下游生成可以使用 `beginner` 控制动作难度和训练量，但对用户可见表达应使用“先按简单/新手友好”这类措辞。

选择这个边界是为了兼顾生成可用性和上下文真实性，避免以后把默认值误当作长期用户画像。

### Decision 3: 回复状态由内部动作是否存在决定

如果服务端没有解析出 `assistantAction`，回复生成 prompt 应要求模型追问真正阻断的缺失信息；如果已经触发内部动作，则只输出自然过渡。这样避免出现“我先整理计划”但没有卡片或计划结果的体验断层。

## Risks / Trade-offs

- [Risk] 用户实际不是新手，默认简单训练可能偏保守。→ Mitigation: 默认只降低难度，不提高风险；用户后续说明经验后可重新生成或调整。
- [Risk] 模型继续在 `missingActionFields` 中输出不规范字段名。→ Mitigation: 服务端使用字段归一化，并用测试覆盖 `experience`、`trainingExperience` 等常见表达。
- [Risk] 过度放宽会在核心条件不足时误触发。→ Mitigation: 本次只放宽经验字段，目标、时长、频率、器械/场地和候选动作不足仍按现有规则阻断。
