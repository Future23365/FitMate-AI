## 1. 合同与边界确认

- [x] 1.1 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认本 change 没有把具体用户原话、trace 个例、`toolName` 或字段组合升格成生产语义规则。
- [x] 1.2 对照 `docs/agent-tool-orchestrator-design.md` 第 13、17、24、25、26 节，确认允许触碰范围只包含业务 tool projection、共享 coverage helper、core observation / repair 投影字段、模型可见 observation 测试和 OpenSpec 文档。
- [x] 1.3 对照 `docs/llm-prompt-guidance.md`，确认 `toModelObservation` 属于 Runtime Context / Tool Manifest 的事实投影层，不承担 Planner Policy、Output Contract 或 Validator 职责。
- [x] 1.4 最终 diff 检查确认没有新增 `/api/chat` 关键词路由、服务端自然语言模板分流、具体业务 `toolName` 语义分支或基于用户原文改写 `payload.kind` 的逻辑。

## 2. 共享覆盖摘要收敛

- [x] 2.1 将 `lib/server/visible-training-proposals/visible-training-resource-coverage.ts` 从“输出 kind 支持”摘要改为纯 section coverage 摘要，移除 `supportsOutputKinds`。
- [x] 2.2 将 coverage 输出字段收敛为 `sectionSummary`、`availableSections`、`missingSections` 或等价确定性事实字段；如需兼容当前命名，避免字段名继续暗示 `routine` / `plan` 业务选择。
- [x] 2.3 更新所有调用方，禁止通过共享 helper 派生 `exercise_selection`、`routine` 或 `plan` 可行性列表。

## 3. core observation / repairContext 分层

- [x] 3.1 更新 `lib/server/agent-core/observation.ts` 的 ok tool result index observation，移除 `finalAnswerSupport` 和 `nextActionHints`，保留 `toolResultId`、`toolName`、`fulfillment` 轻量事实、`factLevel`、`terminalUsedRef`、`modelFactsChannel` 和 `factSource`。
- [x] 3.2 更新 `lib/server/agent-core/observation.ts` 的 duplicate tool input observation，避免在 observation details 中输出 `nextActionHints` 或等价 action 枚举；保留 duplicate 错误 code、`previousToolResultId`、`previousSatisfied`、`repeatCount` 和 previous result fact。
- [x] 3.3 更新 `lib/server/agent-core/runtime.ts` 中 duplicate tool input repair context 的 facts，移除 `nextActionHints`、`finalAnswerSupport`、`final_answer_with_current_tool_result`、`continue_tool_call`、`ask_user` 等下一步 action 建议，保留字段级错误、previous result fact、可复用引用和可恢复边界。
- [x] 3.4 确认本 change 不修改 Agent runtime 主循环、`PlannerPort`、Executor、repair budget、重复 tool input 判定逻辑或允许 action 集合。

## 4. searchExerciseResources observation 收敛

- [x] 4.1 更新 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 `toModelObservation`，移除 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport`、`nextActionHints` 和 `routinePlanCompositionBoundary` 中的同类字段。
- [x] 4.2 保留并测试确定性事实字段：查询条件、`totalMatches`、`returnedCount`、`truncated`、`appliedFilters`、`filterSemantics`、`sectionSummary`、`availableSections`、缺失 section 事实、`groups.<section>.exercises[]`、`allowedSections` 和 `diagnostics[]`。
- [x] 4.3 确认 `handler`、repository 下推查询、facet 映射、`toUserProjection` 和用户可见投影不因本 change 改变业务查询行为。

## 5. inspectVisibleTrainingProposals observation 收敛

- [x] 5.1 更新 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 `read_recent` observation，移除 `supportsOutputKinds` 和 `nextActionHints`。
- [x] 5.2 保留导入事实边界：`visible_training_proposal_fact`、resource role、可复用 `exerciseItems`、section coverage、`schedule` 或 `hasSchedule` 的事实摘要。
- [x] 5.3 确认 `list_recent` 仍只返回轻量索引，`read_recent.ref.value` 仍只能来自本轮 `list_recent` 返回的真实 `factRef` / `messageId`。

## 6. 测试更新

- [x] 6.1 更新 `tests/agent-tools/search-exercise-resources.test.ts`，断言 model observation 不包含 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport`、`nextActionHints`，并断言动作事实和 section coverage 仍保留。
- [x] 6.2 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，断言 `read_recent` observation 不包含输出 kind 可行性或下一步 action hints，并保留导入事实、section coverage、`schedule` / `hasSchedule`。
- [x] 6.3 更新 `tests/agent-core/contract-helper.test.ts`、`tests/agent-core/runtime-hardening.test.ts`、`tests/agent-core/fixture-e2e.test.ts`、`tests/agent-core/redaction-observation-trace.test.ts` 或相关 prompt / observation 测试，断言 ok tool result index observation 和 duplicate repair context 不再包含 `nextActionHints`、`finalAnswerSupport` 或下一步 action 枚举，同时保留引用、事实等级和 previous result fact。
- [x] 6.4 更新 `tests/agent-core/tool-registry-manifest.test.ts` 或相关 manifest / schema summary 测试，移除对 `supportsOutputKinds` 和 `nextActionHints` 的正向断言。
- [x] 6.5 增加一个等价语义回归测试：用户要求周期训练或每周频次时，模型可见 observation 不再通过 tool result 暗示只能输出 `routine`；测试重点断言模型输入合同，不依赖真实 LLM 稳定输出。
- [x] 6.6 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts tests/agent-tools/inspect-visible-training-proposals.test.ts`。
- [x] 6.7 运行 `npm test -- tests/agent-core/contract-helper.test.ts tests/agent-core/runtime-hardening.test.ts tests/agent-core/fixture-e2e.test.ts tests/agent-core/redaction-observation-trace.test.ts tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 6.8 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 6.9 运行 `npm run typecheck`。

## 7. OpenSpec 与收尾验证

- [x] 7.1 运行 `openspec validate remove-tool-observation-decision-hints --strict`。
- [x] 7.2 实现完成后检查 `rg -n "supportsOutputKinds|supportsSuccessfulVisibleOutputs|finalAnswerSupport|nextActionHints|routinePlanCompositionBoundary|final_answer_with_current_tool_result|continue_tool_call|ask_user" lib/server tests openspec/changes/remove-tool-observation-decision-hints`，确认生产模型可见 observation / repairContext 不再暴露越界字段，测试或 spec 中的残留只用于禁止断言或历史迁移说明。
- [x] 7.3 最终说明未运行或失败的验证命令、剩余风险，以及是否仍存在旧导出日志无法反映新合同的问题。
