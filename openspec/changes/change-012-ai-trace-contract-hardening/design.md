## Context

`change-010` 已经把 trace 从模型请求日志扩展为基础 `AiRunTrace`，覆盖聊天、引用解析、候选筛选、Patch、校验、持久化和响应写入。当前实现适合本地开发排查，但契约仍主要依赖 `unknown input/output/metadata` 和各模块自由约定字段。`change-011` 将基于 trace 做 Orchestrator、Replay 和 Eval，因此 trace 需要先具备稳定、可测试、可关联和可安全导出的结构。

当前约束：

- trace 仍是开发态能力，不引入外部观测平台。
- 不改变“trace 写入失败不能影响用户回复”的原则。
- 不把完整用户私有 payload 默认写入 trace；只保存必要摘要、版本、hash 或当前 userId 有权访问的受控快照。
- 需要兼容已有 trace viewer 和历史 step 类型，避免一次性重写所有埋点。

## Goals / Non-Goals

**Goals:**

- 定义稳定的 `AiRunTrace` envelope、step envelope 和 typed step payload。
- 让高频 step 的 input/output/metadata 从自由 JSON 收敛到 Zod schema 或 TypeScript discriminated union。
- 记录真实 step duration，支持慢链路定位。
- 统一所有 AI 入口的 `finalDecision`，便于判断成功、可恢复失败、硬失败和用户可见响应类型。
- 增加 root run、parent trace、route span 和 downstream continuation 的关联字段。
- 定义 Replay/Eval 最小快照格式，支撑后续 `change-011` 的 Replay Runner 和 Eval Suite。
- 保持隐私边界、截断策略和 trace 写入失败隔离。

**Non-Goals:**

- 不在本 change 中实现完整 Replay Runner 或 Eval Suite。
- 不保证模型输出逐 token 可重放。
- 不引入外部 tracing / observability 服务。
- 不把所有历史 trace 数据迁移到新格式；只保证调试页兼容旧 trace。

## Decisions

### Decision 1: 使用 discriminated union 定义 step payload

为每个高频 step 建立基于 `type` 的 payload schema，例如 `model_request`、`model_response`、`tool_call`、`reference_resolution`、`candidate_selection`、`validation`、`persistence`、`response_write` 和 `error`。每个 schema 区分 `input`、`output`、`metadata` 中的必需字段和可选摘要字段。

原因：仅枚举 step type 不能防止字段漂移。Typed payload 能让 UI、保存 log、Replay/Eval fixture 和测试共用同一套字段含义。

### Decision 2: 保留 Raw JSON 作为兼容层

新契约不删除原始 input/output/error 入口，而是在 typed payload 上层提供 `summary`、`diagnostics`、`raw` 或 `unknownFields`。旧 trace 或未来新增 step 如果没有专用 schema，仍按 generic step 展示。

原因：trace 的价值在于排查问题，不能因为 schema 未覆盖而丢掉调试信息。

### Decision 3: 引入 `withTraceStep` 记录真实耗时

新增 `withTraceStep(trace, input, fn)` 或等价 API，执行前创建 step span，执行后写入 `startedAt`、`endedAt`、`durationMs`、status、output/error。一次性 `addStep` 继续保留，用于纯摘要事件或迁移期兼容。

原因：当前 step 很多是业务执行后才写入，duration 不能代表真实执行耗时。真实耗时对模型请求、工具调用、数据库查询和持久化失败排查很关键。

### Decision 4: `finalDecision` 成为所有 AI 入口的必填收口

所有 `finish()` 都必须传入 `finalDecision`。`finalDecision` 至少包含 `status`、`code`、`reason`、`responseType`，并可选包含 `recoverable`、`userVisibleOutcome`、`nextAction`、`blockedBy`。

原因：仅 `success/failed` 无法区分候选不足、需要澄清、Policy blocked、可恢复校验失败、模型错误和系统硬失败。

### Decision 5: correlation 字段显式化

trace 顶层增加 `rootRunId`、`parentTraceId`、`sourceTraceId`、`routeSpanId`、`continuedRoutes` 或等价字段。下游 API 续写时必须保留 root run，并记录当前 route span。

原因：聊天链路会触发动作推荐、训练计划生成、确认续跑等下游入口。仅靠 `existingTraceId` 和 metadata 约定不足以稳定串联。

### Decision 6: Replay/Eval 快照只保存最小可验证信息

snapshot 只保存重放决策所需的摘要、版本、hash 和必要 payload：`promptVersion`、`toolVersions`、model、artifact revision、candidate pool summary、memory summary、policy/validation result、payload hash。完整 payload 只有在当前 userId 有权访问且经过 schema 校验时才可保存，且必须受长度预算限制。

原因：Replay/Eval 需要比普通日志更稳定的输入，但不能把 trace 变成无边界的数据转储。

## Risks / Trade-offs

- [Risk] 一次性类型化所有 step 工作量过大。→ Mitigation: 先覆盖高频和 Replay/Eval 必需 step，未知 step 保留 generic 展示。
- [Risk] 新 contract 破坏现有 trace viewer。→ Mitigation: trace viewer 同时支持 typed payload 和旧 raw payload。
- [Risk] snapshot 过大或泄露用户数据。→ Mitigation: 默认写摘要、hash、version；完整 payload 必须经过 userId、schema 和长度预算检查。
- [Risk] finalDecision 必填会暴露现有入口遗漏。→ Mitigation: 先提供 helper 和默认 mapper，再逐个入口收敛。
- [Risk] duration span 包裹异步流程后增加代码复杂度。→ Mitigation: 提供统一 helper，避免每个模块手写 try/catch/finally。

## Migration Plan

1. 新增 contract 类型、Zod schema、helper 和测试，不改变现有调用点行为。
2. 将 `/api/chat` 主链路和模型请求、工具调用、validation、persistence 迁移到 typed payload。
3. 迁移 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 的 `finalDecision` 和 typed payload。
4. 补齐 correlation 字段和 downstream continuation 记录。
5. 为 `change-011` 的 Replay/Eval 提供 snapshot fixture schema。
6. 调整 `/dev/ai-traces` 解释 typed payload，同时继续兼容旧 trace。

## Open Questions

- replay snapshot 是否需要落盘保存，还是第一版只从内存 trace / 手动保存 log 生成 fixture。
- `finalDecision.code` 是否需要集中枚举，还是按模块命名空间先行约定。
- route span 是否使用独立 `spanId`，还是先用 step group + route metadata。
