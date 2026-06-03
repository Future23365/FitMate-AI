## 1. 证据与边界确认

- [ ] 1.1 读取最新 `codex_logs/ai_trace_log.js`，确认失败链路是 `searchExerciseResources` 成功返回 `satisfied=true` 后重复同参调用，随后 `maxReturned` 误入 input 并触发 `repair_limit_exceeded`。
- [ ] 1.2 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不触碰禁止模块、不新增服务端关键词分流、不把业务 toolName 写进 core 分支。
- [ ] 1.3 检查模型实际可见输入来源，包括 system prompt、tool manifest、schema summary、examples、observations、compressed tool results 和 repair feedback。
- [ ] 1.4 运行 `git status --short`，确认没有无关用户改动混入。

## 2. `searchExerciseResources` 模型可见合同修复

- [ ] 2.1 更新 `searchExerciseResources.toModelObservation`，移除或明确弱化 `maxReturned` 等 output-only / 服务端内部上限字段，保留回答需要的 `totalMatches`、`returnedCount`、`truncated`、`appliedFilters` 和动作摘要。
- [ ] 2.2 更新 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples，明确 `maxReturned`、`returnedCount`、`totalMatches`、`truncated` 是 output summary，不属于 input。
- [ ] 2.3 保持 `searchExerciseResourcesInputSchema` 严格拒绝未知字段，不新增 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize`。
- [ ] 2.4 保持该 tool 不产出训练候选 resource、不生成训练计划、不保存 artifact、不做分页控制和隐藏业务编排。

## 3. 重复成功 tool call 反馈

- [ ] 3.1 在通用重复 tool call 诊断窄口补充 `ok=true && fulfillment.satisfied=true` 的重复成功同参调用识别，使用 `toolName + toolVersion + normalizedInputHash` 或等价稳定 key。
- [ ] 3.2 对重复成功同参调用生成结构化 `AgentDecisionFeedback`，引用首次成功 `toolResultId`、重复次数和可恢复建议。
- [ ] 3.3 确保重复成功反馈不再次执行相同 handler，不消耗真实 tool call，不把服务端语义判断写进 `/api/chat` 或 Agent core。
- [ ] 3.4 确保 changed normalized input、合法 `excludeExerciseIds`、不同筛选条件或不同 tool 不触发重复成功反馈。
- [ ] 3.5 保持 failed、diagnostic 或 `satisfied=false` 的重复调用继续走既有失败反馈、重复失败熔断、澄清或 failed 收口边界。

## 4. Tool 与 manifest 回归测试

- [ ] 4.1 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 `maxReturned` 作为 input 时被 `inputSchema` 或 `executeTool` 拒绝。
- [ ] 4.2 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 model observation 不暴露可复制的 `maxReturned` 输入片段，用户投影如保留统计字段仍不影响模型投影。
- [ ] 4.3 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 production manifest / schema summary 不把 `maxReturned`、`limit`、`page`、`pageSize` 等字段暴露为 `searchExerciseResources` input 或 example。
- [ ] 4.4 更新 `tests/agent-core/contract-helper.test.ts` 或等价 contract helper 测试，覆盖 output-only 字段不得污染 input schema / examples 的通用边界。

## 5. Runtime 与聊天回归测试

- [ ] 5.1 新增或更新 Agent runtime 单测，使用 ReplayPlanner 复现“成功 tool result 后重复同参 tool_call”，断言 runtime 返回结构化重复成功 feedback 且不再次执行 handler。
- [ ] 5.2 新增或更新 Agent runtime 单测，覆盖 changed input 不触发重复成功反馈，并能正常进入 Action Validator / Executor。
- [ ] 5.3 新增或更新 Agent runtime 单测，覆盖 failed 或 `satisfied=false` 的重复结果不被当成成功收口依据。
- [ ] 5.4 更新 `tests/chat-service.test.ts` 或当前生产聊天回归测试，覆盖“既练腿又练胸肌的动作”在 `searchExerciseResources` 成功后可以通过合法 `final_answer.usedToolResultIds` 收口。
- [ ] 5.5 确认所有测试中没有新增基于用户原文关键词、正则、同义词表或短句模板的服务端语义纠偏。

## 6. 验证与收尾

- [ ] 6.1 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [ ] 6.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 6.3 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 6.4 运行覆盖重复 tool call / repair feedback 的最窄 Agent runtime 测试文件。
- [ ] 6.5 如修改 chat service 或 production 接入回归，运行 `npm test -- tests/chat-service.test.ts`。
- [ ] 6.6 运行 `npm run typecheck`。
- [ ] 6.7 运行 `openspec validate harden-search-exercise-final-answer-settling --strict`。
- [ ] 6.8 执行 architecture scan 或等价 `rg` 检查，确认 `/api/chat`、Agent core、runtime、tool handler 中没有新增业务关键词分流或 `searchExerciseResources` core 特判。
- [ ] 6.9 最终检查 `git diff`，确认只包含本 change 范围内的 OpenSpec、实现和测试，没有混入无关改动。
