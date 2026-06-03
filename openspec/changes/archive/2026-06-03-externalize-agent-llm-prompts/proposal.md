## Why

当前生产 `/api/chat` 已接入 `LlmPlanner + DeepSeekModelAdapter`，但模型 system prompt 仍写在 adapter 的请求构造函数里。这样会让后续调整模型契约时直接修改供应商请求代码，容易把 prompt 文案、模型参数、业务 tool 说明和 adapter 协议混在一起。

本 change 需要把大模型默认 prompt 抽成独立、可配置、可审阅的配置模块，同时保持本阶段只处理模型决策契约，不顺手接入任何业务能力。

## What Changes

- 新增独立的 Agent LLM prompt 配置能力，集中声明 system prompt、prompt version、模型 action 合同说明和可选的模型请求参数默认值。
- `DeepSeekModelAdapter` 或等价模型 adapter MUST 从 prompt 配置读取模型可见 system prompt，不再在请求构造函数中硬编码 prompt 文案。
- prompt 配置 MUST 与业务 tool 注册、动作检索、训练生成、保存 artifact、用户记忆和 `/api/chat` 业务分流解耦。
- prompt 配置 MUST 支持测试注入或构造参数覆盖，便于单元测试验证不同 prompt 配置下的请求体。
- 新增测试和架构扫描，证明 prompt 已集中配置，且本 change 没有混入业务 tool 或旧 Agent runtime。
- 更新当前滞后的 prompt 说明文档，记录真实 prompt 入口，避免继续引用已不存在的 `lib/server/ai/prompt-config.ts` 作为生产入口。

## Capabilities

### New Capabilities

- `agent-llm-prompt-configuration`: 定义 Agent LLM prompt 的独立配置能力，包括 prompt registry/config、版本标识、adapter 消费边界、测试注入和禁止混入业务能力的验收标准。

### Modified Capabilities

- 无。本 change 新增 prompt 配置能力，不修改动作库、训练生成、保存、用户记忆、业务 tool、数据库结构或 `/api/chat` 外部请求契约。

## Impact

- 影响后端：`lib/server/agent-planners/**`、`lib/server/agent-planners/model-adapters/**`，以及新增的 prompt 配置模块。
- 影响测试：新增或更新 adapter/request body 测试、prompt 配置测试和架构扫描测试。
- 影响文档：更新 `docs/agent-tool-orchestrator-design.md`、`docs/llm-prompt-guidance.md` 或合适位置，记录当前真实 prompt 配置入口；按项目规则在实现阶段补充 `docs/方案变更历史` 和 `docs/项目演变历程.md`。
- 不影响 Prisma Schema、数据库迁移、训练计划生成规则、动作选择规则、业务 tool 注册、前端 UI、`/api/chat` 请求 schema 或用户可见业务流程。
