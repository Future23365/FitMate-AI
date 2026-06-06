## Context

当前 `visibleTrainingProposal` 已经统一承载动作推荐、单次训练编排和多天训练计划。结构上，`exerciseItems` 是唯一动作事实字段；`routine` 使用同一套 `exerciseItems` 表达一次可执行训练；`plan` 在同一套 `exerciseItems` 上额外添加 `schedule` 表达周期内训练日 / 休息日安排。

现有 schema 已经能拒绝 `plan` 缺少 `schedule`，也能拒绝 `routine` 携带 `schedule`。本次问题不在 schema 基本形状，而在模型可见合同没有足够强调：当 `content` 已经承诺“每周 / 多天 / 周期安排”时，结构化 payload 不能仍是单次 `routine`。

## Goals / Non-Goals

**Goals:**

- 让模型可见合同稳定表达 `routine = 单次训练编排`，`plan = one routine template + schedule`。
- 让 `final_answer.content` 的训练频次 / 周期承诺必须和 `visibleOutputs[].payload.kind`、`schedule.assignments` 对齐。
- 将 plan 示例改成 7 天周期 / 每周 3 练，贴近真实高频用户目标。
- 增加回归测试，覆盖合同文本、模型输入、脚本化 runtime 和真实模型黑盒。
- 继续遵守“模型能力优先，服务端只管契约”的边界。

**Non-Goals:**

- 不改 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他 tool observation 的 `supportsOutputKinds`、`nextActionHints`、`finalAnswerSupport` 等字段。
- 不新增服务端关键词、正则、短句模板、同义词表或用户原文语义分流。
- 不让 validator 读取用户原文或 `final_answer.content` 来判断模型“应该”输出 `routine` 还是 `plan`。
- 不改变 `visibleTrainingProposal` schema 版本，不新增 `routines[]`、`schedule.assignments[].routineId` 或 A/B 多模板计划结构。
- 不改前端渲染逻辑来把 `routine` 补成 `plan`。

## Decisions

### 1. 修复点落在 output contract，而不是服务端语义路由

本次修复应主要修改 `agent-visible-output-contracts.ts` 中的 `visibleTrainingProposalOutputContract`。原因是模型需要在输出结构前看到稳定的业务输出能力说明；服务端 route、runtime、validator 和 renderer 不应根据用户自然语言替模型改写 `payload.kind`。

替代方案是让 validator 比对 `content` 中是否出现“每周”再拒绝 `routine`。该方案会让 validator 重新理解自然语言语义，违反当前架构边界，因此不采用。

### 2. 明确 `content` 与 `payload` 的一致性合同

合同应新增或强化说明：`final_answer.content` 只能解释、提醒或总结已经由结构化 payload 表达的结果。正文如果承诺训练频次、周期、多天或一周安排，`visibleOutputs[].payload.kind` 必须是 `plan`，并且必须提供 `schedule.assignments`；如果输出 `routine`，正文只能描述单次训练编排。

这不是基于固定词语的触发规则，而是用户可见承诺与结构化事实的一致性边界。

### 3. 用真实形态 plan 示例替换弱示例

现有 plan 示例使用 2 天周期，不足以让模型稳定理解“每周 3 练”应如何落到 `schedule.assignments`。应改为 7 天周期示例，使用同一套 `exerciseItems`，并在 `schedule.assignments` 中安排 3 个 `training` 日和 4 个 `rest` 日。

示例中的 `exerciseId` 继续使用“必须替换为当前 run 可见事实”的占位说明，避免模型照抄假 ID。

### 4. 保留 schema 结构，不扩展多模板计划

本 change 只收紧当前 `one routine template + schedule` 的理解，不引入每天不同动作模板。若后续需要 A/B 日或多模板周期，需要新的 output contract schema 和独立 change。

### 5. 测试覆盖合同而不是某个短句

自动化测试应断言模型可见合同包含稳定结构边界，例如 `routine` 不承诺周期安排、`plan` 必须带 `schedule.assignments`、正文频次承诺必须由 payload 表达。回归测试可以包含“每周 3 练”失败样例，但生产规则不得写成只针对该短句。

## Risks / Trade-offs

- [Risk] 只改 output contract，不改 tool observation，真实模型仍可能被 observation 中的 `supportsOutputKinds` 干扰。→ Mitigation：本 change 明确记录该限制，并通过手动 LLM 黑盒验证暴露剩余风险；tool observation 由独立 change 处理。
- [Risk] 示例过强可能让模型总是输出 7 天计划。→ Mitigation：合同同时保留 `routine` 单次边界和 `plan` 周期边界，示例只说明周期计划形态，不要求所有训练都生成 plan。
- [Risk] 让正文与 payload 一致可能让模型在事实不足时迟疑。→ Mitigation：合同允许模型在无法满足 `plan` 结构时继续合法 `tool_call`、`ask_user` 或失败收口，不允许用 `routine` 假装完成周期计划。

## Migration Plan

1. 更新 output contract 文案、schema summary、kind contracts 和 plan example。
2. 更新相关自动化测试，确保模型可见合同和 planner request 中包含新边界。
3. 更新脚本化聊天测试，覆盖周期计划输出 `kind = "plan"` + `schedule.assignments`。
4. 更新手动 LLM 黑盒 fixture / judge，新增或强化每周计划退化为 routine 的失败判定。
5. 运行 OpenSpec 和相关测试。

## Open Questions

- 是否需要在后续独立 change 中删除或重构 `searchExerciseResources` observation 的 `supportsOutputKinds` / `nextActionHints`，避免中间 tool result 干扰最终 kind 判断。该问题不在本 change 范围内。
