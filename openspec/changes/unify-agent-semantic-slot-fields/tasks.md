## 1. 合同审计与边界确认

- [ ] 1.1 确认本 change 的任务分类为 `core contract 变更`，并记录允许触碰模块、禁止触碰模块、验证计划和不新增服务端语义分流的边界。
- [ ] 1.2 审计旧字段完整链路：`ask_user.question`、`usedToolResultIds`、`usedResourceRefs`、`read_recent.factRef`、`read_recent.messageId`、`searchExerciseResources.muscle`。
- [ ] 1.3 审计真实模型可见输入：默认 Agent prompt、tool manifest、schema summary、examples、repair feedback、observations、compressed tool results 和 trace/replay fixture。
- [ ] 1.4 确认最终字段命名：`content`、`usedRefs`、`ref`、`muscles`；如实现阶段调整命名，先同步更新 proposal / design / specs。
- [ ] 1.5 用 `rg` 建立旧字段残留清单，并按“执行合同、模型可见说明、测试 fixture、历史文档、仅诊断反例”分类。

## 2. AgentAction 核心合同收敛

- [ ] 2.1 更新 `AgentAction` schema，使 `final_answer` 和 `ask_user` 都使用 `content` 承载用户可见文本。
- [ ] 2.2 将 terminal grounding 字段收敛为统一 `usedRefs`，并定义 `tool_result` / `resource` 两类 ref 的稳定结构。
- [ ] 2.3 更新 Action Validator，校验 `usedRefs` 的当前 run 归属、tool result satisfied 状态、resource role、resourceType 和成功 / 诊断收口边界。
- [ ] 2.4 删除 `ask_user.question`、`usedToolResultIds`、`usedResourceRefs` 的新生产 schema 路径，不做长期兼容转换。
- [ ] 2.5 更新 runtime 中 terminal action 状态判定、grounding 判断和 invalid action details，确保旧字段失败能进入可恢复 repair。
- [ ] 2.6 更新 `AgentAction` 相关类型注释，说明同一语义槽用同一字段，语义差异由 `type` 表达。

## 3. Renderer、聊天链路与 trace 投影

- [ ] 3.1 更新 Response Renderer，使 `final_answer.content` 和 `ask_user.content` 都投影为 NDJSON `content` 事件。
- [ ] 3.2 更新 `/api/chat` 文本聊天服务的 terminal action 分类、响应摘要和 trace summary，使其不再读取 `ask_user.question`。
- [ ] 3.3 更新前端 stream parser / controller / message 类型中与 terminal 文本字段相关的测试夹具，确认前端仍只消费 NDJSON `content`。
- [ ] 3.4 更新 ai trace / replay / fixture 断言，使 `ask_user`、terminal grounding 和 response rendering 的字段名与新合同一致。
- [ ] 3.5 确认生产聊天主链没有新增关键词、正则、同义词或短句模板分流。

## 4. Tool input 同义字段收敛

- [ ] 4.1 更新 `inspectVisibleTrainingProposals` input schema，使 `operation = "read_recent"` 使用统一 `ref` 字段。
- [ ] 4.2 更新 `inspectVisibleTrainingProposals` handler、projection、resource summary、trace summary 和 examples，删除顶层 `factRef` / `messageId` 新生产路径。
- [ ] 4.3 更新 `inspectVisibleTrainingProposals` repair feedback：顶层 `factRef` / `messageId` 被拒绝时，明确要求使用 `ref.type` 和 `ref.value`。
- [ ] 4.4 更新 `searchExerciseResources` input schema，只保留 `muscles` 数组字段，删除 `muscle` 新生产路径。
- [ ] 4.5 更新 `searchExerciseResources` handler、query summary、facetCatalog 说明、projection、trace summary 和 examples，确保单肌群也使用 `muscles: ["..."]`。
- [ ] 4.6 更新 `searchExerciseResources` repair feedback：旧 `muscle` 字段被拒绝时，明确说明使用 `muscles` 单项数组。

## 5. Prompt 与模型可见合同同步

- [ ] 5.1 更新默认 Agent LLM prompt，在靠前位置加入三类 `AgentAction` 的短 JSON 形状示例。
- [ ] 5.2 在 prompt 中明确 `final_answer` / `ask_user` 的用户可见文本都写入 `content`，差异由 `type` 表达。
- [ ] 5.3 在 prompt 中明确 terminal grounding 使用 `usedRefs`，不再使用 `usedToolResultIds` / `usedResourceRefs`。
- [ ] 5.4 更新 tool manifest、schema description、examples description 和 observation 文案，确保描述性自然语言默认中文，技术字段名保持英文原样。
- [ ] 5.5 更新 compressed tool results / repair observations，使旧字段不会以可用示例形式再次暴露给模型。

## 6. 测试与回归

- [ ] 6.1 更新 `tests/agent-core/planner-validator.test.ts`，覆盖合法 `final_answer.content`、合法 `ask_user.content`、合法 `usedRefs` 和旧字段拒绝。
- [ ] 6.2 更新 `tests/agent-core/executor-runtime-renderer.test.ts` 或对应 renderer 测试，断言 `ask_user.content` 输出 NDJSON `content`。
- [ ] 6.3 更新 `tests/chat-service.test.ts` 或最窄生产聊天测试，覆盖点击建议提问后模型输出合法 `ask_user.content` 不再触发 `repair_limit_exceeded`。
- [ ] 6.4 更新 `tests/agent-core/adapter-llm-planner.test.ts` 和 prompt config 测试，断言模型可见 prompt 包含新短 JSON 形状并不包含旧字段作为可用合同。
- [ ] 6.5 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts` 或对应最窄测试，覆盖 `ref` 成功、旧顶层 `factRef` / `messageId` 拒绝、repair details 和 projection。
- [ ] 6.6 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 `muscles` 单项 / 多项查询、旧 `muscle` 拒绝、repair details 和 manifest 文案。
- [ ] 6.7 更新 trace / replay / ai trace summary 相关测试，覆盖 invalid action schema 字段级 repair 和旧字段残留。
- [ ] 6.8 运行 `npm test -- tests/agent-core/planner-validator.test.ts tests/agent-core/executor-runtime-renderer.test.ts tests/agent-core/adapter-llm-planner.test.ts`。
- [ ] 6.9 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts tests/agent-tools/search-exercise-resources.test.ts` 或当前仓库对应最窄测试文件。
- [ ] 6.10 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts tests/agent-core/contract-helper.test.ts`。
- [ ] 6.11 运行 `npm run typecheck`。
- [ ] 6.12 运行 `openspec validate unify-agent-semantic-slot-fields --strict`。

## 7. 文档与收尾

- [ ] 7.1 用 `rg` 检查旧字段残留，确认旧字段只出现在迁移说明、拒绝测试或历史 archive 中，不出现在新生产 schema / prompt / manifest 主路径。
- [ ] 7.2 在 `docs/方案变更历史/` 新增上海时间文档，记录为什么同义语义槽字段分裂会影响模型稳定输出，以及本次如何收敛。
- [ ] 7.3 如实现影响项目主线，在 `docs/项目演变历程.md` 末尾追加简要记录。
- [ ] 7.4 最终 diff 检查，确认没有混入无关重构、无关格式化、无关依赖升级或服务端自然语言分流。
