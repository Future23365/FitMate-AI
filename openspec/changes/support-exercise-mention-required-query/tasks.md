## 1. 范围与合同确认

- [ ] 1.1 读取 `codex_logs/ai_trace_log.js`，确认失败链路是多点名动作请求只进入单个 `searchExerciseResources(q)` 查询，且未覆盖全部点名动作。
- [ ] 1.2 完成 Tool 抽象层级检查：说明 `resolveExerciseResourceMentions` 的稳定 resource 是 `Exercise`，能力族是 `resolve/query`，同类能力与 `searchExerciseResources` 的边界不同，`requiredExerciseIds` 属于查询 filter / inclusion hint 而不是输出类型。
- [ ] 1.3 确认允许触碰模块：新增 `agent-tools/exercises` tool bundle、扩展 `searchExerciseResources` tool / repository / projections / tests、更新 `ToolRegistry` 注册和模型可见 manifest。
- [ ] 1.4 确认禁止触碰模块：orchestrator main loop、`PlannerPort`、Executor main flow、Policy Guard、Resource Contract Validator、Response Renderer、`/api/chat` 语义分流，以及服务端关键词、正则、同义词表或自然语言模板路由。

## 2. `resolveExerciseResourceMentions` Tool

- [ ] 2.1 新增 `resolveExerciseResourceMentions` tool，定义 `name`、`version`、中文 `description` / `whenToUse` / `whenNotToUse`、`inputSchema`、`outputSchema`、policy metadata 和 examples。
- [ ] 2.2 实现 handler：只处理 Planner 结构化传入的 `mentions`，查询发布态数据库动作，按输入顺序返回 `matched`、`ambiguous` 或 `not_found`。
- [ ] 2.3 实现安全 `toModelObservation`、`toUserProjection` 和 trace summary，输出有限动作摘要，不泄漏完整 `Exercise` 记录、embedding、数据库对象或内部排序细节。
- [ ] 2.4 将 `resolveExerciseResourceMentions` 注册到 production `ToolRegistry`，不得注册 fixture tool 或新增 `/api/chat` 业务关键词路由。
- [ ] 2.5 为 `resolveExerciseResourceMentions` 新增 tool-level tests，覆盖“俯卧撑、深蹲、平板支撑”多点名解析、歧义、未命中、非法 input、数量上限、projection / redaction、trace summary 和 handler failure。

## 3. `searchExerciseResources.requiredExerciseIds`

- [ ] 3.1 扩展 `searchExerciseResourcesInputSchema`，新增去重、有数量上限、id 格式受控的 `requiredExerciseIds`。
- [ ] 3.2 更新 repository / handler，使合法 `requiredExerciseIds` 对应发布态动作可优先纳入现有 `groups.<section>.exercises` 列表，且不新增 `requiredMatches`、`supplementalMatches` 或并行输出字段。
- [ ] 3.3 更新 `query.appliedFilters` 或等价摘要，记录 `requiredExerciseIds` 的存在，但不泄漏无关历史 payload。
- [ ] 3.4 扩展现有 `diagnostics`，覆盖 required exercise 不存在、未发布、section 冲突、被排除、与筛选条件不完全一致等稳定 code。
- [ ] 3.5 更新 `toModelObservation`、`toUserProjection` 和 trace summary，确保模型仍只看到现有 `groups -> exercises` 主结构和必要诊断。

## 4. 模型可见合同与回归

- [ ] 4.1 更新 `resolveExerciseResourceMentions` 和 `searchExerciseResources` 的 manifest / schema description / examples，说明多点名动作应先解析 mention，再把 matched `exerciseId` 传入 `requiredExerciseIds`。
- [ ] 4.2 更新 tool registry / manifest tests，验证新 tool 暴露、描述性自然语言为中文、schema 包含 `mentions` 和 `requiredExerciseIds`，且无 handler / secret 泄漏。
- [ ] 4.3 更新 contract helper tests，验证两个 tool 的 policy、projection、redaction 和 trace 边界。
- [ ] 4.4 更新生产聊天回归或 replay tests，覆盖用户请求“包含俯卧撑、深蹲和平板支撑”时，模型可通过两个 tool 获得三个数据库动作事实，而不是只查第一个动作。

## 5. 验证

- [ ] 5.1 运行 `openspec validate support-exercise-mention-required-query --strict`。
- [ ] 5.2 运行 `npm test -- tests/agent-tools/resolve-exercise-resource-mentions.test.ts`。
- [ ] 5.3 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [ ] 5.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 5.5 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 5.6 如修改生产注册、prompt/model input、trace 或 response 投影，运行相关生产聊天回归测试。
- [ ] 5.7 运行 `npm run typecheck`。
- [ ] 5.8 运行 `git diff --check` 并检查最终 diff，确认未混入父线程中断 change、前端富卡片 change 或其他无关文件。
