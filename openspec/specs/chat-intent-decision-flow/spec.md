# chat-intent-decision-flow Specification

## Purpose
TBD - created by archiving change unify-chat-intent-decision-flow. Update Purpose after archive.
## Requirements
### Requirement: 旧聊天意图架构必须从生产主链移除
系统 SHALL 从生产 `/api/chat` 主链移除旧 intent-first 架构。`ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、`action.shouldTrigger`、`responseMode`、`assistant_action` 和 `intent_resolved` MUST NOT 作为生产执行合同、卡片触发事实源、Patch 决策、计划生成输入或最终回复依据。

#### Scenario: 聊天请求进入生产主链
- **WHEN** 用户向 `/api/chat` 发送消息
- **THEN** 系统 MUST 进入 Tool-first `AgentOrchestrator`
- **AND** 系统 MUST 以 `AgentExecutionResult` 作为本轮唯一生产执行合同
- **AND** 系统 MUST NOT 先运行旧 intent resolution、resolved intent repair、旧 action gate 或旧只读 tool loop 触发矩阵

#### Scenario: 旧 intent 字段仍存在于代码库
- **WHEN** 代码库中仍保留 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent` 或旧 action 字段类型
- **THEN** 这些类型 MUST 只能用于历史数据迁移、离线报告解析或测试夹具
- **AND** 生产 `/api/chat` MUST NOT 导入这些类型来决定工具选择、生成、Patch、保存或回复
- **AND** allowlist 外的旧类型、旧 helper、旧 prompt module 和旧 adapter MUST 被删除

#### Scenario: 旧兼容事件仍存在
- **WHEN** 系统仍需要解析历史 `assistant_action`、`intent_resolved` 或 trigger JSON
- **THEN** 解析逻辑 MUST 位于离线迁移、历史展示兼容或测试 fixture 中
- **AND** 生产聊天流 MUST NOT 输出这些事件作为新运行结果
- **AND** 前端 MUST NOT 依赖这些事件触发训练卡片

#### Scenario: 生产流输出用户可见结果
- **WHEN** 新运行需要向前端表达卡片、Patch、建议、澄清、阻断、失败或保存状态
- **THEN** 系统 MUST 通过 `agent_execution_result`、artifact / patch / suggestion 事件、tool evidence metadata 或 done metadata 表达
- **AND** 系统 MUST NOT 输出 `assistant_action`、`intent_resolved`、旧 trigger JSON 或可作为执行事实源的 `workoutIntent`

#### Scenario: 用户发送短指令
- **WHEN** 用户发送“换一个”“不用哑铃”“简单点”“改成在家练”或等价短指令
- **THEN** Agent MUST 通过工具读取真实 recent messages、artifact payload、动作候选和用户记忆后决定执行结果
- **AND** 服务端 MUST NOT 通过旧关键词规则或 resolved intent 归一化预先改写高层语义

#### Scenario: Agent 主链需要处理失败
- **WHEN** Agent decision、工具调用、候选检索、引用读取、validation、policy、persistence 或 Response Writer 失败
- **THEN** 系统 MUST 使用 Agent repair、tool retry、`needs_clarification`、`blocked`、`failed`、validation / policy failure handling 或用户确认表达失败处理结果
- **AND** 系统 MUST NOT 调用旧 intent resolution、resolved intent repair、旧 action gate、旧只读 tool loop、旧 trigger parser 或 summary-only payload reconstruction

### Requirement: Agent 阻塞终止结果必须符合结构化合同
系统 SHALL 将候选为空、工具不可恢复失败或策略阻断等可解释停止状态表达为合法 `AgentExecutionResult`。

#### Scenario: 候选为空后返回 blocked
- **WHEN** Agent 已调用必要工具但没有得到可执行候选集合
- **THEN** Agent 终止结果 MUST 使用 `status: "blocked"`
- **AND** 终止结果 MUST 包含非空 `blockReason`
- **AND** 终止结果 MUST 保留相关 `usedToolResultIds`
- **AND** 系统 MUST NOT 将该场景投影为 `model_output_invalid`

#### Scenario: 模型返回旧形态 blocked
- **WHEN** 模型返回 `status: "blocked"` 且阻塞说明位于 `replyContext.reply`
- **THEN** 服务端 MAY 将该说明规范化为 `blockReason`
- **AND** 该规范化 MUST NOT 改写 `status`、工具结果引用、策略结果或用户语义
- **AND** 其他缺少必要字段的非法终止结果 MUST 继续被拒绝

#### Scenario: 阻塞结果写入用户回复
- **WHEN** Response Writer 接收到合法 `blocked` Agent 终止结果
- **THEN** 用户可见回复 MUST 基于 `blockReason`
- **AND** 回复 MUST NOT 承诺已经生成或修改训练结果

### Requirement: Agent decision JSON 格式失败必须先尝试非语义恢复
系统 SHALL 在 Agent decision 模型输出严格 JSON 解析失败时，先尝试非语义 JSON 格式恢复。恢复逻辑 MUST 只处理 JSON 文本边界问题，并且恢复后的对象 MUST 继续通过 `AgentToolDecision` Schema、registry 工具名和工具输入 Schema 校验。

#### Scenario: 模型输出尾随多余对象结束符
- **WHEN** Agent decision 模型返回一个可闭合 JSON object，但末尾额外多出一个或多个 `}` 导致严格解析失败
- **THEN** 系统 MUST 尝试提取第一个完整 JSON object
- **AND** 提取出的对象 MUST 通过 `JSON.parse`
- **AND** 系统 MUST 使用现有 `AgentToolDecision` 校验恢复后的对象
- **AND** 系统 MUST NOT 基于用户原文、关键词、同义词或规则评分生成替代 action、toolName、intent 或工具输入

#### Scenario: 模型输出包含 fenced JSON 或包裹文本
- **WHEN** Agent decision 模型响应包含 fenced JSON 或 JSON object 前后存在非 JSON 文本
- **THEN** 系统 MAY 提取唯一可解析的 JSON object
- **AND** 恢复后的对象 MUST 通过同一套 Agent decision 合同校验后才能执行工具
- **AND** 系统 MUST NOT 将包裹文本中的自然语言说明作为执行事实源

#### Scenario: 恢复后仍不满足 Agent decision 合同
- **WHEN** JSON 格式恢复成功，但恢复后的对象请求未知工具、非法多工具调用、非法参数或不合法 `AgentExecutionResult`
- **THEN** 系统 MUST 按现有可诊断失败路径处理
- **AND** 系统 MUST NOT 回退到旧 intent-first、旧 `assistant_action`、旧 resolved intent repair 或 summary-only payload reconstruction

#### Scenario: 无法唯一恢复 JSON object
- **WHEN** 模型输出截断、括号不平衡、包含多个候选 JSON object 或无法提取唯一完整对象
- **THEN** 系统 MUST 保持 `invalid_json` 或等价可诊断失败
- **AND** 系统 MUST NOT 猜测模型原本想调用的工具

### Requirement: 旧聊天接口面必须纳入 intent 架构删除边界
系统 SHALL 将旧 intent 架构删除边界扩展到 active Route Handler、前端新流解析和生产目录 legacy 模块。生产 `/api/chat` 不走旧主链不足以完成清理；任何仍可被聊天体验触发的旧 AI 接口或旧 trigger 面都 MUST 删除或隔离。

#### Scenario: 旧 API route 仍存在
- **WHEN** 代码库仍存在旧 workout-plan AI route、旧 exercise recommendation AI route 或等价旧聊天 AI route
- **THEN** 系统 MUST 将其视为旧 intent 架构残留
- **AND** 实现 MUST 删除该 route 或证明它只属于非生产离线迁移边界

#### Scenario: 前端新流仍解析旧 trigger
- **WHEN** 前端聊天页面、hook、client 或 message parser 仍解析旧 trigger JSON 或调用旧 AI route
- **THEN** 系统 MUST 将其视为旧 intent 架构残留
- **AND** 实现 MUST 迁移到 Agent-first stream/result 合同

#### Scenario: 服务端清理旧接口
- **WHEN** 实现旧接口清理
- **THEN** 服务端 MUST NOT 使用关键词、正则、短句模板、同义词表或用户原文规则替 LLM 判断高层语义
- **AND** 清理后的执行选择 MUST 继续来自 Agent 结构化输出、tool result、repair、澄清或阻断合同

### Requirement: 服务端不得在 Agent 前执行高层语义纠偏

系统 SHALL 禁止 `/api/chat` 在 Agent tool loop 前使用服务端关键词、正则、短句模板或历史摘要推断改写用户高层语义。

#### Scenario: 用户发送短指令
- **WHEN** 用户发送“换一个”“不用哑铃”“简单点”“改成在家练”或等价短指令
- **THEN** 服务端 MUST 将原始用户消息、真实 recent messages 和 recent artifact 摘要交给 Agent
- **AND** LLM MUST 通过工具读取事实并决定含义
- **AND** 服务端 MUST NOT 在 Agent 前把该消息改写成 `exercise_replacement`、`routine`、`workout_patch` 或其他高层 action

#### Scenario: LLM 工具计划和服务端旧规则冲突
- **WHEN** Agent 的工具计划与旧 intent normalize 或关键词 gate 结果不一致
- **THEN** 系统 MUST 以 Agent tool result 和服务端硬校验为准
- **AND** 旧规则 MUST NOT 覆盖 Agent 决策

#### Scenario: 旧 fallback 逻辑存在
- **WHEN** 旧 `createFallbackWorkoutIntent`、pending replacement 字符串匹配、显式引用关键词或其他服务端文本规则仍存在于代码库
- **THEN** 它们 MUST NOT 在 Agent 前改写 `AgentExecutionState`、`WorkoutEditPlan`、tool decision 或 `AgentExecutionResult`
- **AND** 若仍需保留，MUST 迁移为 Agent 可读状态、工具硬边界或仅测试夹具
