## Context

手动黑盒报告中的失败都发生在 `/api/chat` 的意图解析之后、内部动作事件触发之前。模型自然语言可变，但服务端已经有 `normalizeChatIntentForBlackboxFlows()` 作为黑盒主路径的确定性收口点，因此本次应继续在该边界修复，而不是把所有压力放回提示词。

## Goals / Non-Goals

**Goals:**

- 把“推荐条件细化”稳定识别为动作推荐刷新或过滤，不误触发 routine。
- 让缺少目标的笼统长期计划请求先追问，不再用默认值生成空泛 plan。
- 让器械、场地等 durable facts 可作为后续训练请求的可继承条件。
- 让“第一个动作怎么做”这类最近训练动作讲解请求走受控 artifact payload 和动作库读取，不再触发新推荐卡片。
- 用普通单测覆盖这三类失败，避免每次都依赖真实 LLM 黑盒成本。

**Non-Goals:**

- 不重写聊天编排架构。
- 不改变 `conversationSummary` 的持久化方式。
- 不调整前端聊天 UI。
- 不扩大手动 LLM 测试用例集合。
- 不向 LLM 暴露任意数据库查询能力。

## Decisions

### Decision 1: 在服务端归一化层做确定性兜底

`normalizeChatIntentForBlackboxFlows()` 已经负责处理真实模型在短句上的漂移。本次继续在这里增加语义分支：

- 有最近 `exercise_recommendation` artifact 或当前上下文来自推荐时，且当前消息仍是“推荐/几个/换一批/不用器械”这类推荐细化表达，最终意图固定为 `exercise_recommendation`。
- 当前消息只是空泛长期计划请求，且没有目标、明确频率、周期天数、时长或器械条件时，最终意图固定为不可触发的 `workout_plan`，并返回建议回复。
- 上下文只有器械事实也算可继承训练上下文，但不能让第一轮“我有哑铃”自行触发训练卡片。

### Decision 2: 区分“可继承条件”和“可触发训练上下文”

现有 `hasPriorTrainingContext` 只看目标或 artifact，导致上一轮“我有哑铃”不能支持下一轮完整请求。本次新增更细的判断：

- `hasPriorConditionFacts`：上下文中存在器械、偏好、时长、频率等 durable facts。
- `hasPriorTrainingContext`：存在目标、当前训练意图或 artifact。

第一轮 standalone condition 仍然不触发；第二轮出现目标和时长时，可以继承上一轮条件。

### Decision 3: 笼统 plan 不再默认补齐成可生成计划

“给我一个每周训练计划”只表达长期计划类型，缺少训练目标、实际频率、器械或场地。服务端应返回不可触发 plan 意图和建议回复。相比最小补丁只改提示词，这能保证真实模型即使给了默认值也不会越过门控。

### Decision 4: 序号动作讲解走服务端受控读取链路

“第一个动作怎么做”不是新的动作推荐请求，而是对最近训练内容中的动作做讲解。服务端应先把这类短句归一为 `exercise_explanation`，再让 ReferenceResolver 将“第 N 个动作”解析到当前会话最近的 active artifact。解析成功后，服务端读取完整 artifact payload，按卡片展示顺序取第 N 个 `exerciseId`，再通过动作库读取该动作详情并生成确定性讲解回复。

这个方案比新增开放式 LLM function tool 更稳：LLM 不直接查询数据库，也不能自行构造 SQL 或任意读取动作；它最多看到服务端已经生成的自然语言回复。数据库读取范围由 artifact 的 userId/status 校验、payload schema 校验和 `exerciseId` 精确读取共同约束。

## Risks / Trade-offs

- [Risk] 规则过窄会漏掉相似中文表达。→ Mitigation: 用小型文本 helper 聚合推荐细化、空泛 plan 和 durable facts 判断，后续可按报告继续扩展。
- [Risk] 规则过宽会阻断“6天训练计划”等可生成计划。→ Mitigation: 明确保留具体周期天数、明确每周频率和已有目标上下文的 plan 触发。
- [Risk] 与 LLM prompt 规则重复。→ Mitigation: prompt 是模型指导，服务端归一化是最终安全边界；两者职责不同。
- [Risk] 序号动作可能指向推荐卡片或 routine 中的不同展示顺序。→ Mitigation: 优先使用最近 artifact 的 payload 顺序；最近 artifact 是 routine 时解释 routine 的第 N 个动作，没有 routine 时再解释最近推荐卡片的第 N 个动作。
