## Context

聊天链路当前依赖 LLM 返回 `canTriggerAction` 与 `missingActionFields` 来决定是否派发 `assistant_action`。在 “我要一周都练这个” 这类 follow-up 中，模型已经正确识别 `workout_plan`、目标、时长和周期，但因为把 `injuryLimitations` 放入 `missingActionFields`，导致服务端没有推送计划。

用户明确要求移除健康、伤病、疼痛、高风险健康词相关的提示、判定、追问和触发要求。实现上需要同时改 prompt 与服务端内部 action gating，避免模型偶发返回健康缺失字段时仍阻断结果。

## Goals / Non-Goals

**Goals:**

- 健康、伤病、疼痛、不适、高风险健康词不再参与 `canTriggerAction` 阻断。
- 模型 prompt 不再主动要求询问膝盖、疼痛、伤病、身体限制、医疗建议或高风险提醒。
- 服务端对 `missingActionFields` 做健康字段过滤，健康字段缺失不影响 `assistant_action`。
- 保持动作库候选、exerciseId 校验、Zod Schema 校验和数据库权限边界。
- 修复基于上一轮 routine 扩展成一周计划时不推送计划的问题。

**Non-Goals:**

- 不删除 `injuryLimitations` 字段本身，避免破坏现有 schema 和候选服务类型；字段保留为空数组或仅作为用户主动输入的普通偏好数据。
- 不让 AI 绕过候选动作库或输出未校验 exerciseId。
- 不改数据库模型。

## Decisions

### 1. Prompt 层删除健康 gating 语义

调整 `chatIntentResolution`、`chatCompletion`、summary、workout plan 和 exercise recommendation prompt，删除健康/伤病/疼痛/高风险相关的主动提醒、追问和 gating 规则。

取舍：只改服务端过滤可以修复触发，但模型仍会继续生成“膝盖不适”等追问；因此 prompt 需要同步收敛。

### 2. 服务端过滤健康类 missing fields

新增一个健康字段过滤函数，识别 `injuryLimitations`、`injury`、`pain`、`health`、`medical`、`bodyRestriction`、`knee` 等缺失项。派发 `assistant_action` 时使用过滤后的 missing fields 判断，而不是原始模型输出。

取舍：完全信任模型 `canTriggerAction` 会继续受旧惯性影响；完全忽略 `canTriggerAction` 又可能误触发真正缺目标/时长的请求。过滤健康字段后再按训练信息是否足够纠偏，是更窄的改动。

### 3. follow-up 计划可由已有 summary 和 intent 触发

当 `type=workout_plan` 或 `routine`，且 `workoutIntent` 已有目标、时长和可用候选动作时，即使模型返回 `canTriggerAction=false`，只要剩余缺失项都属于健康类，就允许触发。

取舍：这会减少追问，提高自动推送率；代价是系统不再主动确认健康状态，这符合本次产品要求。

## Risks / Trade-offs

- [Risk] 用户确实有身体限制但没有主动说明，系统不会再追问。→ Mitigation：按本次要求默认用户自行判断，系统只处理用户主动提供的信息。
- [Risk] prompt 中仍有残留健康文案。→ Mitigation：用 `rg` 检查 prompt、文档和测试中的关键字，并补断言。
- [Risk] 误触发没有训练目标的计划。→ Mitigation：只过滤健康类 missing fields，目标、时长、器械/场地等训练信息仍可作为触发判断依据。
