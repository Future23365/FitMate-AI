## 1. Trace 契约类型与 Schema

- [ ] 1.1 新增 `AiRunTraceContract`、`AiTraceStepEnvelope`、`AiTraceCorrelation`、`AiTraceSnapshot` 和 `AiTraceFinalDecision` 类型。
- [ ] 1.2 为 `model_request`、`model_response`、`tool_call`、`reference_resolution`、`candidate_selection`、`validation`、`persistence`、`response_write` 和 `error` 定义 typed payload。
- [ ] 1.3 为 typed payload 补充 Zod schema 或等价运行时校验，保留 unknown step 的 generic fallback。
- [ ] 1.4 将敏感字段脱敏、长文本截断、payload 长度预算和 `{ preview }` 结构整理成可复用 trace sanitizer contract。

## 2. Step Span 与真实耗时

- [ ] 2.1 在 trace logger 中新增 `withTraceStep` 或等价 helper，统一记录 startedAt、endedAt、durationMs、status、output 和 error。
- [ ] 2.2 将模型请求、受控工具、引用解析、候选筛选、校验、持久化等高价值耗时点迁移到 span helper。
- [ ] 2.3 保留 `addStep` 用于同步摘要事件，并在 payload 中区分真实业务耗时和摘要事件。
- [ ] 2.4 补充 trace 写入失败隔离测试，确认 helper 异常不会影响用户可见回复或业务写入。

## 3. finalDecision 与跨接口关联

- [ ] 3.1 扩展 `finalDecision` helper，统一输出 status、code、reason、responseType、recoverable、nextAction 和 userVisibleOutcome。
- [ ] 3.2 将 `/api/chat`、`/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 的所有 finish 路径改为必须传入 finalDecision。
- [ ] 3.3 增加 rootRunId、parentTraceId、sourceTraceId、routeSpanId 和 continuedRoutes 记录。
- [ ] 3.4 补充下游接口续写 trace 的测试，覆盖 chat 触发 workout plan / exercise recommendation / confirmation continuation。

## 4. Replay/Eval Snapshot

- [ ] 4.1 定义 replay/eval snapshot schema，包含 promptVersion、toolVersions、model、artifact revision、candidate pool summary、memory summary、policy result、validation result 和 payload hash。
- [ ] 4.2 在 artifact、candidate、memory、policy、validation 和 persistence 相关 step 中写入最小快照摘要。
- [ ] 4.3 增加从 AiRunTrace 生成 fixture 的 helper，确保只输出当前 userId 有权访问且经过截断/脱敏的数据。
- [ ] 4.4 补充隐私测试，覆盖越权 payload 不入 trace、长文本截断、敏感字段脱敏和 fixture 输出边界。

## 5. Trace Viewer 接入

- [ ] 5.1 更新 `/dev/ai-traces`，展示 rootRunId、parentTraceId、routeSpanId、continuedRoutes、finalDecision 和 snapshot 摘要。
- [ ] 5.2 为 typed payload 提供字段解释，覆盖 model、tool、reference、candidate、validation、persistence、response 和 error。
- [ ] 5.3 标明真实 span duration 与同步摘要事件的区别。
- [ ] 5.4 保持旧 trace 和未知 step 可读，Raw JSON 和保存 log 功能不回退。

## 6. 测试与文档

- [ ] 6.1 补充 trace contract 单元测试，覆盖 typed payload parse、generic fallback、finalDecision 和 correlation。
- [ ] 6.2 补充关键入口 fixture 测试，覆盖聊天、训练计划生成、动作推荐和 Patch 链路。
- [ ] 6.3 更新 `docs/方案变更历史`，记录 trace 契约从开发日志升级为可验证契约。
- [ ] 6.4 如契约影响架构说明，更新 `docs/architecture.md` 或相关 AI trace / replay 文档。
- [ ] 6.5 运行 `npm test`、`npm run typecheck`、`npm run lint`。
- [ ] 6.6 运行 `openspec validate change-012-ai-trace-contract-hardening --strict`。
