## Why

详细 LLM 黑盒套件已经能覆盖真实首页聊天链路，但当前 53 个三轮 flow 中存在严格重复和高重叠用例，日常排查需要一次性承担 159 轮真实模型调用成本。现在需要把详细套件从“持续堆用例”调整为可分层、可筛选、可并发但仍可诊断的回归体系，降低人工迭代成本并保留关键覆盖。

## What Changes

- 梳理详细套件中的重复与高重叠 flow，明确哪些用例应合并、改写、保留为基础 smoke，哪些应只在特定分组中运行。
- 为详细 LLM 黑盒测试增加可筛选执行能力，支持按 flow id、能力分组、最近失败报告等方式运行子集。
- 为 suite 定义稳定分层：基础冒烟、详细核心回归、边界/高风险扩展、失败重跑子集，避免每次调试都运行完整 159 轮。
- 引入受控的 flow 级并发策略：同一 flow 内继续串行保持多轮上下文，不同 flow 在显式配置后可并发运行，并保持报告顺序稳定。
- 强化报告中的覆盖摘要和去重说明，使报告能说明本次运行覆盖了哪些能力、跳过了哪些分组、是否存在 fixture 重复。
- 修正 runner 脚本中的硬编码套件规模，避免 fixture 变更后 token 预估、跳过报告和控制台摘要继续显示旧数量。
- 保持真实模型测试与普通 `npm run test` 隔离；不引入 mock、旧快照或非真实模型替代。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `manual-llm-consistency-tests`: 手动 LLM 黑盒测试需要支持详细套件去重治理、分层运行、按子集筛选、受控并发和动态报告规模统计。

## Impact

- 影响 `manual-tests/llm/flow-fixtures.ts` 中详细套件 fixture 的组织、去重和分组元数据。
- 影响 `manual-tests/llm/llm-consistency.test.ts` 的 flow 选择、运行顺序、并发控制和报告记录。
- 影响 `scripts/run-manual-llm-tests.mjs` 的命令参数、动态套件规模、token 预估和控制台摘要。
- 影响 `docs/manual-llm-consistency-tests.md`、`docs/方案变更历史/**` 和 `docs/项目演变历程.md` 中关于 LLM 黑盒测试运行方式与成本边界的说明。
- 不改变生产 API 契约、数据库 schema、AI 输出 schema、首页聊天用户流程或默认普通测试入口。
