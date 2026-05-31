# readonly-llm-tool-calling Specification

## Purpose
TBD - created by archiving change enable-readonly-llm-tool-calling. Update Purpose after archive.
## Requirements
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

### Requirement: 系统必须支持受控 JSON tool decision 协议
系统 SHALL 在首版实现中使用服务端校验的 JSON tool decision 协议表达 LLM 的只读工具选择。

#### Scenario: 首版运行时选择
- **WHEN** 只读 tool loop 请求模型决定下一步
- **THEN** 系统 MUST 使用 JSON response 协议解析 `ReadonlyToolDecision`
- **AND** 系统 MUST NOT 同时依赖标准 `tools` / `tool_choice` 作为首版运行时契约

#### Scenario: LLM 请求调用一个只读工具
- **WHEN** 模型返回 `action = "call_tool"` 的 JSON decision
- **THEN** decision MUST 只包含一个 `toolName`、一个 `input` 和一个 `reason`
- **AND** `toolName` MUST 属于只读 registry 中已注册工具
- **AND** `input` MUST 继续经过对应工具 Schema 校验

#### Scenario: LLM 决定停止调用工具
- **WHEN** 模型返回 `action = "finish"` 的 JSON decision
- **THEN** decision MUST 包含 `answerReadiness` 和 `reason`
- **AND** 系统 MUST 停止继续执行工具
- **AND** 系统 MUST 使用已聚合的 tool context bundle、当前上下文或澄清回退继续生成回复

#### Scenario: tool decision 格式非法
- **WHEN** 模型返回非法 JSON、多工具请求、未知 action、未知工具名或缺少 reason 的 decision
- **THEN** 系统 MUST 拒绝执行工具
- **AND** 系统 MUST 将该结果视为可恢复失败
- **AND** trace MUST 记录标准化错误 code 和回退策略

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

#### Scenario: 使用默认工具预算
- **WHEN** `/api/chat` 启用只读 tool loop
- **THEN** 默认最大工具步骤 MUST 为 3
- **AND** `searchArtifacts` 默认返回 6 条、最多 12 条候选摘要
- **AND** `searchExercises` 默认返回 8 条、最多 24 条候选摘要
- **AND** 单个候选摘要的自由文本字段 MUST 默认限制为 300 字符以内
- **AND** 单轮 tool context bundle 序列化后 MUST 默认限制为 6000 字符以内
- **AND** 单轮 tool loop 总耗时 MUST 默认限制为 8 秒以内
- **AND** 单轮 tool loop MUST 最多产生 3 次额外 tool decision 模型调用

#### Scenario: 工具步骤在限制内完成
- **WHEN** LLM 选择只读工具且步骤数未超过上限
- **THEN** 系统 MUST 执行该工具并将摘要化结果加入 tool context bundle
- **AND** 后续模型请求 MUST 只能看到摘要化工具结果

#### Scenario: 工具步骤超过限制
- **WHEN** LLM 连续请求工具且达到最大步骤数
- **THEN** 系统 MUST 停止继续执行工具
- **AND** 系统 MUST 基于已有上下文生成回复、进入澄清或回退到原编排路径
- **AND** trace MUST 记录 step limit 触发

#### Scenario: tool loop 超过耗时限制
- **WHEN** tool loop 总耗时达到 8 秒
- **THEN** 系统 MUST 停止继续请求模型或执行新工具
- **AND** 系统 MUST 使用已有上下文回复、澄清或回退到原编排路径
- **AND** trace MUST 记录 timeout 和已完成的 tool decision / tool call 数量

### Requirement: 只读工具结果必须摘要化后再进入模型上下文
系统 SHALL 对所有工具结果执行模型上下文摘要，避免完整大 payload 或无关私密字段进入下一次模型请求。

#### Scenario: 工具返回 artifact payload
- **WHEN** `getArtifactPayload` 返回完整 artifact payload
- **THEN** 系统 MUST 先按 artifact kind 生成模型可见摘要
- **AND** 模型可见摘要 MUST 至少覆盖 `exercise_recommendation`、`routine`、`plan` 和 `patch`
- **AND** 模型可见摘要 MUST 保留回答所需的标题、类型、训练结构、动作 id、目标、时长、频率、关键替换或调整原因
- **AND** 模型可见摘要 MUST NOT 包含无关大 payload、其他用户数据或未校验原始字段

#### Scenario: 动作推荐 artifact 摘要
- **WHEN** `getArtifactPayload` 返回 `exercise_recommendation`
- **THEN** 模型可见摘要 MUST 包含 `artifactId`、`title`、`exerciseIds`、`exerciseNames`、`targetMuscles` 和 `reasons`
- **AND** 摘要 MUST NOT 包含完整卡片 payload 或未校验原始字段

#### Scenario: 单次 routine artifact 摘要
- **WHEN** `getArtifactPayload` 返回 `routine`
- **THEN** 模型可见摘要 MUST 包含 `artifactId`、`title`、`sessionMinutes`、`sections`、每个 section 的 `exerciseIds` 和可展示的 `setsReps`
- **AND** 摘要 MUST NOT 包含完整 routine payload

#### Scenario: 长期 plan artifact 摘要
- **WHEN** `getArtifactPayload` 返回 `plan`
- **THEN** 模型可见摘要 MUST 包含 `artifactId`、`title`、`weeklyFrequency`、`trainingDayCount`、`days` 和每个 day 的 `exerciseIds`
- **AND** 摘要 MUST NOT 包含完整 plan payload

#### Scenario: Patch artifact 摘要
- **WHEN** `getArtifactPayload` 返回 `patch`
- **THEN** 模型可见摘要 MUST 包含 `artifactId`、`sourceArtifactId`、`operations`、`changedExerciseIds`、`reason` 和 `status`
- **AND** 摘要 MUST NOT 包含完整 diff payload 或确认 token

#### Scenario: 工具返回候选列表
- **WHEN** `searchArtifacts` 或 `searchExercises` 返回候选列表
- **THEN** 系统 MUST 限制候选数量和单项字段长度
- **AND** 模型可见内容 MUST 是候选摘要而不是数据库完整记录

#### Scenario: 工具上下文超过预算
- **WHEN** 聚合后的 tool context bundle 超过模型上下文预算
- **THEN** 系统 MUST 按工具结果优先级截断摘要：已 resolved artifact、具体动作详情、当前问题相关训练结构、artifact 候选、exercise 候选
- **AND** 系统 MUST 在 trace 中记录 `truncated = true`、截断前后大小和保留的 tool call id
- **AND** 系统 MUST NOT 将未截断的大 payload 传入下一次模型请求

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

### Requirement: 只读 tool loop 必须可由服务端开关关闭
系统 SHALL 提供服务端 feature flag 控制只读 tool loop 是否参与 `/api/chat` 编排。

#### Scenario: feature flag 默认状态
- **WHEN** `ENABLE_READONLY_LLM_TOOLS` 未设置或不等于 `true`
- **THEN** 系统 MUST 将只读 tool loop 视为关闭

#### Scenario: feature flag 关闭
- **WHEN** 只读 tool loop feature flag 关闭
- **THEN** `/api/chat` MUST 完全跳过 `runReadonlyToolLoop`
- **AND** 系统 MUST 继续使用当前固定编排路径生成回复或执行确定性动作
- **AND** trace MUST 记录 tool loop 被跳过及对应 skipped reason

#### Scenario: feature flag 开启
- **WHEN** `ENABLE_READONLY_LLM_TOOLS = "true"`
- **THEN** `/api/chat` MAY 按触发矩阵进入 `runReadonlyToolLoop`
- **AND** 系统 MUST 继续执行所有只读工具、预算、权限和回退约束

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

