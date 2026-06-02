## 1. Change 文档

- [x] 1.1 新增 `add-detailed-llm-test-mode` OpenSpec change。
- [x] 1.2 补充 proposal、design、spec 和 tasks。

## 2. 测试入口分流

- [x] 2.1 新增 `scripts/run-tests.mjs`，让 `npm run test` 默认转发到原有 Vitest 基准测试。
- [x] 2.2 支持 `npm run test --detail` 分流到详细 LLM 黑盒测试。
- [x] 2.3 保留 `npm run test:llm` 基础 LLM 黑盒入口。

## 3. 详细 LLM 流程

- [x] 3.1 将基础流程显式命名为 `basicBlackboxFlowCases`。
- [x] 3.2 新增 `detailedBlackboxFlowCases`，覆盖基础回复、动作推荐、routine、plan、多轮上下文、引用修改、安全边界和输出质量。
- [x] 3.3 让 LLM Vitest 文件根据 `MANUAL_LLM_FLOW_SUITE` 选择基础或详细套件。
- [x] 3.4 详细套件写入独立报告路径。

## 4. 文档与验证

- [x] 4.1 更新手动 LLM 测试说明文档。
- [x] 4.2 在 `docs/方案变更历史` 记录本次测试入口和详细套件调整。
- [x] 4.3 在 `docs/项目演变历程.md` 追加本次测试体系调整摘要。
- [x] 4.4 运行 `npm run test -- tests/manual-llm-flow-policy.test.ts`。
- [x] 4.5 运行 `npm run typecheck`。
- [x] 4.6 运行 `openspec validate add-detailed-llm-test-mode --strict`。
- [x] 4.7 运行 `DEEPSEEK_API_KEY= npm run test --detail` 验证缺 key 详细套件跳过报告。

## 5. 复审后文档补充

- [x] 5.1 补充基础测试与完整/详细测试的边界，明确 `npm run test:llm` 只代表基础冒烟，`npm run test --detail` 才代表完整/详细回归。
- [x] 5.2 补充详细套件首版覆盖边界，说明它覆盖 `LLM完整测试.md` 的主要能力域，但不等同于所有流程和人工 UI 验收项已经自动化。
- [x] 5.3 记录后续改进方向：更贴近 `/api/chat` 的 HTTP/API runner、真实会话保存、数据库 artifact 索引读取、更细的语义断言和基于真实报告校准 token 预估。
