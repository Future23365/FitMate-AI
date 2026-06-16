## Why

Shadow Probe 的 `round-xxx-input.json` 会导出生产 provider 可见的 tool schema，其中业务 tool 统一包含 `runtimeMetadata` envelope。但 Shadow runner 在执行前又直接用业务 `inputSchema` 校验完整 `toolInput`，导致模型按可见 schema 传入合法 `runtimeMetadata` 时被误判为 `tool_schema_invalid`。

这个问题会让 Shadow Probe 诊断结果偏离生产 LangChain wrapper 的真实执行边界，需要把 Shadow runner 的预校验对齐到生产 wrapper 已有的 metadata 剥离规则。

## What Changes

- 导出或复用生产 LangChain tool wrapper 的业务输入读取 helper，使运行期 metadata 在业务 schema 校验前被剥离。
- 调整 Shadow runner 的 decision 预校验：仍拒绝不存在的 tool、污染审计失败和非法业务 input，但允许 provider-visible schema 中合法的 `runtimeMetadata` 通过 wrapper 边界。
- 保持业务 tool `inputSchema`、handler、tool description、训练编排规则和 `/api/chat` 主链不变。
- 增加回归测试，证明 Shadow runner 与生产 wrapper 对 `runtimeMetadata` 的处理一致，且未知业务字段仍会被拒绝。

## Capabilities

### New Capabilities

- `codex-shadow-llm-probe-runtime-validation`: 约束 Shadow runner 在 decision 校验和 dev-safe tool 执行前复用生产 wrapper 的 runtime metadata envelope 边界。

### Modified Capabilities

- `agent-tool-call-runtime-metadata`: 明确生产 wrapper 的 runtime metadata envelope 解析边界应可被 Shadow runner 等 dev-only 执行入口复用，避免 provider-visible schema 与业务 schema 校验漂移。

## Impact

- 影响代码：`lib/server/langchain-agent/tool-wrapper.ts`、`lib/server/dev/shadow-llm-probe/runner.ts`。
- 影响测试：`tests/shadow-llm-probe.test.ts`，必要时补充最窄 wrapper/runtime 测试。
- 不影响生产业务 handler、Prisma schema、动作查询规则、模型 prompt、tool description、schema description、`/api/chat` 路由或生产 response adapter。
