## ADDED Requirements

### Requirement: Agent 工具必须声明依赖、产出和修复元数据
统一 `AgentToolRegistry` 中的工具定义 SHALL 声明其执行所需资源、成功产出资源、可恢复失败类型和推荐修复路径，使 runtime 能基于结构化合同生成 `AgentDecisionFeedback`。

#### Scenario: 工具定义参与模型决策
- **WHEN** Agent registry 向模型暴露工具摘要
- **THEN** 模型可见摘要 MUST 包含工具可调用输入边界
- **AND** 服务端内部工具定义 MUST 保留 `requires`、`produces`、`recoverableFailures` 或等价元数据
- **AND** runtime MUST NOT 依赖 prompt 文案猜测工具依赖关系

#### Scenario: 工具调用缺少声明依赖
- **WHEN** 模型调用某个工具
- **AND** 该工具声明的必需资源在当前 run 中不存在
- **THEN** runtime MUST 在执行底层工具前拒绝该调用或返回结构化失败
- **AND** 可恢复时 MUST 生成包含缺失依赖和推荐下一步的 `AgentDecisionFeedback`

#### Scenario: 工具成功产出资源
- **WHEN** 工具成功执行并产出声明资源
- **THEN** runtime MUST 将资源 id 绑定到对应 tool result
- **AND** dependency graph MUST 能证明该资源的 producer
- **AND** 后续工具或 final result MUST 只能引用已登记资源

### Requirement: Agent 工具失败必须按可恢复性分类
系统 SHALL 将工具执行失败分类为可恢复、不可恢复或重复失败熔断，并在模型可见上下文中提供对应摘要。

#### Scenario: 可恢复工具失败
- **WHEN** 工具输入 Schema、依赖引用或可修正参数导致失败
- **AND** 工具定义标记该 failure code 可恢复
- **THEN** runtime MUST 生成 feedback
- **AND** feedback MUST 包含稳定 failure code、简短原因、可用资源和推荐修复路径

#### Scenario: 不可恢复工具失败
- **WHEN** 工具失败属于权限、跨用户数据、Policy 拒绝或无法访问当前用户资源
- **THEN** runtime MUST NOT 将该失败包装成可继续尝试的模型反馈
- **AND** 用户可见结果 MUST 使用 blocked 或 failed 语义
