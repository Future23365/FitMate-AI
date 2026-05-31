## Why

`add-detailed-llm-test-mode` 已经把基础测试和完整/详细测试入口分开，但当前完整测试仍主要证明“能回答、能推正确卡片类型”。它还没有充分验证真实首页请求链路、会话持久化后的 artifact 引用、关键语义目标和完整用例覆盖，因此下一阶段需要单独强化详细 LLM 黑盒测试。

## What Changes

- 将详细 LLM 黑盒 runner 调整为真实首页请求形态，覆盖 `/api/chat` 请求、NDJSON stream 消费、会话保存和后续读取，而不是只在进程内直接调用聊天编排函数。
- 在多轮流程中通过真实会话保存链路写入并读取 conversation artifact / artifact index，使引用、修改和动作讲解类用例不再依赖手工伪造 `recentArtifactSummaries`。
- 增加测试专用用户、会话隔离和数据库 preflight，确保详细套件能明确区分环境缺失、鉴权失败、会话保存失败和真实语义回归。
- 为完整/详细测试增加分级断言：保留卡片类型断言，同时对引用成功、动作讲解、条件覆盖、排除动作、安全边界和拒答恢复等关键语义目标做可维护校验。
- 补齐 `LLM完整测试.md` 中未落入详细 fixture 的高价值流程，优先覆盖长期计划变化、多轮上下文、引用修改、安全边界和异常恢复。
- 校准基础套件和完整/详细套件 token 预估，使运行前成本提示基于最近真实报告或可解释的统计口径。
- 强化报告字段，区分“卡片类型通过”和“语义目标通过”，并记录运行命令、套件名、真实/跳过状态、fixture 覆盖摘要和失败排错信息。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `manual-llm-consistency-tests`: 手动 LLM 黑盒测试需要提升详细套件真实性、覆盖完整性、语义断言和报告可诊断性。

## Impact

- 影响 `manual-tests/llm/**` 中的 runner、fixtures、assertions、report 生成和本地非真实模型测试。
- 影响 `scripts/run-manual-llm-tests.mjs` 的 token 预估、报告路径摘要和详细模式输出。
- 影响 `docs/manual-llm-consistency-tests.md`、`LLM完整测试.md`、`docs/方案变更历史/**` 和 `docs/项目演变历程.md` 中的测试体系说明。
- 可能需要新增测试专用的本地会话/用户隔离工具，但不改变生产 API 契约、数据库 schema 或默认 `npm run test` 的普通测试范围。
