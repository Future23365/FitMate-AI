## Why

M0 已建立通用 Agent Tool 合同内核，M1 补齐资源、策略和确认闭环；上线前还缺真实 `LlmPlanner`、模型 adapter、manifest / trace 可回放证据、redaction、预算和 prompt injection 防护。M2 的目标是在不引入真实业务 tool 的前提下，把通用编排器硬化到可以安全接入真实模型和后续生产链路的状态。

## What Changes

- 新增真实 `LlmPlanner` 与模型 adapter 边界，core 仍只依赖 `PlannerPort`，模型 SDK / prompt / 厂商格式转换只存在于 `agent-planners`。
- 当前 M2 只接入 DeepSeek adapter；OpenAI、Anthropic 或其他 adapter 不在本 change 中实现，但接口必须允许后续替换 adapter 时不改 `agent-core`。
- 新增 manifestHash、registry snapshot 和 tool manifest linter，确保每次 run 的模型可见工具合同可追踪、可回放、可审计。
- 新增 redaction 策略、trace 脱敏审计和 prompt injection 测试，确保 secret、完整敏感 payload、handler output、内部 capability 和未脱敏 tool observation 不进入 manifest、observation、user event 或 trace。
- 新增 observation 压缩、planner/tool budget、idempotencyKey 和 contract test helper，控制模型上下文增长、执行次数、重复提交和 tool 合同回归。
- 新增 DeepSeek + fixture tool 的端到端黑盒 / 回归验证，证明真实模型只能提出 `AgentAction`，仍必须经过 Action Validator、Policy Guard、ResourceStore、Executor 和 Response Renderer。
- 明确 M2 不新增真实动作库、训练生成、保存、用户记忆等业务 tool；不在 core 中写业务 toolName 分支；不通过用户自然语言关键词做业务路由。

## Capabilities

### New Capabilities

- `agent-tool-production-hardening`: 定义 M2 上线硬化能力，包括 DeepSeek-only `LlmPlanner` 接入、模型 adapter 隔离、manifestHash / registry snapshot、redaction、observation 压缩、预算、idempotencyKey、tool manifest linter、contract test helper、prompt injection 测试和 trace 脱敏审计。

### Modified Capabilities

- 无。本 change 新增 M2 上线硬化能力，不修改现有生产聊天、动作库、训练生成、旧 Agent 删除规格，也不提前引入真实业务 tool。

## Impact

- 影响模块：`lib/server/agent-core/**`、`lib/server/agent-planners/**`、`lib/server/agent-planners/model-adapters/**`、`lib/server/agent-tools/fixture/**`、`lib/server/agent-tools/index.ts`、trace / redaction / idempotency / budget 相关内核模块。
- 影响测试：新增或扩展 `tests/agent-core/**`、DeepSeek fixture 黑盒测试、prompt injection 测试、manifest linter 测试、redaction / trace audit 测试、contract test helper 测试和架构扫描。
- 影响文档：需要记录 M2 相对 M0/M1 的上线硬化边界、DeepSeek-only 接入范围、真实业务 tool 仍未接入的原因和验证结果。
- 不影响数据库结构、Prisma Schema、前端 UI、真实动作库查询、训练计划生成、保存链路或用户数据持久化结构。
