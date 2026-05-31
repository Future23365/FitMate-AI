## Why

现有 `npm run test:llm` 已经能跑首页聊天基础黑盒流程，但它只覆盖 9 个高频冒烟用例。根目录 `LLM完整测试.md` 已经把首页功能拆成更完整的能力域，现在需要把其中的详细场景落到可执行测试入口，同时保留 `npm run test` 的原有基准测试行为。

## What Changes

- 新增 `npm run test --detail` 入口，用于显式运行详细 LLM 首页聊天黑盒测试。
- 保留 `npm run test` 不带参数时的原有 Vitest 基准测试行为。
- 保留 `npm run test:llm` 作为现有基础 LLM 黑盒测试入口。
- 扩展 `manual-tests/llm/flow-fixtures.ts`，把基础 9 个流程和详细流程分成两个套件。
- 详细套件覆盖基础回复、动作推荐、routine、plan、多轮上下文、引用修改、安全边界和输出质量等能力域。
- 详细套件生成独立报告 `docs/manual-llm-blackbox-flow-detail-latest-report.md`，避免覆盖基础报告。

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
