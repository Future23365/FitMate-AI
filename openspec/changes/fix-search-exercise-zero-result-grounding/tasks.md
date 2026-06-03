## 1. 证据与边界确认

- [x] 1.1 读取 `codex_logs/ai_trace_log.js`，确认本次失败链路是 `searchExerciseResources(q="铅球") -> totalMatches=0 -> fulfillment.satisfied=false -> final_answer.usedToolResultIds -> terminal_reference_invalid -> repair_limit_exceeded`。
- [x] 1.2 检查模型实际可见的 prompt / model input、tool manifest、schema description、examples、observation 和 repair 反馈，确认修复应落在业务 tool 合同和模型可见说明，不落在服务端自然语言分流。
- [x] 1.3 检查 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节和当前 Git 工作区状态，确认禁止触碰 core runtime、`/api/chat` 主链路和服务端关键词语义判断。

## 2. Tool 合同实现

- [x] 2.1 修改 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`，让合法查询成功时包含 `totalMatches=0` 的结果也返回 `fulfillment.satisfied=true`。
- [x] 2.2 更新 fulfillment summary，区分“查询到 N 个动作”“当前发布态动作库没有匹配结果”“排除已展示动作后没有更多匹配结果”，但不根据用户原文判断查询意图。
- [x] 2.3 更新 `description`、`whenToUse`、`whenNotToUse`、schema description、examples 或 observation 文案，明确 0 条结果是可引用查询事实，不是候选消费资源。
- [x] 2.4 确认 `searchExerciseResources` 不新增 `purpose`、`queryIntent`、`existenceCheck`、`recommendationMode` 等语义目的字段，不产出 `candidate_set`、routine、plan、训练卡片或保存事件。

## 3. 自动化测试

- [x] 3.1 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖合法 0 条查询返回 `ok=true`、`fulfillment.satisfied=true`、`totalMatches=0`、`exercises=[]`，且可作为事实结果 grounding。
- [x] 3.2 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖排除已展示动作后 0 条仍是查询事实完成，并覆盖空结果不产出候选消费资源。
- [x] 3.3 更新 tool 模型可见说明测试，验证 manifest / schema / examples / observation 默认中文且表达 0 条事实查询与候选消费边界。
- [x] 3.4 更新 `tests/chat-service.test.ts` 或等价生产聊天测试，覆盖“有没有铅球动作”类链路：模型调用 `searchExerciseResources` 得到 0 条后，可以用 `final_answer.usedToolResultIds` 合法收口。
- [x] 3.5 保留或补充 core grounding 回归测试，证明 failed 或 `satisfied=false` 的 tool result 仍不能支撑成功 `final_answer`。

## 4. 文档与演进记录

- [x] 4.1 更新 OpenSpec spec / design / tasks，确保任务分类、允许触碰模块、禁止触碰模块、core contract 变更结论和验证计划完整。
- [x] 4.2 在 `docs/方案变更历史` 新增本次合同修复记录，使用上海时间精确到秒。
- [x] 4.3 如果实现确认影响核心链路边界，在 `docs/项目演变历程.md` 末尾追加简要记录。

## 5. 验证与收尾

- [x] 5.1 运行 `openspec validate fix-search-exercise-zero-result-grounding --strict`。
- [x] 5.2 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 5.3 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 5.4 运行 `npm test -- tests/agent-core/planner-validator.test.ts tests/agent-core/tool-registry-manifest.test.ts tests/agent-core/contract-helper.test.ts`。
- [x] 5.5 运行 `npm run typecheck`。
- [x] 5.6 检查最终 diff，确认没有无关改动、没有服务端关键词语义分流、没有 core 业务 toolName 特判。
- [x] 5.7 完成任务后按项目规则提交本次改动，提交信息使用中文。
