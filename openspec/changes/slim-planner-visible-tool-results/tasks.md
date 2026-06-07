## 1. 合同边界确认

- [ ] 1.1 复核 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 属于 core/runtime 的模型输入投影瘦身，不新增业务 tool、不修改 production 路由、不新增服务端语义分流。
- [ ] 1.2 复核 `docs/llm-prompt-guidance.md` 的 Runtime Context、Tool Manifest、Validator、Repair Prompt 分层，确认本 change 只修改 Planner 可见 runtime context。
- [ ] 1.3 检查当前 `redactToolResultForPlanner`、`PlannerPort`、`ModelActionCompletionInput` 和 `DeepSeekModelAdapter.createRequestBody()` 的真实输入链路，记录完整 `ToolResult` 当前如何进入模型输入。

## 2. Planner 可见结果投影

- [ ] 2.1 在 agent-core 合同中新增 `PlannerVisibleToolResult` 或等价类型，字段只覆盖 Planner 下一步决策、grounding 和安全恢复需要。
- [ ] 2.2 将 Planner 输入中的 `toolResults` 类型从完整 `ToolResult[]` 调整为 `PlannerVisibleToolResult[]`，覆盖 `PlannerPort`、runtime planner context 和相关 adapter 输入类型。
- [ ] 2.3 将 `redactToolResultForPlanner` 改为白名单投影函数，成功结果只保留 `toolName`、`toolResultId`、`ok`、`fulfillment`、`projection.model` 和必要 resource 引用。
- [ ] 2.4 为失败结果定义安全瘦身投影，保留错误码、retryable、必要安全 details、fulfillment 和可用 `projection.model`，不改变失败语义或 repair 行为。
- [ ] 2.5 确认 runtime 内部 `toolResults` 原始数组、`AgentRunResult`、trace、replay 和 renderer 仍使用完整 `ToolResult`，不得把瘦身投影反向写回原始结果。

## 3. 范围排除检查

- [ ] 3.1 确认本 change 不修改 `ToolRegistry.serializeForPlanner`、`toolToManifest`、manifest hardening、业务 tool `inputSchema` / `outputSchema`、`whenToUse`、`whenNotToUse` 或 examples。
- [ ] 3.2 确认本 change 不修改 `visibleTrainingProposalOutputContract`、system prompt、output contract examples 或 prompt version。
- [ ] 3.3 确认本 change 不修改 `terminal_reference_invalid`、repair feedback、repair prompt 或 Action Validator 的终态引用语义。
- [ ] 3.4 扫描 `agent-core` 和 `/api/chat`，确认没有新增具体业务 `toolName` 分支、关键词路由、正则分流或用户自然语言语义改写。

## 4. 测试

- [ ] 4.1 新增或更新 Agent runtime / planner input 单测，断言 Planner 输入保留 `projection.model`，且不包含 `projection.user`、完整 `input`、`output: "[redacted]"`、`toolCallId`、`toolVersion`、`normalizedInputHash`、`startedAt`、`completedAt`。
- [ ] 4.2 新增或更新测试，断言 `AgentRunResult` 或 trace / renderer 可用路径仍保留完整 tool result 用户展示投影和执行证据。
- [ ] 4.3 新增或更新失败 tool result 投影测试，确认失败码、retryable、fulfillment summary 可见，但完整 output、完整 input、用户投影和时间戳不可见。
- [ ] 4.4 运行最窄相关测试：`npm test -- tests/agent-core/runtime-hardening.test.ts tests/agent-core/redaction-observation-trace.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [ ] 4.5 如类型边界影响范围超过上述测试，按需运行 `npm test -- tests/agent-core/contract-helper.test.ts tests/agent-core/tool-registry-manifest.test.ts`。

## 5. 验证与收尾

- [ ] 5.1 运行 `openspec validate slim-planner-visible-tool-results --strict`。
- [ ] 5.2 运行 `npm run typecheck`。
- [ ] 5.3 用当前或新增 trace 断言记录优化前后 Planner 输入中 `toolResults` 字符数变化，至少确认不再重复发送 `projection.user` 和执行元数据。
- [ ] 5.4 提交前运行 `git diff --check`，并确认 diff 只包含本 change 允许触碰的 OpenSpec、agent-core 类型 / runtime 投影和相关测试。
