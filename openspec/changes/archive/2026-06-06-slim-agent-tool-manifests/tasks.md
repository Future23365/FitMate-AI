## 1. 边界与 OpenSpec

- [x] 1.1 使用 `agent-prompt-contract-governance` 完成本次模型可见合同边界确认，范围限定为 prompt config、tool manifest、schema description、examples 和测试。
- [x] 1.2 使用 Agent 修复抽象层级门禁审查，确认具体业务 tool 名只进入 tool manifest、schema description、resource contract 或测试，不进入通用 prompt 触发规则。
- [x] 1.3 运行 `openspec validate slim-agent-tool-manifests --strict`。

## 2. 通用 ToolExample / Manifest 合同

- [x] 2.1 调整 `ToolExample` 类型，使 production manifest examples 使用完整 `AgentAction` tool_call 形态。
- [x] 2.2 更新 `toolToManifest()`、snapshot / hash / redaction / hardening，使 example action 被安全序列化和 lint。
- [x] 2.3 更新 fixture tools 与通用 manifest tests，验证 examples 不再只暴露裸 input。

## 3. actionContract 分层

- [x] 3.1 在集中 prompt config 的 `actionContract` 中补充 tool result、resource glossary、版本 glossary 和全局 grounding 禁止项。
- [x] 3.2 在 `actionContract.referencePolicy` 中表达 `requiredExerciseIds` / `excludeExerciseIds` 的正负锚点策略，不写固定短语触发规则。
- [x] 3.3 更新 prompt config tests，断言 glossary 和完整 tool_call examples 可见。

## 4. 业务 Tool Manifest 瘦身

- [x] 4.1 瘦身 `inspectVisibleTrainingProposals` 模型可见说明，保留 `list_recent` / `read_recent`、ref 来源、consumable resource 和 `usedRefs` 区分。
- [x] 4.2 瘦身 `resolveExerciseResourceMentions` 模型可见说明，保留点名动作解析、`requiredExerciseIds` 衔接、ambiguous / not_found / 不能直接写训练结构边界。
- [x] 4.3 瘦身 `searchExerciseResources` 模型可见说明，保留发布态动作事实、`groups.<section>.exercises[]`、facet、canonical `no_equipment`、过宽查询和 section-scoped 消费边界。
- [x] 4.4 将三个 tool 的 examples 全部改为完整 `tool_call` action。

## 5. 回归验证

- [x] 5.1 更新 production registry / manifest tests，断言三个业务 tool examples 都是完整 `tool_call` action。
- [x] 5.2 更新测试，断言 `searchExerciseResources` 模型可见 manifest/examples 不推荐 `"无器械"` 作为 tool input 值。
- [x] 5.3 更新测试，断言 manifest 不把全局禁止项重复塞进每个业务 tool 的 `whenNotToUse`。
- [x] 5.4 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-core/tool-registry-manifest.test.ts tests/agent-core/manifest-hardening.test.ts tests/agent-core/contract-helper.test.ts`。
- [x] 5.5 运行 `npm run typecheck`，或说明无法运行原因。

## 6. 收尾

- [x] 6.1 检查 diff，确认未修改 tool handler、runtime 主循环、Policy Guard、ResourceStore、Response Renderer、`/api/chat` 语义分流。
- [x] 6.2 完成任务 checklist 并说明验证结果。
