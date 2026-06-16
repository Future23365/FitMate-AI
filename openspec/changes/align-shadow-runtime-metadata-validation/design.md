## Context

生产 LangChain tool wrapper 已经把业务 tool input 分成两层：provider-visible schema 会注入 `runtimeMetadata`，执行前 wrapper 会剥离该 envelope，再用业务 `inputSchema` 校验并调用 handler。已有 runtime 测试也覆盖了 handler 只接收业务 input、非法 metadata 不阻断合法业务 input 等边界。

Shadow Probe 的 input exporter 复用了 provider-visible schema，因此 `round-xxx-input.json` 中会出现 `runtimeMetadata`。但 Shadow runner 在执行前额外用 `tool.inputSchema.safeParse(decision.toolInput)` 校验完整 decision input。这个预校验没有剥离 envelope，导致合法 metadata 被业务 `.strict()` schema 拒绝。

## Goals / Non-Goals

**Goals:**

- 让 Shadow runner 的 decision 预校验与生产 wrapper 的 runtime metadata envelope 解析边界一致。
- 保持业务 tool `inputSchema` 和 handler 输入纯净，`runtimeMetadata` 不进入业务 handler。
- 保留 Shadow runner 的确定性拒绝能力：未知 tool、污染审计失败、非法业务 input 仍必须失败。
- 用最窄测试覆盖 Shadow runner 的回归场景。

**Non-Goals:**

- 不修改 `/api/chat` 主链路、LangChain runtime 主循环、provider payload 生成逻辑或 response adapter。
- 不修改 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 的业务 handler 或业务 schema。
- 不改变模型何时调用 tool、训练计划生成规则、tool description 或 schema description。
- 不把 `runtimeMetadata` 加入每个业务 tool 的业务 schema。

## Decisions

### Decision 1: 导出公共业务输入剥离 helper

将生产 wrapper 中已有的 metadata 剥离逻辑以明确命名的 helper 暴露给需要做执行前业务 schema 判重或预校验的 dev/runtime 入口，例如 `readLangChainToolBusinessInput()`。

理由：
- 生产 `executeLangChainToolWrapper()` 已经按该边界执行，Shadow runner 应复用同一抽象，而不是复制一份局部剥离逻辑。
- helper 名称表达它只读取业务 input，不处理语义、权限、handler 输出或用户文案。

替代方案：
- 只在 Shadow runner 内删除 `runtimeMetadata`。实现更小，但会复制生产边界，后续 metadata envelope 变化时容易再次漂移。
- 给所有业务 tool schema 扩展 `runtimeMetadata`。这会污染业务 schema，不符合 handler 只接收业务 input 的既有合同。

### Decision 2: Shadow runner 预校验使用业务 input helper

Shadow runner 的 `readAndValidateDecision()` 继续先校验 decision 文件结构、污染审计、当前 tool 是否暴露和 tool 是否注册；进入 tool input schema 校验时，使用公共 helper 从 `decision.toolInput` 中读取业务 input，再调用 `tool.inputSchema.safeParse()`。

理由：
- Shadow runner 仍能在执行前给出 `decision_validation_failed`，不需要等 `executeLangChainToolWrapper()` 返回失败记录。
- 对业务 schema 的拒绝语义不变，`runtimeMetadata` 只在 wrapper envelope 层被剥离。

### Decision 3: 执行阶段继续调用 `executeLangChainToolWrapper()`

Shadow runner 执行真实 dev-safe tool 时继续传完整 `decision.toolInput` 给 `executeLangChainToolWrapper()`，由生产 wrapper 统一生成 runtime activity、input summary、model-visible summary 和 trace record。

理由：
- 这样 handler 仍只收到剥离后的业务 input。
- tool result 中仍能记录 runtime activity，但不会把 metadata 混入 model-visible summary 或业务 projection。

## Risks / Trade-offs

- [Risk] 公共 helper 被误用于语义归一化或字段补齐。  
  Mitigation: helper 只做浅层剥离 `runtimeMetadata`，注释说明不得改写业务字段；测试覆盖未知业务字段仍被拒绝。

- [Risk] Shadow runner 和 wrapper 对非法 metadata 的处理仍有差异。  
  Mitigation: Shadow runner 预校验只判断业务 schema；metadata 合法性继续交给 `executeLangChainToolWrapper()` 的 runtime activity fallback 逻辑处理。

- [Risk] 新测试误连真实数据库。  
  Mitigation: 使用测试内 fixture wrapper 验证 Shadow runner 的 decision validation 和 handler 输入，不依赖生产数据库。

## Migration Plan

1. 导出公共 helper。
2. 调整 Shadow runner 预校验使用该 helper。
3. 增加 Shadow Probe 单测覆盖合法 `runtimeMetadata`、未知业务字段拒绝和 handler input 纯净。
4. 运行最窄测试与 OpenSpec 校验。
