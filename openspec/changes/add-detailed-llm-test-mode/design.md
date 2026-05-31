## 设计说明

本次调整把“默认基准测试”和“真实 LLM 详细黑盒测试”放在同一个 `npm run test` 命令族下，但通过显式参数隔离成本和外部依赖。

设计取舍：

- `npm run test` 不带参数仍运行普通 Vitest 基准测试，避免缺少 `DEEPSEEK_API_KEY`、模型网络或 token 成本影响日常验证。
- `npm run test --detail` 通过 `scripts/run-tests.mjs` 分流到 `scripts/run-manual-llm-tests.mjs --detail`，只有用户显式要求详细模式才进入真实模型黑盒流程。
- `npm run test:llm` 继续运行基础 9 流程，兼容已有手动 LLM 验收习惯。
- `manual-tests/llm/flow-fixtures.ts` 作为测试事实源，保留 `basicBlackboxFlowCases`，新增 `detailedBlackboxFlowCases`，并通过 `getBlackboxFlowCases()` 选择套件。
- 详细套件仍只断言用户可见文本、内部字段泄漏和卡片类型；复杂语义边界先记录在 `note` 和报告里，避免真实模型措辞波动导致过多误报。
- 详细套件写入独立报告，基础报告和详细报告互不覆盖。

详细套件首版不把 `LLM完整测试.md` 的所有人工验收项都自动化。UI 输入焦点、流式展示、卡片视觉、滚动和错误提示仍属于人工或浏览器验收；本次只覆盖服务端首页聊天黑盒流程。

## 风险与缓解

- 真实模型详细套件 token 成本显著高于基础套件。通过 `--detail` 显式触发、运行前 token 预估和独立报告降低误运行风险。
- `npm run test` 从直接 `vitest run` 改成 Node 分流器，可能影响带参数执行。分流器会把非 `--detail` 参数原样传给 Vitest，保留 `npm run test -- tests/xxx.test.ts` 的用法。
- 详细流程数量增加后，真实运行耗时更长。缺 key 时仍快速跳过并生成跳过报告，真实运行由用户明确控制。
