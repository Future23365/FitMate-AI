## Why

基础 LLM 黑盒测试当前从 `docs/LLM基础测试用例.md` 的 Markdown 表格读取用例，导致执行数据和人工说明文档混在一起，也让轮次数量被固定为三轮。测试用例应迁移到结构化 JSON fixture，便于配置、校验、筛选和后续扩展自动断言。

## What Changes

- 新增基础 LLM 黑盒测试的 JSON fixture 文件，作为默认执行用例来源。
- 将基础黑盒 runner 从固定三轮 Markdown 表格解析调整为读取 JSON 中的 `flows[].turns[]`，轮次数由 fixture 配置决定。
- 保留 `--flow` 筛选能力，继续按 flow id 执行部分用例。
- 更新测试说明文档，明确 Markdown 文档不再作为执行用例来源。
- 更新普通自动化测试，覆盖 JSON fixture 解析、结构校验、可变轮次和报告渲染合同。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `testing-workflow`: 基础 LLM 黑盒测试 MUST 使用结构化 JSON fixture 作为默认用例来源，并支持每个 flow 配置可变轮次。

## Impact

- 影响 `manual-tests/llm/basic-chat-fixtures.ts` 的 fixture 读取与解析逻辑。
- 影响 `manual-tests/llm/basic-chat-runner.ts` 的 flow 执行循环、跳过逻辑和报告统计。
- 影响 `tests/manual-llm-basic-blackbox.test.ts` 中关于用例来源和轮次数量的测试。
- 新增 `manual-tests/llm/fixtures/basic-chat-blackbox-cases.json` 作为结构化用例文件。
- 更新 `docs/manual-llm-basic-blackbox-tests.md` 中的手动黑盒测试说明。
