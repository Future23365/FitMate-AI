## Context

当前聊天和训练生成链路已经移除了“缺少健康信息就追问”的触发阻断，但仍保留了用户主动表达健康/不适信号后的决策边界：候选动作会因为 `injuryLimitations`、`healthSignalLabels`、`injury_or_pain_signal` 或动作 `riskTags` 被排除，Patch 替换会因为高风险标签被拒绝，健康信号写入还会进入确认流。

这与新的产品方向冲突。系统不应替用户判断身体能否训练，也不应因为医疗健康词汇减少或拒绝训练结果。系统只需要避免输出医疗诊断或治疗承诺。

## Goals / Non-Goals

**Goals:**
- 健康、疼痛、伤病、不适、身体限制和风险标签不再影响动作推荐、单次编排、长期计划和 Patch 替换的候选选择或结果生成。
- 健康/不适文本不再写入会影响候选选择的长期记忆，也不再触发健康确认流。
- 用户只表达不适时不再被固定降级为一般建议；后续是否触发训练结果只由普通训练意图和可用训练信息决定。
- 保留“不提供医疗诊断或治疗方案”的自然语言输出边界。

**Non-Goals:**
- 不删除数据库字段、Prisma 字段或 Zod schema 中的 `injuryLimitations`、`riskTags`、`contraindications`，避免扩大迁移范围。
- 不清理已有数据库中的历史健康记忆数据，本次只保证读取和新写入不再影响生成决策。
- 不移除用户主动 dislike、too_hard、临时 avoidances 等非医疗偏好边界。

## Decisions

1. **保留字段，删除决策使用**

   `injuryLimitations`、`riskTags`、`contraindications` 和 `injury_or_pain_signal` 仍保留在类型和存储中，但不再参与候选排除、Patch 拒绝或触发降级。这样可以避免 schema 迁移，同时保证结果生成不再被医疗健康边界阻断。

   备选方案是直接删除字段和枚举。该方案会引入数据库迁移、历史数据处理和更多 UI/API 兼容问题，超出当前目标。

2. **健康信号不写入可执行记忆**

   `recordUserFeedbackFromChat()` 不再从疼痛、伤病或不适文本生成 `injury_or_pain_signal` 记忆；`buildConversationMemoryState()` 也不再把健康信号合并进 `injuryLimitations` 或候选排除标签。已有健康记忆即使存在，也不会作为候选过滤依据。

   备选方案是继续写入但读取时忽略。该方案会留下误导性数据，后续维护者容易重新接入。

3. **Prompt 只保留非诊断边界**

   `base_safety` 保留不做医疗诊断或治疗承诺，但删除“疼痛或限制作为动作选择边界”的提示。模型可以提到训练内容，但不能输出病因判断、治疗建议或医疗承诺。

4. **测试以“不阻断”为主**

   旧测试中断言 `health_risk`、健康确认或高风险替换拒绝的用例需要改成断言：候选仍可出现、Patch 不因风险标签被拒绝、健康信号不进入确认流。保留非医疗结构化边界测试。

## Risks / Trade-offs

- [Risk] 用户带伤训练时系统仍会生成训练内容。→ Mitigation：保留自然语言非诊断边界，不输出医疗诊断或治疗承诺；系统不再替用户做身体决策。
- [Risk] 历史文档仍描述健康信号作为约束，造成维护误读。→ Mitigation：同步更新架构、数据库设计、规格和方案变更历史。
- [Risk] 旧的 `change-011-orchestrator-replay-eval` 健康风险分类方向与本 change 冲突。→ Mitigation：本 change 的规格明确覆盖当前产品方向，后续不应继续实现健康风险分类阻断。
