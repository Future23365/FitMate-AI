## ADDED Requirements

### Requirement: 动作必须具备训练阶段和角色元数据
系统 SHALL 为可被 AI 推荐、计划生成或 Patch 使用的动作维护结构化元数据，用于服务端校验训练阶段、角色、难度、风险和替代关系。

#### Scenario: 动作进入候选集合
- **WHEN** Exercise Retrieval Service 返回某个动作作为候选
- **THEN** 该动作 MUST 提供 `allowedSections`
- **AND** 该动作 MUST 提供可用于排序或校验的 `intensityRole`、`movementPattern`、`difficulty` 和 `equipment`
- **AND** 系统 SHOULD 提供 `riskTags`、`contraindications`、降阶、进阶或替代分组信息

#### Scenario: 动作缺少关键元数据
- **WHEN** 某个动作缺少 `allowedSections` 或难度等关键元数据
- **THEN** 系统 MUST 使用保守默认或将其排除出需要严格校验的候选池
- **AND** 系统 MUST NOT 让该动作绕过 Validator 直接进入可保存训练内容

### Requirement: 动作检索必须按训练用途分池
系统 SHALL 返回按训练阶段和替代用途拆分的候选池，而不是只返回一个相关性列表。

#### Scenario: 构建 routine 或 plan 候选
- **WHEN** 系统为 routine 或 plan 检索动作
- **THEN** 检索结果 MUST 区分 warmupCandidates、trainingCandidates 和 stretchCandidates
- **AND** warmupCandidates MUST 只包含允许进入 warmup 的动作
- **AND** trainingCandidates MUST 只包含允许进入 training 的动作
- **AND** stretchCandidates MUST 只包含允许进入 stretch 的动作

#### Scenario: 构建 Patch 替代候选
- **WHEN** 用户要求替换、降阶或进阶某个动作
- **THEN** 检索结果 MUST 提供 substitution、regression 或 progression 候选
- **AND** 候选 MUST 满足原动作 section、器械、难度、风险和用户限制

### Requirement: 替代动作必须按显式关系优先排序
系统 SHALL 优先使用动作库中的显式替代关系选择替代动作，而不是只根据肌群相似度选择。

#### Scenario: 存在同组替代动作
- **WHEN** 目标动作有 `substitutionGroupId`
- **THEN** 系统 MUST 优先召回同 substitution group 的合法候选
- **AND** 候选仍然 MUST 通过 section、器械、难度和风险校验

#### Scenario: 用户要求降低难度
- **WHEN** 用户表达“太难”“换简单点”或等价降阶需求
- **THEN** 系统 SHOULD 优先使用 `regressionExerciseIds`
- **AND** 如果没有显式降阶动作，系统 MAY 使用同 movementPattern、同主肌群且难度更低的动作

### Requirement: Validator 必须拒绝非法阶段动作
系统 SHALL 在保存或展示训练草稿前校验动作与 section 的匹配关系。

#### Scenario: 主训练动作进入热身
- **WHEN** 训练草稿在 warmup section 中包含不允许进入 warmup 的动作
- **THEN** Validator MUST 拒绝该草稿或触发确定性修复
- **AND** 系统 MUST NOT 展示可保存的错误草稿

#### Scenario: 拉伸动作进入主训练
- **WHEN** 训练草稿在 training section 中包含仅允许 stretch 的动作
- **THEN** Validator MUST 拒绝该草稿或触发确定性修复
- **AND** trace 或校验结果 MUST 记录失败原因

#### Scenario: 模型返回候选外动作
- **WHEN** 模型返回的训练草稿或 Patch 指定的 `exerciseId` 不属于本次服务端候选集合
- **THEN** Validator MUST 拒绝该草稿或 Patch
- **AND** 校验结果 MUST 记录候选外动作 ID
