## Context

当前 `visibleTrainingProposal.payload.kind = "plan"` 已被定义为单模板计划：`exerciseItems[]` 承载同一套 `warmup` / `training` / `stretch` 编排，`schedule.assignments` 承载周期内训练日和休息日。实际 trace 暴露的问题不是动作库候选不足，也不是 `submitVisibleTrainingProposal` 不支持 `plan`，而是模型在候选事实已足够时没有稳定完成“候选事实 -> 可重复 routine template -> schedule -> plan finalization”的组合决策。

本变更只调整模型可见合同和测试，不改变数据库结构、不新增业务 tool、不修改 LangChain runtime 主循环、不让服务端根据用户原文选择 `payload.kind`。

## Goals / Non-Goals

**Goals:**

- 让模型把多天或一周计划稳定理解为“可重复 routine template + schedule”。
- 让模型在一次对话内直接通过 `submitVisibleTrainingProposal(payload.kind="plan")` 交付 plan，而不是先把 routine 作为用户可见终态推出。
- 降低 `plan` 结构构造的认知负担：先选同一套 `exerciseItems[]` 并补 `prescription`，再补 `schedule.assignments`。
- 用 prompt、tool description、schema description 和测试固定合同，避免依赖失败重试。

**Non-Goals:**

- 不新增每天不同完整编排的 plan 数据模型。
- 不让服务端根据“一周”“每天”等用户词语改写 tool call、payload kind 或 schedule。
- 不在 runtime、tool wrapper、response adapter 或 `/api/chat` 中新增业务 `toolName` 分支。
- 不改变 `submitVisibleTrainingProposal` 的 handler、validator 或持久化边界。

## Decisions

1. **保留直接生成 plan 能力，改成 composition-first 合同。**

   直接取消 plan 会降低用户体验，也会和现有 `workout_plan` 测试矩阵冲突。更稳的做法是保持用户一次性拿到 plan，但要求模型先在同一个 payload 内形成一套可重复 routine template，再补 schedule。

2. **把通用策略放在 Agent prompt，把业务结构边界放在 finalization tool。**

   `prompt.ts` 只负责 Planner Policy：什么时候停止查动作、什么时候必须进入结构化训练收口、plan 的组装顺序是什么。`submitVisibleTrainingProposal` description / schema description 负责解释 `payload.kind=plan` 的结构含义、字段来源和 validator 边界。

3. **不让 `searchExerciseResources` 产出 readiness 或下一步指令。**

   动作查询 tool 只提供候选事实。是否已经足以构造 routine template 或 plan 仍由模型基于 prompt、tool description、候选事实和用户目标判断。

4. **测试覆盖模型可见合同，而不是服务端语义分流。**

   测试断言 prompt/tool description/schema description 包含 composition-first plan 合同，并验证合法 `plan` payload 的 schema/validator 行为。等价语义样例只作为回归测试，不反向变成生产关键词规则。

## Risks / Trade-offs

- [Risk] 模型仍可能把 plan 误写成普通 content。
  → Mitigation：强化 `content 不能替代结构化 plan` 的正向准入条件，并保留结构化终态 repair 作为最后兜底，但不把 repair 当主方案。

- [Risk] 单模板 plan 无法表达每天不同训练内容。
  → Mitigation：明确当前 `schedule` 只表达同一套编排的 training/rest 日；每天不同完整编排属于后续数据模型升级。

- [Risk] prompt 过长导致规则稀释。
  → Mitigation：只在 flow example 和关键 Planner Policy 中增加短句；字段细节放在 tool/schema description。

- [Risk] 方案被误解为固定工具调用顺序。
  → Mitigation：OpenSpec 和测试明确禁止服务端固定流程；模型仍基于当前可见事实自主判断，只是在 plan 结构目标明确且候选事实足够时必须进入结构化收口。
