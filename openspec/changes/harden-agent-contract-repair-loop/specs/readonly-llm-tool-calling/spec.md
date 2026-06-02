## ADDED Requirements

### Requirement: Agent 工具必须声明依赖、产出和修复元数据
统一 `AgentToolRegistry` 中的工具定义 SHALL 声明其执行所需资源、成功产出资源、可恢复失败类型和推荐修复路径，使 runtime 能基于结构化合同生成 `AgentDecisionFeedback`。

#### Scenario: 工具定义规范化为资源合同
- **WHEN** Agent registry 注册工具定义
- **THEN** 系统 MUST 将现有依赖字段和新增元数据规范化为单一 `resourceContract` 或等价结构
- **AND** 该合同 MUST 包含 `requires`、`produces`、`recoverableFailures`、`nextOnSuccess` 和 final result 要求
- **AND** runtime、模型可见工具摘要、dependency graph 和 trace MUST 基于同一份规范化合同
- **AND** 系统 MUST NOT 从工具名、prompt 文案或手写流程说明隐式推断依赖关系

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
- **AND** runtime 分类确认该失败未触碰权限、用户隔离、Policy 或不可访问资源边界
- **THEN** runtime MUST 生成 feedback
- **AND** feedback MUST 包含稳定 failure code、简短原因、可用资源和推荐修复路径

#### Scenario: retryable 字段不能单独放行修复
- **WHEN** 工具结果包含 `retryable: true`
- **AND** 工具 `resourceContract.recoverableFailures` 未声明该 failure code 可恢复
- **THEN** runtime MUST NOT 仅凭 `retryable` 进入模型修复循环
- **AND** 系统 MUST 按严格失败、blocked 或需要澄清处理该边界

#### Scenario: 不可恢复工具失败
- **WHEN** 工具失败属于权限、跨用户数据、Policy 拒绝或无法访问当前用户资源
- **THEN** runtime MUST NOT 将该失败包装成可继续尝试的模型反馈
- **AND** 用户可见结果 MUST 使用 blocked 或 failed 语义
