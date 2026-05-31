## Why

现有 `npm run test:llm` 已经能跑首页聊天基础黑盒流程，但它只覆盖 9 个高频冒烟用例。根目录 `LLM完整测试.md` 已经把首页功能拆成更完整的能力域，现在需要把其中的详细场景落到可执行测试入口，同时保留 `npm run test` 的原有基准测试行为。

这里的“完整测试”指显式成本更高、覆盖面更广的详细 LLM 黑盒套件，不等同于默认测试，也不等同于一次性把 `LLM完整测试.md` 中所有人工验收项都自动化。基础测试继续承担快速冒烟职责，完整测试承担更广的首页聊天流程回归职责。

## What Changes

- 新增 `npm run test --detail` 入口，用于显式运行详细 LLM 首页聊天黑盒测试。
- 保留 `npm run test` 不带参数时的原有 Vitest 基准测试行为。
- 保留 `npm run test:llm` 作为现有基础 LLM 黑盒测试入口。
- 扩展 `manual-tests/llm/flow-fixtures.ts`，把基础 9 个流程和详细流程分成两个套件。
- 详细套件覆盖基础回复、动作推荐、routine、plan、多轮上下文、引用修改、安全边界和输出质量等能力域。
- 详细套件生成独立报告 `docs/manual-llm-blackbox-flow-detail-latest-report.md`，避免覆盖基础报告。
- 文档必须明确基础测试和完整测试的适用场景、成本边界、报告路径和覆盖差异，避免把基础 9 流程通过误读为完整 LLM 回归通过。
- 本 change 只增加详细模式入口和首版详细 fixture；更真实地走 `/api/chat` HTTP 层、真实会话保存、真实 artifact 索引读取，以及更细的语义断言，作为后续改进方向记录，不在本 change 中实现。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `manual-llm-consistency-tests`: 手动 LLM 测试必须支持基础套件和详细套件，详细套件通过 `npm run test --detail` 触发。

## Impact

- 影响 `package.json` 的 `test` 脚本。
- 新增 `scripts/run-tests.mjs` 作为测试入口分流器。
- 影响 `scripts/run-manual-llm-tests.mjs`、`manual-tests/llm/flow-fixtures.ts`、`manual-tests/llm/llm-consistency.test.ts`。
- 影响 LLM 测试说明文档和测试报告路径。
- 不改变业务 API、数据库结构、前端页面、AI 输出 schema 或默认 `npm run test` 的基准测试集合。

## Non-Goals

- 不把 `npm run test` 改成真实模型测试入口。
- 不让 `npm run test:llm` 自动升级为完整测试；基础测试必须保持低轮次冒烟定位。
- 不在本 change 中把 `LLM完整测试.md` 的所有流程、人工 UI 验收项或未来语义断言全部自动化。
- 不在本 change 中重写 runner 为真实 HTTP + 数据库持久化链路；当前详细模式仍以服务端聊天编排黑盒为主。
