## 1. Wrapper Boundary

- [x] 1.1 导出生产 LangChain tool wrapper 的业务 input 读取 helper，并用职责型中文注释说明它只剥离 `runtimeMetadata`、不改写业务字段。
- [x] 1.2 将 runtime duplicate-input 逻辑切换为复用该 helper，避免保留第二份 metadata 剥离实现。

## 2. Shadow Runner

- [x] 2.1 调整 Shadow runner 的 decision 预校验，使其在调用业务 `inputSchema.safeParse` 前复用公共业务 input helper。
- [x] 2.2 保持 Shadow runner 的 tool availability、污染审计、未知业务字段拒绝和真实 `executeLangChainToolWrapper` 执行路径不变。

## 3. Tests

- [x] 3.1 更新 `tests/shadow-llm-probe.test.ts`，覆盖带 `runtimeMetadata` 的合法 decision 可通过并推进下一轮 input。
- [x] 3.2 覆盖 Shadow runner 不会把 `runtimeMetadata` 传给业务 handler。
- [x] 3.3 覆盖 `runtimeMetadata` 之外的未知业务字段仍触发 decision schema validation failure。
- [x] 3.4 按需更新 runtime metadata 相关窄测试，证明公共 helper 不放宽业务 schema。

## 4. Verification

- [x] 4.1 运行 `openspec validate align-shadow-runtime-metadata-validation --strict`。
- [x] 4.2 运行 `npm test -- tests/shadow-llm-probe.test.ts`。
- [x] 4.3 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts`。
- [x] 4.4 运行 `npm run typecheck`。
- [x] 4.5 检查最终 diff，确认没有修改业务 tool handler、`/api/chat` 主链路、训练规则、tool description 或 schema description。
