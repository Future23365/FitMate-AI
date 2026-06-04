## Why

M0 已经建立通用 `Agent Tool` 合同内核，但当前仍不能安全执行资源依赖、写操作或诊断失败链路。现在需要按 `docs/agent-tool-orchestrator-design.md` 的 M1 设计补齐 `ResourceStore`、Resource Contract、`Policy Guard` 和 confirmation 闭环，让后续真实 planner / 业务 tool 接入前具备确定性的安全底座。

## What Changes

- 新增 M1 安全与资源闭环：实现当前 run 内的 `ResourceStore`、资源登记、资源读取、资源角色校验和 Resource Contract Validator。
- 支持 `consumable` / `diagnostic` 资源角色：后续 tool 只能消费当前 run 内已登记且 role 为 `consumable` 的资源；`diagnostic` 只能用于解释、阻断、失败证据或调试，不得支撑成功 final answer。
- 新增通用 `Policy Guard`：在 Executor 调用 tool handler 前统一校验 permission、risk、sideEffect、confirmation 策略和动态策略，不允许 handler 绕过策略边界。
- 新增 confirmation pending action 与服务端 action hash：write / high risk / confirmation-required tool 必须先生成服务端待确认动作，用户确认后只能恢复执行服务端保存的 pending action，不能信任客户端或 LLM 重新传入的 input。
- 新增 confirmation resume 入口或等价 runtime 恢复能力，用 fixture write tool 验证 pending action 校验、过期、状态流转、hash 校验和 consumed 幂等边界。
- 新增 M1 fixture tools：resource producer、resource consumer、confirmation write、diagnostic failure、trace / replay fixture，用来验证资源、策略、确认和失败诊断的通用机制。
- 明确 M1 不接入 production `/api/chat` 主链、不注册真实业务 tool、不接入真实 LLM adapter、不实现 M2 的红线审计/真实 trace 脱敏/模型 adapter 上线硬化。

## Capabilities

### New Capabilities

- `agent-tool-safety-resource-closure`: 定义 M1 通用安全与资源闭环，包括 `ResourceStore`、Resource Contract Validator、资源角色、`Policy Guard`、confirmation pending action、confirmation resume、M1 fixture tools 和相关 replay/trace fixture 验收。

### Modified Capabilities

- 无。本 change 新增新 `agent-core` 的 M1 能力，不修改旧生产聊天、旧 `agent-runtime-resource-contract`、旧 `policy-confirmation` 或真实业务 tool 规格。

## Impact

- 影响模块：`lib/server/agent-core/**`、`lib/server/agent-tools/fixture/**`、`lib/server/agent-planners/replay-planner.ts`、`lib/server/agent-tools/index.ts` 或等价 M1 内核与 fixture 注册入口。
- 影响测试：新增或扩展 `tests/agent-core/**`，覆盖资源登记/消费、资源角色拒绝、Resource Contract Validator、Policy Guard、confirmation request/resume、diagnostic failure grounding、fixture replay 和架构扫描。
- 影响文档：需要同步记录 M1 相对 M0 的边界、验收结果和后续 M2 上线硬化保留项。
- 不影响数据库结构、Prisma Schema、前端 UI、生产 `/api/chat` 行为、真实模型调用、真实训练计划生成、动作库查询或用户数据持久化。
