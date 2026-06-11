## 1. OpenSpec 与治理门禁

- [ ] 1.1 使用 `agent-tool-change-governance` 确认本 change 主类型为 LangChain runtime / wrapper 通用合同变更，允许触碰 LangChain tool wrapper、model-visible summary、tool description、finalization feedback、runtime duplicate-success 反馈和相关测试。
- [ ] 1.2 使用 `agent-prompt-contract-governance` 对照 `docs/llm-prompt-guidance.md`，确认 system prompt、tool description、schema description、tool result summary 和失败反馈都放在正确层级。
- [ ] 1.3 使用 `agent-fix-abstraction-gate` 审查 proposal、design、spec 和后续 diff，确认没有把具体 trace、用户原话、业务 `toolName` 或字段组合升格成通用生产规则。
- [ ] 1.4 运行 `openspec validate restore-langchain-model-visible-contract-boundaries --strict`。

## 2. Tool model-visible summary 收口

- [ ] 2.1 更新 LangChain tool wrapper 或各 tool 的 `toModelVisibleSummary()`，删除模型可见 summary 中的 `fulfillment`、`satisfied`、`fulfillment.satisfied`。
- [ ] 2.2 删除 `visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary`、`nextActionHints`、`finalAnswerSupport`、`supportsSuccessfulVisibleOutputs` 或等价业务下一步指导字段。
- [ ] 2.3 确认 `resolveExerciseResourceMentions` 的模型可见 summary 只表达解析事实、候选状态、有限动作摘要和 diagnostics，不表达业务目标满足度或下一步必须调用 `searchExerciseResources`。
- [ ] 2.4 确认 `inspectVisibleTrainingProposals` 的模型可见 summary 只表达历史可见训练事实状态、事实列表、空结果和 diagnostics，不表达业务目标满足度、固定 answer 模板或固定 tool flow。
- [ ] 2.5 确认 `submitVisibleTrainingProposal` 的 accepted / rejected summary 只表达 validator 事实、accepted / rejected 状态、错误 code、path、expected / actual / allowedValues 和 section coverage，不指导模型补查特定业务 tool。

## 3. `searchExerciseResources` 事实边界

- [ ] 3.1 将 `searchExerciseResources` model-visible summary 收口为 `query`、`filters`、`groups`、`sectionSummary`、`availableSections`、`missingSections`、`diagnostics`、`totalMatches`、`returnedCount`、`truncated` 等事实字段。
- [ ] 3.2 调整 broad query / warmup-only / stretch-only / 0 条结果的 model-visible summary，不再用 `fulfillment.satisfied=false` 表达业务不满足；只表达查询口径、命中情况、section 覆盖和可恢复 diagnostics。
- [ ] 3.3 删除 `searchExerciseResources` description / schema description / summary 中“缺少 warmup 或 stretch 应继续查询”“若要交付应通过结构化收口工具”“本结果不是 visible output”这类固定 workflow 或交付指导文案。
- [ ] 3.4 保留 `groups.<section>`、`allowedSections`、section coverage 的事实解释，但不得要求模型按固定顺序补齐 section。

## 4. Prompt 与 finalization 合同

- [ ] 4.1 收口默认 LangChain system prompt：普通文本建议、解释、筛选结果说明可以基于成功事实直接通过 `fitmate_final_response.content` 回答。
- [ ] 4.2 默认 system prompt 只用短规则表达结构化训练结果必须经当前可见 finalization / validator，不能包含 `visibleTrainingProposal` 完整 payload 结构、固定 `payload.kind` 选择规则或具体业务 tool 调用流程。
- [ ] 4.3 收口所有 LangChain tool description / schema description，使其只描述能力、输入来源、输出事实和确定性边界，不写完整 workflow。
- [ ] 4.4 收口 `submitVisibleTrainingProposal` description / schema description，只描述 finalization 能力、输入结构、accepted / rejected 含义和 validator 边界，不指导补查 warmup / stretch / training。
- [ ] 4.5 检查模型可见描述性自然语言默认使用中文，技术标识如 `toolName`、字段名、enum、schema id 保持英文原样。

## 5. Runtime 重复同参成功调用反馈

- [ ] 5.1 在 LangChain runtime 或 tool execution 边界加入通用 duplicate-success 检测，key 使用 `toolName + toolVersion + normalizedInputHash` 或等价稳定结构。
- [ ] 5.2 同一 run 内重复成功输入命中时，不重复执行 handler、不重复注册等价资源、不继续消耗 handler 预算。
- [ ] 5.3 duplicate-success 反馈只表达“同参调用已产生过成功事实，重复调用不会产生新事实”和必要事实摘要，不包含业务下一步、固定 workflow、具体用户短语或具体业务 tool 语义分支。
- [ ] 5.4 确认 per-tool limit 和总预算仍作为安全熔断存在，但重复同参成功路径不会靠 20 多轮预算耗尽收场。

## 6. 回归测试

- [ ] 6.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，断言 summary 不包含 `fulfillment`、`satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary` 或固定 workflow 文案。
- [ ] 6.2 更新 `tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts`，断言解析 tool summary 不包含业务满足度或“下一步必须调用 search”的指导。
- [ ] 6.3 更新 `tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts`，断言空结果、成功结果和失败结果不包含 `fulfillment.satisfied`、固定 answer 模板或固定 tool flow。
- [ ] 6.4 更新 `tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`，断言 finalization accepted / rejected summary 只包含 validator 事实和 diagnostics，不包含补查流程或具体业务 tool 调用指令。
- [ ] 6.5 更新 prompt / production catalog 相关测试，断言默认 prompt、tool description、schema description 不包含固定 workflow、用户短句触发规则或具体业务 `toolName` 语义分支。
- [ ] 6.6 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖同一 run 内同 tool / 同 input 重复成功调用给出可恢复 duplicate-success 反馈，handler 不重复执行，模型调用不耗尽到 `maxModelCalls`。
- [ ] 6.7 增加或更新普通文本建议回归：当用户请求普通训练建议且已有成功动作事实时，允许 `fitmate_final_response.content` 直接回答，不强制生成结构化训练卡片。
- [ ] 6.8 增加或更新结构化训练结果回归：当用户明确要求可见训练卡片、routine 或 plan 时，仍要求通过 finalization / validator，且不依赖服务端关键词分流。

## 7. 验证与收尾

- [ ] 7.1 运行 `openspec validate restore-langchain-model-visible-contract-boundaries --strict`。
- [ ] 7.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`。
- [ ] 7.3 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts`。
- [ ] 7.4 如调整 production catalog、prompt builder 或 structured final response 说明，运行对应 catalog / prompt 测试。
- [ ] 7.5 运行 `npm run typecheck`。
- [ ] 7.6 使用 `rg` 扫描生产模型可见入口和测试快照，确认禁止项没有残留：`fulfillment`、`satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`nextActionHints`、固定 workflow 文案。
- [ ] 7.7 检查 `git diff --name-status`，确认没有混入无关代码、无关格式化、删除或重命名。
