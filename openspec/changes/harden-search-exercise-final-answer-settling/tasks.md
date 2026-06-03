## 1. 证据与边界确认

- [x] 1.1 读取最新 `codex_logs/ai_trace_log.js`，确认失败链路是“换一个”场景中 `readRecentExerciseRecommendationFact` 成功读取真实 `factRef` 后重复同参调用，最终触发 `Resource id is already registered in the current run.` 和 `invalid_action` hard failure。
- [x] 1.2 同时确认既有 `searchExerciseResources` 成功结果后未收口、`maxReturned` 误入 input、`repair_limit_exceeded` 的相邻失败形态，避免只覆盖单一 tool。
- [x] 1.3 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不触碰禁止模块、不新增服务端关键词分流、不把业务 `toolName` 写进 core 分支。
- [x] 1.4 检查模型实际可见输入来源，包括 system prompt、tool manifest、schema summary、examples、observations、compressed tool results、resource 摘要和 repair feedback。
- [x] 1.5 运行 `git status --short`，确认没有无关用户改动混入。

## 2. `readRecentExerciseRecommendationFact` 状态迁移合同修复

- [x] 2.1 更新 `readRecentExerciseRecommendationFact` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，明确是否读取历史 fact 由 Planner 基于上下文判断；不得表达成“用户说换一批 / 换一个 / 再推荐一批就调用”。
- [x] 2.2 明确 `factRef/messageId` 只能从当前 run metadata 中真实 `recentExerciseRecommendationFacts` 复制；没有真实值时不得编造。
- [x] 2.3 在 `whenNotToUse` 或等价模型可见说明中补充：如果当前 run 的 observations / toolResults 已经成功读取同一 fact，不要再次调用本 tool。
- [x] 2.4 更新 `readRecentExerciseRecommendationFact.toModelObservation`，成功后只投影下一步决策需要的安全摘要，例如 `factRef`、`messageId`、`displayedExerciseIds`、必要筛选摘要和“已导入当前 run，不要重复 read”的状态说明。
- [x] 2.5 从成功 read/import 的模型 observation 中移除完整 `displayedExercises`、完整 `query` 和 `maxReturned` 等 output-only / 服务端内部上限字段。
- [x] 2.6 保持 handler、权限校验、resource contract 和事实读取语义不做服务端自然语言判断，不把该 tool 做成隐藏刷新编排器。

## 3. `searchExerciseResources` output-only 与 final grounding 合同修复

- [x] 3.1 更新 `searchExerciseResources.toModelObservation`，移除或明确弱化 `maxReturned` 等 output-only / 服务端内部上限字段，保留回答需要的 `totalMatches`、`returnedCount`、`truncated`、`appliedFilters` 和动作摘要。
- [x] 3.2 更新 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，明确 `maxReturned`、`returnedCount`、`totalMatches`、`truncated` 是 output summary，不属于 input。
- [x] 3.3 保持 `searchExerciseResourcesInputSchema` 严格拒绝未知字段，不新增 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize`。
- [x] 3.4 明确成功且 `satisfied=true` 的 `searchExerciseResources` 结果可以通过 `final_answer.usedToolResultIds` 支撑普通回答。
- [x] 3.5 保持该 tool 不产出训练候选 resource、不生成训练计划、不保存 artifact、不做分页控制和隐藏业务编排。

## 4. 重复成功 tool call 反馈兜底

- [x] 4.1 在通用重复 tool call 诊断窄口补充 `ok=true && fulfillment.satisfied=true` 的重复成功同参调用识别，使用 `toolName + toolVersion + normalizedInputHash` 或等价稳定 key。
- [x] 4.2 对重复成功同参调用生成结构化 `AgentDecisionFeedback` 或等价 Planner 可见 feedback，引用首次成功 `toolResultId`、重复次数和可恢复建议。
- [x] 4.3 确保重复成功 feedback 不再次执行相同 handler、不消耗真实 tool call、不再次登记 resources、不把服务端语义判断写进 `/api/chat` 或 Agent core。
- [x] 4.4 确保 changed normalized input、合法 `excludeExerciseIds`、不同筛选条件或不同 tool 不触发重复成功 feedback。
- [x] 4.5 保持 failed、diagnostic 或 `satisfied=false` 的重复调用继续走既有失败反馈、重复失败熔断、澄清或 failed 收口边界。
- [x] 4.6 如果需要调整通用 prompt，只补“成功 tool result 后不要重复同参调用、应基于既有结果或改变后的合法 input 继续”的稳定合同，不写 `readRecentExerciseRecommendationFact` 或 `searchExerciseResources` 业务特例。

## 5. Tool、manifest 与模型输入回归测试

- [x] 5.1 更新 `tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`，覆盖成功 read/import 的 model observation 表达“当前 fact 已导入当前 run，不要重复 read”，并提供 `displayedExerciseIds` 给后续 `excludeExerciseIds` 使用。
- [x] 5.2 更新 `tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`，覆盖成功 read/import observation 不包含完整 `displayedExercises`、完整 `query` 或 `maxReturned`。
- [x] 5.3 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 `readRecentExerciseRecommendationFact` manifest 不把“换一批 / 换一个”表达成强制触发条件，并说明是否使用该 tool 由 Planner 判断。
- [x] 5.4 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 `maxReturned` 作为 input 时被 `inputSchema` 或 `executeTool` 拒绝。
- [x] 5.5 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 model observation 不暴露可复制的 `maxReturned` 输入片段，用户投影如保留统计字段仍不影响模型投影。
- [x] 5.6 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 production manifest / schema summary 不把 `maxReturned`、`limit`、`page`、`pageSize` 等字段暴露为 `searchExerciseResources` input 或 example。
- [x] 5.7 更新 `tests/agent-core/contract-helper.test.ts` 或等价 contract helper 测试，覆盖 output-only 字段不得污染 input schema / examples / model observation 的通用边界。
- [x] 5.8 如修改 observation 压缩或 model input builder，新增最窄测试证明关键状态迁移说明不会被 compressed tool results 截断或淹没。
- [x] 5.9 确认新增或修改的模型可见描述性自然语言默认使用中文，`toolName`、字段名、枚举值、resource type 和错误码保持英文原样。

## 6. Runtime 与聊天回归测试

- [x] 6.1 新增或更新 Agent runtime 单测，使用 ReplayPlanner 复现“成功 tool result 后重复同参 tool_call”，断言 runtime 返回结构化重复成功 feedback，且不再次执行 handler。
- [x] 6.2 新增或更新 Agent runtime 单测，覆盖产生 consumable resource 的 tool 重复成功同参调用时，不再次登记 resource，且不触发 `Resource id is already registered in the current run.`。
- [x] 6.3 新增或更新 Agent runtime 单测，覆盖 changed input 不触发重复成功 feedback，并能正常进入 Action Validator / Executor。
- [x] 6.4 新增或更新 Agent runtime 单测，覆盖 failed 或 `satisfied=false` 的重复结果不被当成成功收口依据。
- [x] 6.5 更新 `tests/chat-service.test.ts`，复现“换一个 + recent fact + `readRecentExerciseRecommendationFact` 成功后重复 read”链路，断言最终不会产生 `Resource id is already registered in the current run.`、`invalid_action` hard failure 或空内容错误响应。
- [x] 6.6 更新 `tests/chat-service.test.ts` 或当前生产聊天回归测试，覆盖成功 read/import 后 Planner 可以转向 `searchExerciseResources.excludeExerciseIds` 并用合法 `final_answer.usedToolResultIds` 收口。
- [x] 6.7 更新 `tests/chat-service.test.ts` 或当前生产聊天回归测试，覆盖“既练腿又练胸肌的动作”在 `searchExerciseResources` 成功后可以通过合法 `final_answer.usedToolResultIds` 收口。
- [x] 6.8 确认所有测试中没有新增基于用户原文关键词、正则、同义词表或短句模板的服务端语义纠偏。

## 7. 验证与收尾

- [x] 7.1 运行 `npm test -- tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`。
- [x] 7.2 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 7.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 7.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 7.5 运行覆盖重复 tool call / repair feedback 的最窄 Agent runtime 测试文件。
- [x] 7.6 如修改 chat service 或 production 接入回归，运行 `npm test -- tests/chat-service.test.ts`。
- [x] 7.7 运行 `npm run typecheck`。
- [x] 7.8 运行 `openspec validate harden-search-exercise-final-answer-settling --strict`。
- [x] 7.9 执行 architecture scan 或等价 `rg` 检查，确认 `/api/chat`、Agent core、runtime、tool handler 中没有新增业务关键词分流或业务 toolName core 特判。
- [x] 7.10 最终检查 `git diff`，确认只包含本 change 范围内的 OpenSpec、实现和测试，没有混入无关改动。
