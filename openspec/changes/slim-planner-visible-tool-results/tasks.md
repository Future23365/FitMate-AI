## 1. 合同边界确认

- [x] 1.1 复核 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 属于 core/runtime 的模型输入投影瘦身，不新增业务 tool、不修改 production 路由、不新增服务端语义分流。
- [x] 1.2 复核 `docs/llm-prompt-guidance.md` 的 Runtime Context、Tool Manifest、Validator、Repair Prompt 分层，确认本 change 只修改 Planner 可见 runtime context。
- [x] 1.3 检查当前 `redactToolResultForPlanner`、`PlannerPort`、`ModelActionCompletionInput` 和 `DeepSeekModelAdapter.createRequestBody()` 的真实输入链路，记录完整 `ToolResult` 当前如何进入模型输入。
- [x] 1.4 记录当前改前/改后字段边界：改前完整 `ToolResult` 只替换 `output`，改后 Planner 只移除无事实价值字段；字段说明至少覆盖 `projection.user`、`startedAt`、`completedAt`、`normalizedInputHash`、`idempotencyKey`、`toolCallId`、`toolVersion` 和 `output: "[redacted]"`。
- [x] 1.5 明确本 change 不删除或压缩完整 tool input、`projection.model` 业务事实、`fulfillment`、resource 引用、失败恢复信息或 repair details。

## 2. Planner 可见结果投影

- [x] 2.1 在 agent-core 合同中新增 `PlannerVisibleToolResult` 或等价类型，字段只移除 Planner 不需要理解的用户展示投影、执行元数据和占位 output。
- [x] 2.2 将 Planner 输入中的 `toolResults` 类型从完整 `ToolResult[]` 调整为 `PlannerVisibleToolResult[]`，覆盖 `PlannerPort`、runtime planner context 和相关 adapter 输入类型。
- [x] 2.3 将 `redactToolResultForPlanner` 改为低风险白名单投影函数，成功结果保留 `toolName`、`toolResultId`、`ok`、完整 `fulfillment` 和完整 `projection.model`。
- [x] 2.4 失败结果只允许移除执行元数据；必须保留完整 `error`、`fulfillment` 和 repair 恢复所需 details，不改变失败语义或 repair 行为。
- [x] 2.5 确认 `fulfillment.producedResources`、`fulfillment.consumedResources`、`fulfillment.unmetRequirements` 和 terminal grounding 需要的当前 run 引用在 Planner 输入中保持原样。
- [x] 2.6 确认 runtime 内部 `toolResults` 原始数组、`AgentRunResult`、trace、replay 和 renderer 仍使用完整 `ToolResult`，不得把瘦身投影反向写回原始结果。
- [x] 2.7 若某个被移除字段后来被证明影响 Planner 决策，先停止并另开 change 评估模型事实来源；不得在本 change 中恢复完整 `projection.user` 或继续裁剪 `projection.model`。

## 3. 范围排除检查

- [x] 3.1 确认本 change 不修改 `ToolRegistry.serializeForPlanner`、`toolToManifest`、manifest hardening、业务 tool `inputSchema` / `outputSchema`、`whenToUse`、`whenNotToUse` 或 examples。
- [x] 3.2 确认本 change 不修改 `visibleTrainingProposalOutputContract`、system prompt、output contract examples 或 prompt version。
- [x] 3.3 确认本 change 不修改 `terminal_reference_invalid`、repair feedback、repair prompt 或 Action Validator 的终态引用语义。
- [x] 3.4 扫描 `agent-core` 和 `/api/chat`，确认没有新增具体业务 `toolName` 分支、关键词路由、正则分流或用户自然语言语义改写。
- [x] 3.5 确认模型 tool calling 依赖的 `tools[]` manifest、`inputJsonSchema`、`whenToUse`、`whenNotToUse` 和 examples 在模型可见输入中保持不变。

## 4. 测试

- [x] 4.1 新增或更新 Agent runtime / planner input 单测，断言 Planner 输入保留完整 `projection.model`，且不包含 `projection.user`、`output: "[redacted]"`、`toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt`、`completedAt`。
- [x] 4.2 新增或更新测试，断言 `AgentRunResult` 或 trace / renderer 可用路径仍保留完整 tool result 用户展示投影和执行证据。
- [x] 4.3 新增或更新失败 tool result 投影测试，确认完整 `error`、`fulfillment` 和恢复 details 可见，但执行元数据、用户投影和时间戳不可见。
- [x] 4.4 新增或更新测试，断言 Planner 输入瘦身后 `tools[]` manifest 内容和数量不因本 change 改变。
- [x] 4.5 新增或更新测试，断言 `fulfillment.producedResources`、`fulfillment.consumedResources`、`fulfillment.unmetRequirements` 和 terminal grounding 引用仍保留。
- [x] 4.6 新增或更新测试或 trace 断言，记录 `toolResults` 稳定序列化字符数变化；至少证明不再重复发送 `projection.user`、执行元数据和占位 output。
- [x] 4.7 运行最窄相关测试：`npm test -- tests/agent-core/runtime-hardening.test.ts tests/agent-core/redaction-observation-trace.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [x] 4.8 如类型边界影响范围超过上述测试，按需运行 `npm test -- tests/agent-core/contract-helper.test.ts tests/agent-core/tool-registry-manifest.test.ts`。

## 5. 验证与收尾

- [x] 5.1 运行 `openspec validate slim-planner-visible-tool-results --strict`。
- [x] 5.2 运行 `npm run typecheck`。
- [x] 5.3 用当前或新增 trace 断言记录优化前后 Planner 输入中 `toolResults` 字符数变化，至少确认不再重复发送 `projection.user`、执行元数据和占位 output。
- [x] 5.4 在收尾说明中明确：本 change 未压缩 manifest / system / output contract，也未压缩完整 input、`projection.model`、resource 引用或失败恢复信息；如需要继续压缩这些字段，应另开 change。
- [x] 5.5 提交前运行 `git diff --check`，并确认 diff 只包含本 change 允许触碰的 OpenSpec、agent-core 类型 / runtime 投影和相关测试。
