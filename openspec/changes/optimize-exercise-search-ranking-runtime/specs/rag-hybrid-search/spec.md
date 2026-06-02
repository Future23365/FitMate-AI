## MODIFIED Requirements

### Requirement: Rerank 必须结合业务规则
系统 SHALL 在混合检索后使用可解释的业务特征对候选排序，并且动作排序 MUST 使用按候选用途区分的 ranking profile。

#### Scenario: 动作候选排序
- **WHEN** 系统获得全文和向量召回候选
- **THEN** rerank MUST 综合目标匹配、primaryMuscles、movementPattern、用户反馈、新鲜度、疲劳和 progression fit
- **AND** 排序结果 MUST 保留可追踪原因摘要

#### Scenario: 按候选用途应用 ranking profile
- **WHEN** `searchExercises` 为 `answer_only`、`recommendation`、`routine`、`plan` 或 `patch` 生成候选
- **THEN** 系统 MUST 使用对应候选用途的 ranking profile 计算 text、vector 和 business score
- **AND** business score MUST 基于结构化输入、`allowedSections`、难度目标、目标肌群、器械约束、训练用途和动作元数据计算
- **AND** 系统 MUST NOT 对所有候选用途无条件套用同一组 `beginner`、`training` 或等价固定加分

#### Scenario: Query 作为召回门
- **WHEN** `searchExercises` 只有裸 `query` 或缺少可执行结构化候选边界
- **THEN** 系统 MAY 将 query text/vector score 作为召回门
- **AND** 未达到最低相关性阈值的候选 MUST NOT 进入最终候选集合

#### Scenario: Query 只作为排序增强
- **WHEN** `searchExercises` 已经包含 `candidateUse = recommendation`、`routine`、`plan` 或 `patch` 所需的结构化候选边界
- **THEN** query text/vector score MUST 只影响合法候选之间的排序
- **AND** query text/vector score MUST NOT 将已经通过结构化 hard filters 的合法候选硬清零
- **AND** 器械、section、难度、目标肌群、用户限制和候选集合边界 MUST 继续优先于 query 相似度

#### Scenario: 禁用 query 评分
- **WHEN** 检索输入没有 query 或调用方明确不允许自然语言 query 影响排序
- **THEN** 系统 MUST 跳过 query text/vector scoring
- **AND** 排序 MUST 只基于结构化输入、业务 profile 和候选元数据

## ADDED Requirements

### Requirement: 动作检索必须使用轻量索引缓存
系统 SHALL 为 `searchExercises` 提供服务端轻量检索索引缓存，避免每次工具调用都读取完整动作详情。

#### Scenario: 构建动作检索索引
- **WHEN** `searchExercises` 首次需要动作检索数据或缓存过期
- **THEN** 系统 MUST 从 PostgreSQL 读取检索所需字段并构建轻量动作检索索引
- **AND** 轻量索引 MUST 包含过滤、排序、摘要和 embedding 所需字段
- **AND** 轻量索引 MUST NOT 强制包含完整图片、完整 instructions、sourceUrl 或其他只用于详情展示的大字段

#### Scenario: 使用缓存执行动作检索
- **WHEN** 动作检索索引缓存可用且未过期
- **THEN** `searchExercises` MUST 使用缓存中的轻量索引执行 hard filters、hybrid scoring 和 rerank
- **AND** 系统 MUST NOT 为同一次检索重新全量读取完整动作详情

#### Scenario: 读取完整动作详情
- **WHEN** 卡片展示、Validator、Patch、保存或 `getExerciseById` 需要完整动作事实
- **THEN** 系统 MUST 按 `exerciseId` 从数据库或受控详情读取层获取完整动作详情
- **AND** 轻量索引缓存 MUST NOT 替代完整详情事实源

#### Scenario: 缓存刷新和失败
- **WHEN** 动作检索索引缓存过期、被显式刷新或数据库动作发生受控更新
- **THEN** 系统 MUST 重新构建缓存或在下一次检索前刷新缓存
- **AND** 数据库未配置、数据库读取失败或缓存构建失败时，系统 MUST 暴露可诊断错误
- **AND** 系统 MUST NOT 在未声明 stale fallback 语义的情况下用过期缓存伪装成功

### Requirement: Agent run 内必须复用等价动作检索结果
系统 SHALL 在一次 Agent run 内复用等价 `searchExercises` 工具结果，减少重复检索和重复评分。

#### Scenario: 等价成功检索复用
- **WHEN** 同一 Agent run、同一 userId、同一 sessionId 中再次调用 `searchExercises`
- **AND** 规范化后的工具输入与已成功执行的检索输入等价
- **THEN** 系统 MUST 复用已登记的成功 tool result 或等价检索结果
- **AND** 复用结果 MUST 继续保留原始 `candidateSetId`、候选摘要和 diagnostics

#### Scenario: 参数变化后重新检索
- **WHEN** LLM 根据 retryable diagnostics 修改了 `targetMuscles`、`equipment`、`bodyRegions`、`candidateUse`、`allowedSections` 或其他检索字段
- **THEN** 系统 MUST 将该调用视为新的检索输入
- **AND** 系统 MUST 执行新的检索或命中对应的新缓存键

#### Scenario: 失败结果处理
- **WHEN** `searchExercises` 返回 retryable failure 或 schema validation failure
- **THEN** 系统 MUST NOT 用旧失败结果阻止 LLM 以修正参数重新查询
- **AND** trace MUST 能区分真实执行、run-level reuse 和失败重试

### Requirement: 检索诊断必须暴露性能和评分证据
系统 SHALL 在动作和 artifact 混合检索 diagnostics / trace 中记录足够定位性能和排序问题的证据。

#### Scenario: 记录动作检索 diagnostics
- **WHEN** `searchExercises` 执行完成
- **THEN** diagnostics MUST 包含 `candidateUse`、结构化 filters、query 参与模式、总动作数、hard filter 后候选数、返回候选数和最终 exerciseId
- **AND** diagnostics MUST 包含 top rerank 的 text score、vector score、business score、total score 和原因摘要

#### Scenario: 记录缓存和耗时
- **WHEN** `searchExercises` 执行完成或复用完成
- **THEN** trace 或 diagnostics MUST 记录 cache source、cache age、检索耗时、评分耗时或等价性能摘要
- **AND** trace MUST 能区分数据库加载、进程内缓存命中和 Agent run 内复用

#### Scenario: 字段长度和权限边界
- **WHEN** 检索 trace 包含 rerank、query、filters 或候选摘要
- **THEN** 系统 MUST 遵守现有 trace 字段长度、权限和隐私限制
- **AND** trace MUST NOT 记录未经授权的 artifact payload 或不必要的大动作详情字段

### Requirement: 动作检索排序必须具备固定评测集
系统 SHALL 为动作检索评分和性能优化提供固定自动化测试，防止排序策略回归。

#### Scenario: 模糊召回评测
- **WHEN** 测试执行“拜拜肉”“核心不稳”“圆肩”等模糊动作需求
- **THEN** 系统 MUST 在合法候选中召回对应目标肌群或姿态相关动作
- **AND** trace diagnostics MUST 说明 text/vector/business score 中至少一个有效匹配原因

#### Scenario: 结构化硬过滤评测
- **WHEN** 测试同时提供 query 和 `equipmentAvoided`、`equipment`、`bodyRegions`、`allowedSections` 或 `level`
- **THEN** 系统 MUST 保证不满足结构化硬过滤的动作不会进入最终候选集合
- **AND** 向量相似度 MUST NOT 绕过这些过滤条件

#### Scenario: 候选用途排序评测
- **WHEN** 测试分别以 `recommendation`、`routine`、`plan` 和 `patch` 调用 `searchExercises`
- **THEN** 系统 MUST 验证不同 `candidateUse` 使用不同 ranking profile
- **AND** 测试 MUST 覆盖 warmup、training、stretch、替代、降阶或进阶中的至少三类候选排序

#### Scenario: 运行时性能评测
- **WHEN** 测试连续多次以等价参数调用 `searchExercises`
- **THEN** 系统 MUST 验证后续调用可以命中进程内缓存或 Agent run 内复用
- **AND** diagnostics MUST 暴露缓存命中状态和候选计数
