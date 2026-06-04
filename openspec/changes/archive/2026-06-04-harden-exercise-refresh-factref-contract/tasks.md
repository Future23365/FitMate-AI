## 1. OpenSpec 与边界确认

- [x] 1.1 读取最新 `codex_logs/ai_trace_log.js`，确认失败链路是空 `recentExerciseRecommendationFacts` + 占位 `factRef` + `handler_error` + `duplicate_tool_failure`。
- [x] 1.2 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认不触碰 Agent core、`/api/chat` 关键词路由或服务端语义分流。
- [x] 1.3 运行 `git status --short`，确认没有无关改动混入。
- [x] 1.4 运行 `openspec validate harden-exercise-refresh-factref-contract --strict`。

## 2. Tool 模型可见合同修复

- [x] 2.1 更新 `readRecentExerciseRecommendationFact` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，明确 `factRef/messageId` 只能来自当前 run metadata 中真实 `recentExerciseRecommendationFacts`。
- [x] 2.2 删除或替换 `cbf_previous_response` 占位 example，避免模型照抄非真实上下文引用。
- [x] 2.3 保持 `/api/chat`、Agent runtime、PlannerPort、Executor 主流程、Policy Guard 和 Response Renderer 不变，不新增服务端自然语言判断、关键词、正则、同义词表或 action 改写。

## 3. Tool 失败归一化

- [x] 3.1 更新 `readRecentExerciseRecommendationFact` handler，捕获 `readExerciseRecommendationFact` 抛出的 store / DB 异常。
- [x] 3.2 将 store / DB 异常归一为结构化 `status: "failed"` output 和稳定 code，且 `fulfillment.satisfied = false`。
- [x] 3.3 保持正常 `not_found`、`not_unique`、`status_not_readable`、`schema_version_unsupported`、`payload_invalid`、`database_unconfigured` 等失败 code 不被覆盖。
- [x] 3.4 确保失败结果不登记 consumable resource，不支撑成功 final answer。

## 4. 回归测试

- [x] 4.1 更新 `tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`，覆盖 store 抛错时 `executeTool` 返回结构化失败 output，且不是 `handler_error`。
- [x] 4.2 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 production manifest 不包含 `cbf_previous_response`，并包含真实 metadata factRef 来源说明。
- [x] 4.3 更新 `tests/chat-service.test.ts`，覆盖空 recent fact 下模型错误调用无效 `factRef` 后，服务端不因 `handler_error` / `duplicate_tool_failure` 直接报错，并继续由模型合法 terminal action 收口。
- [x] 4.4 确认测试中没有新增服务端关键词分流或基于用户原文的语义纠偏。

## 5. 验证与收尾

- [x] 5.1 运行 `npm test -- tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`。
- [x] 5.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 5.3 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 5.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 5.5 运行 `npm run typecheck`。
- [x] 5.6 运行 `openspec validate harden-exercise-refresh-factref-contract --strict`。
- [x] 5.7 最终检查 `git diff`，确认只包含本 change 范围内的 OpenSpec、实现和测试，没有混入无关改动。
- [x] 5.8 自动提交中文 commit，并在最终回复中说明当前未提交文件。
