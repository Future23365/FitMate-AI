## ADDED Requirements

### Requirement: `searchExerciseResources` 语义检索接入必须分阶段
系统 SHALL 将 `searchExerciseResources` 的语义检索能力放在第二阶段接入。第一阶段只允许建设 Exercise 索引基础设施，不得改变该 tool 的模型可见合同或执行行为。

#### Scenario: 第一阶段不改变 tool 合同
- **WHEN** 第一阶段实现完成
- **THEN** `searchExerciseResources` input schema MUST NOT 因第一阶段新增或删除字段
- **AND** `searchExerciseResources` manifest、schema description、examples 和 model observation MUST NOT 因第一阶段改变
- **AND** `searchExerciseResources` handler 和 repository MUST NOT 因第一阶段改用向量检索
- **AND** `/api/chat` MUST NOT 因第一阶段新增关键词路由、toolName 分支或服务端自然语言分流

#### Scenario: 第二阶段接入语义检索
- **WHEN** 第二阶段实现 `searchExerciseResources` 语义检索
- **THEN** 系统 MAY 调整 `q` 的 repository 语义
- **AND** `q` MUST 作为 hard filters 之后的 recall / ranking signal
- **AND** `q` MUST NOT 作为额外 hard filter
- **AND** 结构化字段 MUST 继续作为数据库 hard filters

### Requirement: `searchExerciseResources.q` 必须支持 support section 语义排序
`searchExerciseResources` SHALL support warmup、stretch and other support-section exercise discovery through existing section / facet hard filters plus semantic `q` ranking, instead of adding many narrow intent parameters.

#### Scenario: 查询热身或拉伸动作
- **WHEN** Planner 调用 `searchExerciseResources`
- **AND** input 包含合法 section / suitability hard filter，例如 warmup 或 stretch
- **AND** input 包含合法结构化约束，例如 `equipment = "no_equipment"`、`muscles`、`level` 或其他 facet
- **AND** input 包含 `q` 表达部位、动作模式、热身、拉伸或相近语义
- **THEN** repository MUST 先执行结构化 hard filters
- **AND** repository MUST 在 hard-filtered candidate scope 内使用 `q` 做 text / vector / business ranking
- **AND** 返回动作 MUST 满足所有结构化 hard filters
- **AND** tool result MUST NOT 因 `q` 文本自动添加、删除或放宽结构化筛选条件

#### Scenario: 不新增细碎语义参数
- **WHEN** 第二阶段更新 `searchExerciseResources` schema
- **THEN** schema SHOULD continue using existing stable fields for section、器械、肌群、难度、风险、点名动作和排除动作
- **AND** schema MUST NOT 新增专门用于“胸部热身”“胸部拉伸”“support section 目标”或具体自然语言意图的字段
- **AND** 模型可见说明 MUST 引导 Planner 使用现有 hard filters 加 `q` 表达语义排序目标

### Requirement: `searchExerciseResources.q` 不得绕过 hard filters
系统 SHALL 保证 `q` 只影响召回和排序，不改变结构化过滤的确定性边界。

#### Scenario: q 不放宽 hard filters
- **WHEN** `searchExerciseResources` input 同时包含 `q` 和结构化 filters
- **THEN** repository MUST 在数据库层应用结构化 filters
- **AND** 不满足结构化 filters 的动作 MUST NOT 出现在 `exercises` 或 `groups.<section>.exercises[]`
- **AND** repository MUST NOT 因 hard-filtered result 较少或为空而自动删除 `equipment`、`suitabilities`、`muscles`、`level`、`homeRequirement`、`riskTag`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** tool result MAY 返回空结果、诊断或排序摘要
- **AND** 是否换用其他结构化条件重查、澄清或失败收口 MUST 由 Planner 基于可见 tool result 自主决定

#### Scenario: q 不增加隐藏 hard filters
- **WHEN** `q` 包含自然语言部位、器械、场地、难度或 section 描述
- **THEN** 服务端 MUST NOT 从 `q` 解析隐藏 hard filters
- **AND** 服务端 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板改写 input
- **AND** hard filters MUST 只来自 schema 中显式合法字段

### Requirement: `searchExerciseResources` 语义检索必须保持只读动作事实职责
`searchExerciseResources` SHALL remain a read-only Exercise database fact query tool after semantic retrieval is introduced.

#### Scenario: 语义检索不生成训练方案
- **WHEN** 第二阶段 `searchExerciseResources` 使用 `q` 完成语义排序
- **THEN** tool result MUST 继续返回动作事实摘要、查询摘要、section 分组和诊断
- **AND** tool result MUST NOT 生成 routine、plan、patch、训练卡片、保存事件或用户记忆
- **AND** tool result MUST NOT 包含 `candidateSetId`
- **AND** tool result MUST NOT 产出 `candidate_set` resource
- **AND** 最终 `visibleTrainingProposal` MUST 继续由 Planner 输出并由 terminal validator 校验

#### Scenario: 语义检索 trace 可诊断
- **WHEN** `searchExerciseResources` 使用 `q` 执行语义检索
- **THEN** trace summary SHOULD 包含 `q`、applied hard filters、embedding version、hard-filtered candidate count、semantic recall count、returned count、truncated、ranking summary 和最终 exerciseId
- **AND** trace summary MUST NOT 暴露完整数据库对象、secret、跨用户 payload 或未经摘要的大 payload

### Requirement: `searchExerciseResources` 语义检索必须具备回归验证
系统 SHALL 为第二阶段 `searchExerciseResources.q` 语义检索提供 tool-level、repository-level、manifest / contract 和 trace 验证。

#### Scenario: 验证 support section 召回
- **WHEN** 第二阶段实现完成
- **THEN** 测试 MUST 覆盖 warmup 或 stretch section hard filter 加 `q` 的查询
- **AND** 测试 MUST 证明返回动作满足 `equipment`、section、发布态和其他显式 hard filters
- **AND** 测试 SHOULD 覆盖类似胸部热身或胸部拉伸的语义排序目标
- **AND** 测试 MUST 不依赖服务端从用户原文做关键词路由

#### Scenario: 验证不使用全量读取旧路径
- **WHEN** `searchExerciseResources` 使用 `q` 查询
- **THEN** 测试 MUST 证明 repository 没有调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口
- **AND** 测试 MUST 证明结构化 hard filters 被下推到数据库查询或等价受控查询边界
