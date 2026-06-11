## 1. 边界与合同确认

- [ ] 1.1 完成 Tool 抽象层级检查：确认 `searchExerciseResources` 的稳定 resource type 是发布态 `Exercise` 动作资源，能力族是只读 query，`zeroMatchMuscles` 属于该 tool 的 section-scoped 查询事实，不是通用 Agent prompt 规则。
- [ ] 1.2 对照 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 只允许修改 `searchExerciseResources` tool wrapper、repository 查询、projection、trace summary、配置和测试。
- [ ] 1.3 对照 `docs/llm-prompt-guidance.md` 和 `agent-prompt-contract-governance`，确认本 change 涉及的模型可见说明只落在 `searchExerciseResources` 的 description、schema description 或 tool result summary，不写入通用 Agent prompt。
- [ ] 1.4 确认禁止触碰 LangChain runtime 主循环、DeepSeek provider payload、`/api/chat` 主链路、production response adapter 主流程、`submitVisibleTrainingProposal` 终态校验合同和服务端自然语言分流。

## 2. Tool Schema 与投影合同

- [ ] 2.1 更新 `searchExerciseResourcesOutputSchema`，在 `groups.<section>` 下新增 `zeroMatchMuscles` 字段，字段为 canonical muscle facet 字符串数组。
- [ ] 2.2 更新 `toModelVisibleSummary`，让模型可见 summary 包含 `groups.<section>.zeroMatchMuscles`，并用中文说明该字段只表示当前 section 和当前过滤条件下的 0 命中请求肌群。
- [ ] 2.3 更新 `toUserProjection` 和 `toTraceSummary`，确保 `zeroMatchMuscles` 可用于诊断但不泄漏完整 handler output 或内部候选池。
- [ ] 2.4 更新 `searchExerciseResources` 的 description / schema description，说明多 `muscles` 查询会尽量均衡返回候选，并说明 `zeroMatchMuscles` 不表示数据库永久缺失或用户目标失败。
- [ ] 2.5 运行或更新 production tool catalog / model-visible contract 相关测试，确保新增说明为中文业务说明，技术字段名保持英文原样。

## 3. Repository 查询与均衡选择

- [ ] 3.1 在 `searchExerciseResources` 的 repository / handler 路径中实现多肌群独立 count，仅在 `muscles.length > 1` 时统计每个请求肌群在当前 section 和其他过滤条件下的匹配数量。
- [ ] 3.2 确保 `zeroMatchMuscles` 只来自独立 count 或等价可验证统计，不从最终 `exercises[]` 反推。
- [ ] 3.3 实现多肌群均衡候选选择：对非 0 命中的请求肌群按 round-robin 或等价分桶策略抽样，并按 `exerciseId` 去重。
- [ ] 3.4 保持 `requiredExerciseIds` 正向锚点优先，均衡抽样只填充剩余名额；保持 `excludeExerciseIds`、section hard filter policy、发布态过滤和 `maxReturnedPerSection` 上限。
- [ ] 3.5 保持 `query.totalMatches` 表示整体 OR 查询命中数量，不改为各肌群 count 求和；保持 `query.returnedCount`、`groups.<section>.returnedCount` 和 `truncated` 语义稳定。
- [ ] 3.6 如果实现需要新增可调策略或上限，放入集中配置模块，不在 handler 或 route 中散落运行参数。

## 4. 单测与回归覆盖

- [ ] 4.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖多肌群 `training` 查询返回候选尽量跨多个请求肌群，而不是固定 `name_asc` 前几条集中返回。
- [ ] 4.2 覆盖某个请求肌群在当前过滤条件下独立 count 为 0 时，`groups.training.zeroMatchMuscles` 包含该 canonical 肌群值。
- [ ] 4.3 覆盖某个请求肌群存在匹配但未进入最终返回列表时，不得出现在 `zeroMatchMuscles` 中。
- [ ] 4.4 覆盖单肌群或未传 `muscles` 时，`zeroMatchMuscles` 为空数组或不进入模型可见摘要中的复杂诊断。
- [ ] 4.5 覆盖 `requiredExerciseIds` 优先于均衡填充，且 required 动作冲突仍产生既有 diagnostics。
- [ ] 4.6 覆盖 `excludeExerciseIds` 不会被均衡填充绕过，被排除动作不会出现在 `groups.<section>.exercises[]` 中。
- [ ] 4.7 覆盖 model-visible summary、user projection 和 trace summary 中 `zeroMatchMuscles` 的安全投影，不暴露完整 handler output 或内部候选池。
- [ ] 4.8 覆盖没有新增服务端关键词、正则、同义词表、短句模板或具体 phrasing 路由；测试不得把“全身”作为服务端触发条件。

## 5. 验证与收尾

- [ ] 5.1 运行 `openspec validate balance-exercise-resource-muscle-coverage --strict`。
- [ ] 5.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts`。
- [ ] 5.3 如修改 production catalog、description 或 schema description，运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts` 或当前对应最窄测试。
- [ ] 5.4 如触碰 repository 查询或共享类型，运行 `npm run typecheck`。
- [ ] 5.5 做最终 diff 检查，确认没有修改 LangChain runtime 主循环、provider payload、`/api/chat` 主链路、production response adapter 主流程或新增服务端自然语言分流。
