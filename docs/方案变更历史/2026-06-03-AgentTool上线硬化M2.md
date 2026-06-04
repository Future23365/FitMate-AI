# Agent Tool 上线硬化 M2

时间：2026-06-03 15:38:04 CST

## 背景

M0 已经打通 `ToolRegistry`、manifest、`PlannerPort`、Action Validator、Executor、Runtime 和默认 renderer；M1 补齐了 `ResourceStore`、Policy Guard 和 confirmation 闭环。但这两阶段仍主要依赖 `ReplayPlanner` 和 fixture，缺少真实模型 adapter、manifest 可回放证据、统一脱敏、预算、幂等和 prompt injection 回归，无法证明新 core 可以安全进入真实模型接入前的状态。

## 调整思路

本次只做通用上线硬化，不接真实业务 tool，也不恢复旧 `/api/chat` Agent 主链。核心边界是：`agent-core` 仍只依赖 `PlannerPort`，真实 DeepSeek 协议、环境变量、HTTP 请求和响应格式全部留在 `agent-planners`；模型只产出 `AgentAction` candidate，后续仍由 Action Validator、Policy Guard、ResourceStore、Executor 和 Response Renderer 裁决。

## 关键改动

- 新增 `ModelAdapter`、`FakeModelAdapter`、`LlmPlanner` 和 DeepSeek-only `DeepSeekModelAdapter`。
- 新增 `manifestHash`、registry snapshot、tool manifest linter 和复杂 schema 保留测试。
- 新增统一 redaction、observation 压缩、trace audit 和 renderer 用户事件脱敏。
- Runtime 增加 planner/tool/repair/估算 token budget，预算耗尽后结构化失败并停止继续调用模型或 handler。
- Runtime 为普通 tool execution 和 confirmation resume 注入稳定 `idempotencyKey`。
- 新增 contract test helper、prompt injection 回归、DeepSeek fixture blackbox gated 测试和架构扫描。

## 结果

M2 后的新 `agent-core` 已具备接真实模型前的基础上线硬化能力，但仍未接入 production `/api/chat`、真实动作库、训练生成、保存、用户记忆或数据库业务 tool。DeepSeek 真实黑盒入口默认不运行，只有配置 `DEEPSEEK_API_KEY` 且显式设置 `RUN_DEEPSEEK_BLACKBOX=1` 时才会执行。
