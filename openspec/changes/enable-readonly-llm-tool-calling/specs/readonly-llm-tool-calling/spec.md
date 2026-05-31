## ADDED Requirements

### Requirement: 系统必须提供只读 LLM Tool Registry
系统 SHALL 提供服务端只读 tool registry，用于集中注册 LLM 可选择的只读工具。

#### Scenario: 注册只读工具
- **WHEN** 服务端启动或构建聊天编排工具集合
- **THEN** registry MUST 至少包含 `searchArtifacts`、`getArtifactPayload`、`getExerciseById` 和 `searchExercises`
- **AND** 每个工具 MUST 声明名称、描述、输入 Schema、输出摘要策略、Trace 摘要策略和执行函数
- **AND** registry MUST NOT 注册写入、删除、持久化或修改训练计划的工具

#### Scenario: 工具名称不在 registry 中
- **WHEN** LLM 请求调用未注册工具
- **THEN** 系统 MUST 拒绝执行该工具
- **AND** 系统 MUST 记录可诊断错误
- **AND** 系统 MUST NOT 将未知工具请求转发到任意服务端函数

### Requirement: 只读工具执行必须经过服务端校验
系统 SHALL 在执行任何 LLM 选择的只读工具前完成服务端 Schema、权限和边界校验。

#### Scenario: 工具入参合法
- **WHEN** LLM 选择已注册只读工具并提供参数
- **THEN** 系统 MUST 使用该工具的 Zod Schema 或等价服务端 Schema 校验参数
- **AND** 工具执行上下文 MUST 包含当前 `userId`、`sessionId`、trace 和请求预算信息
- **AND** 工具 MUST 在服务端执行当前用户权限过滤

#### Scenario: 工具入参非法
- **WHEN** LLM 提供的工具参数未通过 Schema 校验
- **THEN** 系统 MUST 拒绝执行工具
- **AND** 系统 MUST 记录校验失败原因
- **AND** 系统 MUST 进入回退或澄清流程

#### Scenario: 工具参数尝试越权读取
- **WHEN** LLM 提供其他用户、其他 session 或不可访问 artifact 的标识
- **THEN** 工具 MUST 返回权限或未找到失败结果
- **AND** 系统 MUST NOT 暴露目标资源是否属于其他用户的敏感细节

### Requirement: LLM 只读 tool loop 必须受步数和预算限制
系统 SHALL 在聊天编排中使用受限 tool loop，让 LLM 最多执行配置允许的只读工具步骤。

#### Scenario: 工具步骤在限制内完成
- **WHEN** LLM 选择只读工具且步骤数未超过上限
- **THEN** 系统 MUST 执行该工具并将摘要化结果加入 tool context bundle
- **AND** 后续模型请求 MUST 只能看到摘要化工具结果

#### Scenario: 工具步骤超过限制
- **WHEN** LLM 连续请求工具且达到最大步骤数
- **THEN** 系统 MUST 停止继续执行工具
- **AND** 系统 MUST 基于已有上下文生成回复、进入澄清或回退到原编排路径
- **AND** trace MUST 记录 step limit 触发

### Requirement: 只读工具结果必须摘要化后再进入模型上下文
系统 SHALL 对所有工具结果执行模型上下文摘要，避免完整大 payload 或无关私密字段进入下一次模型请求。

#### Scenario: 工具返回 artifact payload
- **WHEN** `getArtifactPayload` 返回完整 artifact payload
- **THEN** 系统 MUST 先按 artifact kind 生成模型可见摘要
- **AND** 模型可见摘要 MUST 保留回答所需的标题、类型、训练结构、动作 id 和关键训练字段
- **AND** 模型可见摘要 MUST NOT 包含无关大 payload、其他用户数据或未校验原始字段

#### Scenario: 工具返回候选列表
- **WHEN** `searchArtifacts` 或 `searchExercises` 返回候选列表
- **THEN** 系统 MUST 限制候选数量和单项字段长度
- **AND** 模型可见内容 MUST 是候选摘要而不是数据库完整记录

### Requirement: 只读工具失败必须有确定性回退
系统 SHALL 在只读工具调用失败时保持聊天主链路可恢复。

#### Scenario: 工具执行失败
- **WHEN** 只读工具因请求失败、权限失败、Schema 失败或数据校验失败而返回错误
- **THEN** 系统 MUST 记录失败 code
- **AND** 系统 MUST NOT 继续使用失败工具的未校验输出
- **AND** 系统 MUST 生成澄清回复、使用已有上下文回复或回退到当前固定编排路径

#### Scenario: LLM 未选择工具
- **WHEN** 当前场景允许工具调用但 LLM 未选择任何工具
- **THEN** 系统 MUST 继续使用当前可用上下文生成回复
- **AND** 系统 MUST NOT 因未选择工具而中断聊天请求

### Requirement: 写能力不得通过只读 tool loop 暴露给 LLM
系统 SHALL 保证只读 tool loop 不包含会修改训练计划、用户数据、数据库状态或 artifact revision 的工具。

#### Scenario: LLM 请求执行写操作
- **WHEN** LLM 通过工具调用请求创建计划、保存计划、应用 Patch、记录反馈或修改用户数据
- **THEN** 只读 tool loop MUST 拒绝该请求
- **AND** 系统 MUST 使用现有服务端确定性写流程处理可执行写动作
- **AND** 任何写动作仍 MUST 经过 Validator、PolicyEngine、ConfirmationGate 或对应领域服务

#### Scenario: 工具 registry 被测试检查
- **WHEN** 自动化测试枚举只读 registry
- **THEN** 测试 MUST 断言 registry 不包含 `applyWorkoutPatch`、`createWorkoutPlanDraft`、`saveWorkoutPlan`、`recordUserFeedback` 或等价写工具
