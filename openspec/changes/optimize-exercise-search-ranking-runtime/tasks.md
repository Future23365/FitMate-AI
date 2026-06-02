## 1. 评测基线与诊断合同

- [ ] 1.1 梳理现有 `searchExercises`、`searchExercisesInMemory` 和 Agent `searchExercises` 工具调用路径，记录当前输入、输出、diagnostics 和 trace 字段；`searchArtifactsDetailed` 只作为 trace 形态对照，不修改其召回、排序或缓存行为。
- [ ] 1.2 新增动作检索 ranking fixture，覆盖“拜拜肉”“核心不稳”“圆肩”“无器械上肢”“不要跳跃”“进阶背部”“太难换简单点”等高频表达。
- [ ] 1.3 为结构化硬过滤补充测试，验证 `equipment`、`equipmentAvoided`、`bodyRegions`、`allowedSections`、`level` 和 `candidateUse` 不会被 text/vector 相似度绕过。
- [ ] 1.4 为 diagnostics 定义并测试 `queryMode = recall_gate | ranking_boost | disabled`、`cacheSource = database_load | process_cache | run_cache`、`cacheAgeMs`、`durationMs`、`totalExerciseCount`、`filteredCount`、`returnedCount` 和 top rerank score breakdown。

## 2. 动作检索轻量索引缓存

- [ ] 2.1 新增动作检索轻量投影类型，区分 `ExerciseSearchRecord` 与完整动作详情读取模型。
- [ ] 2.2 实现动作检索索引读取层，只读取过滤、排序、摘要和 embedding 所需字段。
- [ ] 2.3 增加进程内缓存、固定 `300_000ms` TTL 和显式刷新函数，确保数据库未配置或缓存构建失败时返回可诊断错误。
- [ ] 2.4 将 `searchExercises` 的数据来源切换为轻量索引缓存，同时保持公开函数签名和调用方行为稳定。
- [ ] 2.5 保留 `getExerciseById`、Validator、Patch、保存和卡片展示所需的完整动作详情按需读取路径。

## 3. 评分算法优化

- [ ] 3.1 引入 `queryMode = recall_gate | ranking_boost | disabled`，并按 spec 更新 query text/vector scoring 参与方式。
- [ ] 3.2 引入按 `candidateUse` 区分的 ranking profile，替代全局固定 `beginner`、`training` 或等价默认加分。
- [ ] 3.3 将 business score 改为基于结构化输入、section、难度目标、目标肌群、器械约束、训练用途和动作元数据分层计算。
- [ ] 3.4 保留 `local-hash-v1` text/vector scoring 作为召回和排序辅助，并确保 hard filters 始终先于评分执行。
- [ ] 3.5 更新 `searchExercisesInMemory` diagnostics，输出 top rerank 的 text score、vector score、business score、total score 和原因摘要。
- [ ] 3.6 覆盖 `patch` 查询边界：裸 query 的 `patch` 继续由 Agent tool 输入层拒绝，带结构化过滤字段的 `patch` 使用 `ranking_boost`。

## 4. Agent 工具复用与 Trace

- [ ] 4.1 检查现有 Agent runtime idempotency key 是否已实际复用工具结果，补齐同一 run、同一 userId、同一 sessionId、同一规范化输入下的 `searchExercises` 成功结果复用。
- [ ] 4.2 确保参数变化后的 `searchExercises` 会重新检索，不用旧失败结果阻断 LLM 修复后的重试。
- [ ] 4.3 将 `searchExercises` 的 `cacheSource`、`queryMode`、`durationMs`、`totalExerciseCount`、`filteredCount`、`returnedCount` 和 top rerank score breakdown 写入 Agent tool result trace 摘要。
- [ ] 4.4 保持 trace 字段长度和权限边界，不记录完整动作大字段或未经授权 artifact payload。

## 5. 调用方兼容与回归

- [ ] 5.1 更新 `workout-plans`、`workout-patches`、`exercise-recommendations` 等动作候选调用方，确保它们可以消费新的轻量候选和 diagnostics；不得改变 `searchArtifactsDetailed` 行为。
- [ ] 5.2 确保 routine / plan / patch 的候选集合、`candidateSetId`、Validator 和保存路径仍只接受服务端候选内真实 `exerciseId`。
- [ ] 5.3 更新或补充 Agent 工具测试，覆盖结构化工具输入、`patch` 裸 query 拒绝、retryable unknown facet 诊断和等价检索复用。
- [ ] 5.4 按需更新详细 LLM 黑盒测试断言，验证用户可见结果不因评分优化出现候选外动作或违反器械约束。

## 6. 文档与验证

- [ ] 6.1 在 `docs/方案变更历史` 新增方案变更记录，说明动作检索从全量读取和固定加权升级为轻量缓存与 ranking profile。
- [ ] 6.2 如果实现改变核心链路行为，在 `docs/项目演变历程.md` 末尾追加本次演进记录，时间使用上海 UTC+8 精确到秒。
- [ ] 6.3 运行 `openspec validate optimize-exercise-search-ranking-runtime --strict`。
- [ ] 6.4 运行相关单元测试，至少覆盖 `tests/exercise-service.test.ts`、Agent `searchExercises` 工具测试和受影响候选服务测试。
- [ ] 6.5 运行 `npm run typecheck`，如修改构建边界或服务端/客户端模块边界，再运行 `npm run build` 或说明无法运行原因。
