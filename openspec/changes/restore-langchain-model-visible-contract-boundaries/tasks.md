## 1. OpenSpec 与治理门禁

- [ ] 1.1 使用 `agent-tool-change-governance` 确认本 change 主类型为 LangChain runtime / wrapper 通用合同变更，允许触碰 LangChain tool wrapper、model-visible summary、tool description、finalization feedback、runtime duplicate input 反馈、trace summary 和相关测试。
- [ ] 1.2 使用 `agent-prompt-contract-governance` 对照 `docs/llm-prompt-guidance.md`，确认 system prompt、tool description、schema description、tool result summary 和失败反馈都放在正确层级。
- [ ] 1.3 使用 `agent-fix-abstraction-gate` 审查 proposal、design、spec 和后续 diff，确认没有把具体 trace、用户原话、业务 `toolName` 或字段组合升格成通用生产规则。
- [ ] 1.4 运行 `openspec validate restore-langchain-model-visible-contract-boundaries --strict`。

## 2. Tool model-visible summary 收口

- [ ] 2.1 更新 LangChain tool wrapper 或各 tool 的 `toModelVisibleSummary()`，删除模型可见 summary 中的 `fulfillment`、`satisfied`、`fulfillment.satisfied`。
- [ ] 2.2 删除 `visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary`、`supportsOutputKinds`、`nextActionHints`、`finalAnswerSupport`、`supportsSuccessfulVisibleOutputs` 或等价业务下一步指导字段。
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

- [ ] 5.1 在 LangChain runtime 或 tool execution 边界加入通用 duplicate input 检测，key 使用 `toolName + toolVersion + normalizedInputHash` 或等价稳定结构。
- [ ] 5.2 同一 run 内重复输入命中时，不重复执行 handler、不重复注册等价资源、不继续消耗 handler 预算。
- [ ] 5.3 duplicate input 反馈只表达“同参调用已产生过事实，重复调用不会产生新事实”和必要事实摘要，不包含业务下一步、固定 workflow、具体用户短语或具体业务 tool 语义分支。
- [ ] 5.4 确认 per-tool limit 和总预算仍作为安全熔断存在，但重复同参成功路径不会靠 20 多轮预算耗尽收场。
- [ ] 5.5 检查 runtime feedback code、trace event、测试名和文案不使用 `duplicate_tool_success`、`duplicate-success` 或其他暗示业务目标成功的命名；统一使用 `duplicate_tool_input`、`duplicate_input` 或等价中性命名。

## 6. Runtime / repair / trace 分层补强

- [ ] 6.1 确认 `ok=true` 且 `totalMatches=0`、空候选、空 `facts[]` 或候选不足 diagnostics 的 tool result 作为 current-run 事实材料进入模型可见边界，不被归类为 repair failure、terminal failure 或业务失败。
- [ ] 6.2 确认普通文本回答可以引用 0 条成功事实解释空结果；结构化训练交付是否失败只由 finalization tool / validator 判定。
- [ ] 6.3 收口 repair feedback、validator rejected feedback 和 duplicate input feedback，禁止 `nextActionHints`、`final_answer_with_visible_outputs`、`final_answer_without_visible_outputs`、`final_answer_with_current_tool_result`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举。
- [ ] 6.4 更新 LangChain trace summary / AI trace projection，区分 provider tool call、tool execution、tool result fact summary、duplicate input feedback、finalization / terminal validator、response projection。
- [ ] 6.5 trace 不得把中间 tool result 的候选数量、空结果、section coverage 或 diagnostics 记录为业务成功 / 失败；duplicate input trace 不使用 `success` / `satisfied` 命名。

## 7. 回归测试

- [ ] 7.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，断言 summary 不包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary` 或固定 workflow 文案。
- [ ] 7.2 更新 `tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts`，断言解析 tool summary 不包含业务满足度、`supportsOutputKinds` 或“下一步必须调用 search”的指导。
- [ ] 7.3 更新 `tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts`，断言空结果、成功结果和失败结果不包含 `fulfillment.satisfied`、`supportsOutputKinds`、固定 answer 模板或固定 tool flow。
- [ ] 7.4 更新 `tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`，断言 finalization accepted / rejected summary 只包含 validator 事实和 diagnostics，不包含补查流程或具体业务 tool 调用指令。
- [ ] 7.5 更新 prompt / production catalog 相关测试，断言默认 prompt、tool description、schema description 不包含固定 workflow、用户短句触发规则、下一步 action 枚举或具体业务 `toolName` 语义分支。
- [ ] 7.6 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖同一 run 内同 tool / 同 input 重复调用给出可恢复 duplicate input 反馈，handler 不重复执行，模型调用不耗尽到 `maxModelCalls`。
- [ ] 7.7 增加或更新普通文本建议回归：当用户请求普通训练建议且已有成功动作事实时，允许 `fitmate_final_response.content` 直接回答，不强制生成结构化训练卡片。
- [ ] 7.8 增加或更新结构化训练结果回归：当用户明确要求可见训练卡片、routine 或 plan 时，仍要求通过 finalization / validator，且不依赖服务端关键词分流。
- [ ] 7.9 增加或更新 0 条结果回归：`ok=true` 的 0 条动作查询或空历史事实可支撑普通文本解释，不进入 repair failure；若模型伪造结构化训练输出，失败归因到 finalization / validator。
- [ ] 7.10 增加或更新 trace 回归，断言 duplicate input trace 不使用 `duplicate_tool_success` / `duplicate-success`，并且 trace 区分 tool fact 与 final validator。

## 8. 验证与收尾

- [ ] 8.1 运行 `openspec validate restore-langchain-model-visible-contract-boundaries --strict`。
- [ ] 8.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`。
- [ ] 8.3 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts`。
- [ ] 8.4 如调整 production catalog、prompt builder、trace summary 或 structured final response 说明，运行对应 catalog / prompt / trace 测试。
- [ ] 8.5 运行 `npm run typecheck`。
- [ ] 8.6 使用 `rg` 扫描生产模型可见入口和测试快照，确认禁止项没有残留：`fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`nextActionHints`、`final_answer_with_visible_outputs`、`continue_tool_call`、固定 workflow 文案。
- [ ] 8.7 检查 `git diff --name-status`，确认没有混入无关代码、无关格式化、删除或重命名。
