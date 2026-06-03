## 1. 前置确认

- [ ] 1.1 复核 `docs/agent-tool-orchestrator-design.md` 第 9、10、20、21、24、25、26 节，确认本 change 属于 trace contract + production 接入变更，不是新增业务 tool。
- [ ] 1.2 复核 `lib/server/agent-planners/llm-planner.ts`、`lib/server/agent-planners/model-adapters/model-adapter.ts`、`lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts`、`lib/server/chat/agent-text-chat-service.ts` 和 `components/dev/ai-trace-viewer.tsx` 当前真实链路，确认 LLM request/response 与 token usage 没有进入 `AiTrace`。
- [ ] 1.3 运行 `git status --short`，确认实现前工作区状态，并隔离无关未提交改动。

## 2. Planner / ModelAdapter 观测合同

- [ ] 2.1 在 `ModelActionCompletionResult` 或等价类型中新增模型调用 trace 诊断字段，包含 request config、messages 摘要、raw response 摘要、parsed action、parse status、failure code 和 token usage。
- [ ] 2.2 在 `DeepSeekModelAdapter` 中生成脱敏、截断、字段白名单的 request / response envelope，不记录 API key、authorization、cookie 或完整敏感 payload。
- [ ] 2.3 在 `LlmPlanner` 中把 `PlannerInput`、adapter completion、planner call index、runtime step 和 action candidate 关联为可读取 diagnostics，不修改 `PlannerPort` 返回合同。
- [ ] 2.4 确保 Fake / Replay 测试 planner 不被强制实现供应商诊断；缺失 diagnostics 时 trace 页面显示“未记录模型调用”，不推断业务失败。

## 3. 文本聊天 Trace 投影

- [ ] 3.1 在 `agent-text-chat-service` 的局部 trace helper 中读取 `LlmPlanner` diagnostics，并写入 `model_request` / `model_response` trace steps。
- [ ] 3.2 将真实 token usage 汇总到 trace overview 可读取字段，并与 runtime `estimated_tokens` budget event 明确区分。
- [ ] 3.3 让模型请求、模型响应、`planner_action`、`validation_result`、terminal status、error code 和 response write summary 能通过 call index / runtime step 关联。
- [ ] 3.4 确保配置错误、模型 HTTP 错误、空 content、invalid_json、invalid_action_schema、timeout、unknown tool、budget exhausted 和 runtime exception 都有清晰失败边界。
- [ ] 3.5 确保 trace diagnostics 写入失败为非致命行为，不改变 `/api/chat` 返回给前端的 NDJSON 响应。

## 4. Trace 页面模块化展示与导出

- [ ] 4.1 抽出或重构 trace viewer 的模块化 view model，按入口与上下文、ToolRegistry/Manifest、Planner/ModelAdapter、Runtime/Validator、Policy/Resource、Response Renderer、错误诊断和 Raw/导出入口分组。
- [ ] 4.2 页面默认展示模块状态、关键 code/id、LLM 调用轮次、token usage、失败边界和用户可见响应摘要；完整 messages、raw output 和 Raw JSON 放入展开区。
- [ ] 4.3 Planner/ModelAdapter 模块展示 request config、messages 摘要、raw output 摘要、parsed action、parse status、failure code、真实 token usage 和预算估算区别。
- [ ] 4.4 Runtime/Validator 模块展示 action type、toolName、validator ok/code、budget event、terminal action/error 和 repair/failure 边界，不用用户文本或 step title 推断关系。
- [ ] 4.5 Response Renderer 模块展示真实返回的 NDJSON event types、content 摘要、suggestion count、error code 和 done。
- [ ] 4.6 更新保存全链路 log payload，包含 moduleGroups、plannerModelCalls、tokenUsageSummary、runtime traceEvents、response summary 和 Raw trace；保存用户问答记录继续保持窄字段。

## 5. 文档同步

- [ ] 5.1 更新 `docs/agent-tool-orchestrator-design.md`，记录 Planner / ModelAdapter 观测与模块化 trace debugger 边界。
- [ ] 5.2 在 `docs/方案变更历史/` 新增本次 trace debugger 调整记录，说明原问题、职责拆分、关键改动和验证结果。
- [ ] 5.3 在 `docs/项目演变历程.md` 末尾追加本次 LLM trace 可观测性与模块化展示摘要。

## 6. 测试与验证

- [ ] 6.1 运行 `openspec validate improve-agent-llm-trace-debugger --strict`。
- [ ] 6.2 增加或更新 `tests/agent-core/adapter-llm-planner.test.ts`，覆盖 DeepSeek request / response diagnostics、usage 归一化、invalid_json / invalid_action_schema 和敏感字段脱敏。
- [ ] 6.3 增加或更新 `tests/chat-service.test.ts`，覆盖 final answer、ask user、unknown tool / repair failure、模型解析失败都会写入 model_request / model_response trace。
- [ ] 6.4 增加或更新 `tests/api-routes.test.ts`，覆盖 `/api/chat` 成功 NDJSON 的 LLM trace 生产和配置错误无模型调用边界。
- [ ] 6.5 增加或更新 `tests/ai-trace-http.test.ts`，覆盖保存全链路 log 中模型调用诊断、token usage、Raw trace 和脱敏边界。
- [ ] 6.6 增加或更新 `tests/ai-trace-viewer.test.ts`，覆盖模块化分组、Planner/ModelAdapter 展示、token usage 区分和保存 payload。
- [ ] 6.7 运行 `npm test -- tests/agent-core/adapter-llm-planner.test.ts tests/chat-service.test.ts tests/api-routes.test.ts tests/ai-trace-http.test.ts tests/ai-trace-viewer.test.ts`。
- [ ] 6.8 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`，确认没有旧 `agent-orchestrator`、旧事件、fixture tool、真实业务 tool、关键词分流或 core 供应商耦合回流。
- [ ] 6.9 运行 `npm run typecheck`。
- [ ] 6.10 运行 `git status --short` 和 diff 检查，确认只包含本 change 相关文件，且未混入无关改动。
