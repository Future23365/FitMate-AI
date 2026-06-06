## Context

`toModelObservation` 的设计初衷是把 tool handler output 转成 Planner 下一轮可见的安全事实摘要：压缩、脱敏、保留引用 id、有限业务事实和确定性诊断。当前 `searchExerciseResources` 的 handler 本体仍是只读动作库查询，但 `toModelObservation` 已经额外输出 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport`、`nextActionHints` 和 `routinePlanCompositionBoundary.supportsOutputKinds`。

同类问题也存在于 core lightweight observation：`createOkToolResultIndexObservation` 会把 ok tool result index 投影成 `finalAnswerSupport` 和 `nextActionHints`，duplicate tool input repair payload 也会继续使用 `nextActionHints`。这些字段虽然是短枚举，但仍会让模型把正常 facts / repair facts 误读成“下一步应该选哪个 action”的编排提示。

这类字段把“当前 tool result 有哪些动作事实、缺哪些 section”包装成“是否能成功交付 visibleOutputs、能输出哪些 payload kind、下一步应该做什么”。它违反了 `docs/agent-tool-orchestrator-design.md` 中的边界：Tool output / ToolResult 不应承载业务目标满足度，`searchExerciseResources` 只提供分组动作事实候选，不产出 routine、plan、prescription、schedule 或训练卡片事实。

本 change 的 primary governance skill 是 `agent-tool-change-governance`，任务类型为已有业务 tool projection 与 core lightweight observation 合同修复。由于修改的是模型实际可见 observation、`repairContext` facts 和 compressed tool results，需同步按 `agent-prompt-contract-governance` 检查模型可见合同分层。本 change 来自具体 trace 排查，因此也按 `agent-fix-abstraction-gate` 保证修复不把用户原话、具体字段组合或 trace 个例升格成服务端语义规则。

抽象层级门禁结论：可继续。

1. 抽象问题类型：tool observation 把确定性事实覆盖升级成业务输出决策提示。
2. 通用合同修复：model observation 只表达事实、事实等级、引用边界、缺口和诊断；不得表达用户目标是否已满足、可输出哪些业务 kind 或下一步 action。
3. 业务 tool 局部说明：`searchExerciseResources` 只暴露动作事实和 section 覆盖；`inspectVisibleTrainingProposals(read_recent)` 只暴露已导入的历史可见训练事实、section 覆盖和已有 `schedule` 事实。
4. repair / diagnostic 层说明：只有 validator / runtime 拒绝上一轮 action 后，才通过 `repairContext` 暴露字段级错误、previous tool result fact、allowed / required 信息和可恢复边界；不输出下一步 action 枚举。
5. 回归测试样例：具体“每周 3 练但输出 routine”的 case 只放在测试命名或 fixture 输入里，不写成生产规则。
6. 服务端语义分流检查：不新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## Goals / Non-Goals

**Goals:**

- 让 `toModelObservation` 只传递确定性事实和安全摘要。
- 删除业务 output kind 判断：`supportsOutputKinds` 及其嵌套副本。
- 删除业务目标满足度判断：`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport` 或等价字段。
- 删除下一步编排提示：`nextActionHints` 或等价 `final_answer_with_visible_outputs` / `continue_tool_call` / `ask_user` 建议。
- 收敛 core ok tool result index observation：只表达成功结果索引、事实通道和引用边界，不表达 final answer 支撑判断或下一步 action。
- 收敛 duplicate tool input repair payload：保留重复输入错误坐标、previous result fact、可复用引用和结构化错误，不输出下一步 action 枚举。
- 保留模型组装结构化输出所需的确定性事实：查询条件、命中数、`groups.<section>.exercises[]`、`allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`diagnostics`、引用 id 和资源 role。
- 保留 output contract 与 terminal validator 对最终 `visibleTrainingProposal` 的确定性校验。

**Non-Goals:**

- 不改 `searchExerciseResources` 的 handler 查询逻辑、repository 下推、facet 映射或返回动作摘要本体。
- 不改 `visibleTrainingProposal` schema 对 `routine` / `plan` / `schedule` 的结构要求。
- 不改 `/api/chat` 路由、Agent runtime 主循环、`PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer 或前端展示。
- 不改 AgentAction 类型、允许 action 集合、tool 执行顺序、repair budget 或重复 tool input 判定逻辑；只改这些结果进入模型输入时的事实投影字段。
- 不让服务端根据用户自然语言决定 `payload.kind`、tool 调用顺序、是否输出 `plan` 或是否补 `schedule`。
- 不用 prompt 文案补丁替代 projection 合同收敛。

## Decisions

### 1. `toModelObservation` 只表达事实，不表达输出 kind 可行性

`supportsOutputKinds` 从所有 business tool observation 中移除。替代字段不是新的 `canOutputPlan` 或 `eligibleKinds`，而是纯事实覆盖字段：

- `sectionSummary`: 每个 section 的动作事实数量。
- `availableSections`: 本次 observation 可见的 section。
- `missingSections`: 缺少哪些可确定 section。
- `hasSchedule`: 历史已导入事实是否已经包含 `schedule`，仅适用于 `read_recent` 这种读取完整历史事实的 tool。

Planner 仍可基于这些事实、用户目标和 `outputContracts` 自主选择 `exercise_selection`、`routine` 或 `plan`。Validator 继续校验最终 payload 是否包含必需 section、`prescription`、`schedule` 和合法动作 id。

替代方案是保留 `supportsOutputKinds` 并改文案说明“只是建议”。这仍会把中间事实投影训练成输出 kind 决策信号，因此不采用。

### 2. 去掉业务满足度和 final answer 支撑判断

`fulfillment.satisfied` 可以继续表达 tool 声明的能力是否执行完成，例如查询是否成功、引用读取是否成功。它不得扩展为“用户目标是否满足”或“是否支撑成功 visibleOutputs”。因此移除：

- `fulfillment.supportsSuccessfulVisibleOutputs`
- `finalAnswerSupport`
- `routinePlanCompositionBoundary.finalAnswerSupport`
- 其他等价自然语言判断

如果 observation 需要表达事实不足，只能用结构化事实字段或诊断 code，例如 `diagnostics[]`、`missingSections`、`querySpecificity.status = "broad"`。最终是否成功输出结构化结果由 Planner + output contract + validator 闭环决定。

替代方案是把 `supportsSuccessfulVisibleOutputs` 放进通用 core grounding。该字段天然混合了用户目标和业务 shape，不适合作为通用合同，因此不采用。

### 3. 去掉正常 observation 中的 `nextActionHints`

`nextActionHints` 直接把 tool result 变成下一步编排提示。即使不包含具体 `toolName`，它也在告诉模型“应该 final answer / 继续 tool / ask user”。本 change 将其从业务 tool observation 和 core ok tool result index observation 中移除。

如果需要恢复非法 action，应在 validator / runtime 的 `repairContext` 中表达字段级错误、previous result fact、当前可见 resource 和可恢复边界。`repairContext` 也不再使用 `nextActionHints` 这个字段名，不提供 `final_answer_with_visible_outputs` / `continue_tool_call` / `ask_user` 这类 action 枚举；模型应基于 protocol、schema、manifest、当前 facts 和 repair error 自主选择下一轮合法 action。

替代方案是保留枚举型 hints。当前问题正是正常成功 observation 影响业务 kind 选择，因此不采用。

### 4. 区分正常 observation 与 repairContext

正常成功 observation 只表达当前 run 已发生的事实：

- tool 是否执行成功。
- `toolResultId`、`toolName`、事实等级和引用边界。
- 详细事实通道，例如 `toolResults[].projection.model`。
- 有限业务事实、缺口字段和诊断 code。

`repairContext` 只在上一轮 action 被 deterministic validator 或 runtime 拒绝后出现，表达如何局部修正上一轮 action 所需的错误事实：

- `error.code`、`errors[].path`、`expected`、`actual`。
- `allowedFields`、`requiredFields`、`allowedValues`。
- duplicate 场景的 `previousToolResultId`、`previousSatisfied`、`factLevel` 和可复用引用边界。
- 当前可见 facts / resources，但不把它们派生成下一步 action 建议。

这样可以保留恢复能力，同时避免把正常事实输入和编排策略混在同一层。

### 5. 拆分 `routinePlanCompositionBoundary`

`routinePlanCompositionBoundary` 混合了可确定 section 覆盖和输出形态判断。实现时应删除该对象，或改成不带业务输出判断的事实对象，例如 `sectionCoverage`：

- `returnedSections`
- `availableSections`
- `sectionSummary`
- `missingSections`

字段名不再绑定 `routinePlan`，避免把 section coverage 误读成 routine / plan 选择规则。

### 6. `summarizeVisibleTrainingResourceCoverage` 改为纯 coverage helper

共享 helper 可以继续统一计算 section 覆盖，但不再返回 `supportsOutputKinds`。若仍需要复用函数，建议重命名或改类型为 `VisibleTrainingSectionCoverage`，只包含：

- `sectionSummary`
- `availableSections`
- `missingSections`

对历史可见方案读取来说，`hasSchedule` 可作为事实字段保留在 `read_recent` observation，但不应参与计算 output kind。

### 7. 测试按“禁止越界字段 + 保留事实字段”组织

回归测试重点不是证明某个固定用户短语会输出 `plan`，而是证明模型可见 observation 没有再告诉模型输出 kind 或下一步 action。测试需要覆盖：

- `searchExerciseResources.toModelObservation` 不包含 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport`、`nextActionHints`。
- `searchExerciseResources.toModelObservation` 仍包含动作事实、section coverage、`allowedSections`、查询条件和诊断。
- `inspectVisibleTrainingProposals(read_recent).toModelObservation` 不包含 `supportsOutputKinds` 或 `nextActionHints`，但保留导入事实、section coverage、`hasSchedule`。
- core ok tool result index observation 不包含 `finalAnswerSupport` 或 `nextActionHints`，但保留 `toolResultId`、事实等级、引用通道和 `modelFactsChannel`。
- duplicate tool input 的 `repairContext` 不包含 `nextActionHints`、`final_answer_with_current_tool_result`、`continue_tool_call`、`ask_user` 等下一步 action 枚举，但保留 previous result fact、错误路径和可恢复边界。
- manifest / prompt contract 测试不再断言 `supportsOutputKinds`。
- architecture boundary 确认未新增 `/api/chat` 关键词路由或 core 内具体业务 `toolName` 分支。

## Risks / Trade-offs

- Risk: spec 写成全局禁止但 tasks 只改业务 tool，会留下 core observation 继续暴露同类字段。Mitigation：本 change 明确纳入 `createOkToolResultIndexObservation` 和 duplicate repair context 的投影字段收敛，但不改 runtime 主循环或 action 合同。
- Risk: 移除 `nextActionHints` 后模型在事实不足时可能少一些恢复方向。Mitigation：保留 `diagnostics[]`、`missingSections`、`querySpecificity` 等确定性字段；非法 action 的修复仍通过 validator repair feedback 处理。
- Risk: 移除 `supportsOutputKinds` 后一些现有测试失败较多。Mitigation：这是预期合同变化，更新测试为断言禁止越界字段，并保留事实字段覆盖。
- Risk: `inspectVisibleTrainingProposals(read_recent)` 已导入历史完整方案，似乎能判断是否已有 `schedule`。Mitigation：只暴露 `hasSchedule` 或实际 `schedule` 事实，不暴露“可输出哪些 kind”的派生判断。
- Risk: 短期内真实模型仍可能偶发选错 `routine` / `plan`。Mitigation：本 change 不用服务端语义分流修复；后续如需增强，应在 output contract 或模型可见事实表达中补足稳定信息，不让 tool observation 替模型决策。

## Migration Plan

1. 修改 spec 和 tasks 后先验证 OpenSpec。
2. 更新 coverage helper 类型，移除 `supportsOutputKinds`。
3. 更新 core ok tool result index observation，删除 `finalAnswerSupport` 和 `nextActionHints`，保留索引、引用和事实通道。
4. 更新 duplicate tool input repair context，删除下一步 action 枚举，保留 previous result fact 和字段级错误。
5. 更新 `searchExerciseResources.toModelObservation`，删除业务满足度、输出 kind 和 next action hint 字段，保留纯事实字段。
6. 更新 `inspectVisibleTrainingProposals.toModelObservation`，删除输出 kind 和 next action hint 字段，保留导入事实、section coverage、`schedule` / `hasSchedule`。
7. 更新相关 tests，先断言越界字段不存在，再断言事实字段仍存在。
8. 运行最窄 tool-level、manifest / contract、architecture boundary、typecheck。

回滚策略：如果实现后发现模型缺少必要事实，不恢复 `supportsOutputKinds`；只补具体缺失事实字段或 output contract 说明，并保持“事实输入”和“业务决策”分层。

## Open Questions

无需要阻塞实现的问题。实现时需确认 `hasSchedule` 是否保留为独立事实字段，或只暴露完整 `schedule` 的安全摘要。
