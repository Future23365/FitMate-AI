## ADDED Requirements

### Requirement: `searchExerciseResources` 必须按 section 应用 hard filter policy
系统 SHALL 让 `searchExerciseResources` 在构造数据库查询前按目标 section 选择 hard filter policy。`training` SHALL 使用严格训练动作 policy；`warmup` 和 `stretch` SHALL 使用 `support_section` policy。该 policy 选择 MUST 只基于 Planner 显式传入并通过 schema 校验的 `suitabilities`，不得基于用户原文、关键词、正则、短句模板、历史摘要、`q` 文本或查询结果是否为空。

#### Scenario: training 查询保持严格结构化过滤
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["training"]`
- **AND** 输入包含 `equipment`、`homeRequirement`、`muscles`、`level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **THEN** repository MUST 按 `training` policy 将这些合法结构化字段转换为数据库可执行 hard filters
- **AND** 查询 MUST 继续在数据库层下推
- **AND** 查询 MUST NOT 回到全量动作读取后内存过滤

#### Scenario: warmup 查询使用 support section hard filters
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["warmup"]`
- **AND** 输入包含 `equipment = "no_equipment"`、`muscles = ["胸部"]` 和 `level = "intermediate"`
- **THEN** repository MUST 按 `support_section` policy 应用发布态、`warmup` section、器械和肌群 hard filters
- **AND** repository MUST NOT 将 `level` 作为该 `warmup` 查询的 hard filter
- **AND** tool output MUST 通过 `filterApplications` 或等价结构声明 `level` 未作为该 section 的 hard filter 使用

#### Scenario: stretch 查询使用 support section hard filters
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["stretch"]`
- **AND** 输入包含 `equipment`、`homeRequirement`、`muscles`、`category`、`goalTag`、`riskTag` 或 `q`
- **THEN** repository MUST 按 `support_section` policy 应用发布态、`stretch` section、器械、场地和肌群 hard filters
- **AND** repository MUST NOT 将 `category`、`goalTag`、`riskTag` 或 `q` 作为该 `stretch` 查询的 hard filters
- **AND** tool output MUST 通过 `filterApplications` 或等价结构声明这些未作为 hard filter 使用的输入字段

#### Scenario: 混合 section 查询分别记录 hardFilterPolicy
- **WHEN** `searchExerciseResources` 输入包含 `suitabilities = ["training", "warmup", "stretch"]`
- **AND** 输入包含 `equipment`、`muscles` 和 `level`
- **THEN** repository MUST 分别按 section 构造查询
- **AND** `training` 查询 MUST 应用 `level` hard filter
- **AND** `warmup` 与 `stretch` 查询 MUST NOT 应用 `level` hard filter
- **AND** output MUST 分别记录 `training`、`warmup` 和 `stretch` 的 `filterApplications`

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 或等价 production entrypoint 收到用户自然语言输入
- **THEN** route、Agent core、handler 和 repository MUST NOT 根据用户原文选择、改写或放宽 `searchExerciseResources` 的 section、器械、肌群、难度、`q` 或其他输入字段
- **AND** 系统 MUST NOT 新增关键词、正则、同义词表、短句模板或具体 phrasing 分支来修复 support section 查询

### Requirement: `searchExerciseResources` 必须结构化披露 section 级 filter 执行事实
系统 SHALL 在 `searchExerciseResources` 成功 output 中返回 section 级 filter 执行摘要。该摘要 MUST 使用结构化字段表达 hard filter policy、已应用 hard filters 和未作为 hard filter 使用的输入字段；MUST NOT 使用自由文本 `resultBoundary` 或等价自然语言解释句作为唯一执行边界来源。

#### Scenario: output 包含 filterApplications
- **WHEN** `searchExerciseResources` 使用合法输入完成数据库查询
- **THEN** output MUST 包含 `query.filterApplications` 或等价结构化字段
- **AND** 每个 section 条目 MUST 至少包含 `section`、`hardFilterPolicy`、`appliedHardFilters` 和 `unappliedInputFilters`
- **AND** `hardFilterPolicy` MUST 使用稳定枚举值，例如 `training` 或 `support_section`
- **AND** `hardFilterPolicy` MUST 只表示该 section 的数据库 hard filter 口径，不得表达 Planner 下一步行为策略
- **AND** `appliedHardFilters` MUST 只列出该 section 查询实际作为 hard filter 使用的字段
- **AND** `unappliedInputFilters` MUST 只列出 Planner 已传入但该 section hard filter policy 未作为 hard filter 使用的输入字段

#### Scenario: 未应用输入字段使用稳定 reason code
- **WHEN** Planner 为 `warmup` 或 `stretch` 查询传入 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 或 `q`
- **THEN** `unappliedInputFilters` MUST 为每个未应用字段包含 `field` 和稳定 `code`
- **AND** `code` MUST 使用机器可读枚举，例如 `not_applied_as_hard_filter_for_support_section`
- **AND** output MAY 包含字段值摘要 `valueSummary`
- **AND** `valueSummary` MUST 经过脱敏和截断
- **AND** model observation 和 trace summary MUST NOT 把自由文本 `q` 原文作为 `unappliedInputFilters` 值回灌
- **AND** output MUST NOT 暴露完整数据库对象、完整 handler output、secret 或跨用户 payload

#### Scenario: model observation 投影 filterApplications
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含 section 级 `filterApplications` 摘要
- **AND** observation MUST 说明这些字段是 tool 实际执行事实
- **AND** observation MUST NOT 要求 Planner 按固定顺序继续调用 tool
- **AND** observation MUST NOT 判断最终 routine、plan、visibleOutputs 或用户目标是否已经满足
- **AND** observation MUST NOT 将 `hardFilterPolicy` 描述为 Planner 下一步行为策略

#### Scenario: trace summary 可诊断 filter policy
- **WHEN** `searchExerciseResources` 被 production Agent 调用
- **THEN** trace summary MUST 记录每个 section 的 `hardFilterPolicy`、applied hard filter 字段名、未应用输入字段名和 reason code
- **AND** trace summary MUST NOT 记录完整 handler output、完整动作数据库对象、secret 或未经摘要的大 payload

#### Scenario: filterApplications 与数据库 where 使用同一 policy helper
- **WHEN** repository 为某个 section 构造数据库查询
- **THEN** 系统 MUST 使用同一个 section-aware hard filter policy helper 决定该 section 的数据库 where 字段和 `filterApplications` 摘要
- **AND** 系统 MUST NOT 为 where 构造和 `filterApplications` 摘要维护两套可漂移的字段清单
- **AND** 该 helper MUST NOT 读取用户原文、查询结果、trace 或模型自然语言输出

## MODIFIED Requirements

### Requirement: `searchExerciseResources` 必须下推数据库查询且不得全表读取

系统 SHALL 为 `searchExerciseResources` 使用专用动作资源查询 repository，在数据库层执行发布态、结构化数据库 facet、tool 合同层确定性映射、section-aware hard filter policy 和排除条件筛选，并避免每次 tool 调用读取全量 `Exercise` 数据后再内存过滤。Repository MUST NOT 使用 `bodyRegions` 或服务端区域展开构造查询。

#### Scenario: Repository 查询下推结构化筛选
- **WHEN** `searchExerciseResources` handler 接收到合法结构化输入
- **THEN** handler MUST 调用专用 repository 查询入口，而不是调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** repository MUST 将 `published`、`category`、`suitabilities`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`q`、`requiredExerciseIds` 和 `excludeExerciseIds` 按当前 section 的 hard filter policy 转换为数据库可执行 `where` 条件
- **AND** repository MUST 对 `training` 查询应用 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 和 `q` hard filters
- **AND** repository MUST 对 `warmup` 和 `stretch` 查询只应用发布态、section、器械、场地、肌群、`requiredExerciseIds` 和 `excludeExerciseIds` hard filters
- **AND** repository MUST 将 `warmup` 和 `stretch` 查询中传入但未作为 hard filter 使用的字段记录到 `filterApplications.unappliedInputFilters`
- **AND** repository MUST 将 `equipment = "no_equipment"` 或 `"无器械"` 映射为数据库自重动作查询条件，例如 `equipment = "body only"` 或 `equipmentZh = "自重"`
- **AND** repository MUST NOT 因 `equipment = "no_equipment"` 或 `"无器械"` 自动添加 `homeRequirement = "none"`、`homeRequirementZh = "无器械"` 或等价居家条件过滤
- **AND** repository MUST 将 `muscle` 与 `muscles` 合并去重后，在 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 中执行 OR 查询
- **AND** repository MUST NOT 引用 `bodyRegions`、`expandExerciseBodyRegionTargetMuscles` 或等价区域展开逻辑
- **AND** repository MUST 使用同一 section hard filter policy 下的 `where` 执行 `count()` 来生成该 section 的 `totalMatches`
- **AND** repository MUST 使用服务端内部固定 `maxReturned` 执行 `findMany({ take: maxReturned + 1 })` 或等价查询来判断 `truncated`
- **AND** `maxReturned`、`take`、`offset`、`page` 或 `pageSize` MUST NOT 由 LLM 输入控制

#### Scenario: 显式环境条件叠加过滤
- **WHEN** `searchExerciseResources` 输入同时包含 `equipment = "no_equipment"` 和合法 `homeRequirement`
- **THEN** repository MUST 同时应用自重动作查询条件和该环境条件
- **AND** 该环境条件 MUST 来自 Planner 显式输入
- **AND** repository MUST NOT 根据用户原文或 `equipment` 值自动选择 `floor`、`support`、`none` 或其他环境条件
