## 1. OpenSpec 与治理边界

- [x] 1.1 使用 `agent-tool-change-governance` 确认本 change 属于 structured finalization / validator 执行合同清理，允许触碰 `visible-outputs` context、`visibleTrainingProposal` validator、finalization tool 调用 context、测试和文档。
- [x] 1.2 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认不修改 LangChain runtime 主循环、provider payload、`/api/chat`、production tool catalog 或服务端自然语言分流。
- [x] 1.3 运行 `openspec validate retire-visible-output-toolresult-context --strict`。

## 2. 旧 validator context 清理

- [x] 2.1 从 `lib/server/visible-outputs/contracts.ts` 删除 `VisibleOutputValidationToolResult` 类型和 `VisibleOutputValidationContext.toolResults` 字段。
- [x] 2.2 更新 `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`，删除从 `context.toolResults`、`projection.model.groups` 和 `fulfillment.satisfied` 收集当前 run 动作来源的逻辑。
- [x] 2.3 保留 `resourceStore.inventory()` 对 `visible_training_proposal_fact` consumable resource 的 provenance diagnostic 支持。
- [x] 2.4 更新 `submitVisibleTrainingProposal` finalization tool 调用 context，确认不再传入 `{ toolResults: [] }`。

## 3. 回归测试

- [x] 3.1 更新 `tests/visible-training-proposal-validator.test.ts`，删除旧 `VisibleOutputValidationToolResult` fixture 和 `satisfied` 参数。
- [x] 3.2 覆盖数据库合法但无 current-run resource source 时仍 accepted 且 metadata 包含 `current_run_source_missing`。
- [x] 3.3 覆盖 consumable `visible_training_proposal_fact` resource 可以消除对应动作项的 `current_run_source_missing` diagnostic。
- [x] 3.4 保留数据库不存在、未发布、section 不合法、routine 缺少 training、support section 缺失不 hard fail 等现有 hard boundary 测试。
- [x] 3.5 使用 `rg` 扫描生产 validator / finalization 相关代码，确认 `VisibleOutputValidationToolResult`、`context.toolResults` 和 `fulfillment.satisfied` 不再出现在当前实现路径。

## 4. 文档记录

- [x] 4.1 在 `docs/方案变更历史` 下新增本次清理记录，说明旧 tool result 满足度 context 为什么退出 validator 边界。
- [x] 4.2 在 `docs/项目演变历程.md` 末尾追加简短记录。

## 5. 验证与收尾

- [x] 5.1 运行 `openspec validate retire-visible-output-toolresult-context --strict`。
- [x] 5.2 运行 `npm test -- tests/visible-training-proposal-validator.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`。
- [x] 5.3 运行 `npm run typecheck`。
- [x] 5.4 检查 `git diff --name-status`，确认没有混入无关文件、无关格式化、高风险删除或当前未跟踪的其他 OpenSpec change。
