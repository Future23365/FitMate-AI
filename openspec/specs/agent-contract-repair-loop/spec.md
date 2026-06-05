# agent-contract-repair-loop Specification

## Purpose
TBD - created by archiving change harden-agent-contract-repair-loop. Update Purpose after archive.
## Requirements
### Requirement: Agent 决策合同失败必须生成结构化反馈
系统 SHALL 在 Agent 模型决策违反可恢复执行合同时生成结构化 `AgentDecisionFeedback` 或等价模型可见 repair feedback，并将该反馈作为下一轮模型可见的工具结果摘要或 invalid action observation，而不是只返回通用 `model_output_invalid` 或泛化 schema 失败消息。

#### Scenario: final result 引用未登记 revision
- **WHEN** 模型返回 `final_result.generated` 或 `final_result.patched`
- **AND** 结果引用的 `revisionId` 在当前 run 的 dependency graph 中没有任何已登记 producer
- **AND** 当前 run 已具备继续保存所需的 `draftId`、`validationId` 和 `policyDecisionId`
- **THEN** 系统 MUST 拒绝该 `revisionId`
- **AND** 系统 MUST 生成 `AgentDecisionFeedback`
- **AND** feedback MUST 标记缺失资源为 `revisionId`
- **AND** feedback MUST 推荐调用 `saveConversationArtifactRevision` 或等价写工具
- **AND** 系统 MUST NOT 将该 final result 投影为成功训练卡片

#### Scenario: 工具输入缺少可恢复资源引用
- **WHEN** 模型调用工具时缺少该工具输入 schema 或 dependency graph 要求的已登记资源 id
- **AND** 当前 run 中存在可用于补齐下一步的上游资源
- **AND** runtime 能根据当前已登记资源确定推荐下一步
- **THEN** 系统 MUST 生成结构化 feedback
- **AND** feedback MUST 包含缺失依赖、可用资源和推荐下一步工具
- **AND** 系统 MUST 允许模型在剩余预算内重新决策

#### Scenario: tool input schema 失败必须暴露安全字段级 repair feedback
- **WHEN** 模型返回已注册且当前 manifest 可见的 `tool_call`
- **AND** tool input 未通过对应 tool `inputSchema` 校验
- **AND** 失败原因可通过安全字段路径和中文说明表达
- **THEN** 系统 MUST 返回 `invalid_tool_input`
- **AND** 模型可见 feedback MUST 包含脱敏后的字段路径、失败原因和可恢复建议
- **AND** feedback MUST NOT 包含 handler payload、数据库完整输出、secret、stack trace 或用户不可见事实
- **AND** 系统 MUST NOT 在服务端替模型补全 tool input 或改写高层 action

#### Scenario: 可恢复性必须由 ToolResult 和 runtime 共同判定
- **WHEN** 模型决策或工具结果出现 `schema_validation_failed`、`invalid_dependency` 或 `model_output_invalid`
- **THEN** 系统 MUST 同时检查 runtime 错误分类、tool result 状态、已登记资源、hard boundary 状态和修复预算
- **AND** 系统 MUST NOT 仅凭 `AgentToolError.retryable`、错误码名称或 prompt 文案判定该错误可恢复
- **AND** 如果缺少任一可恢复条件，系统 MUST 返回 blocked 或 failed，而不是继续调用模型猜测

#### Scenario: ToolResult 失败进入反馈上下文
- **WHEN** tool 返回结构化失败、`satisfied=false` 或 result requirement 未满足诊断
- **THEN** runtime MUST 只将该结果作为失败事实和模型可见摘要登记
- **AND** runtime MUST NOT 把该结果登记为可被后续工具消费的成功资源
- **AND** runtime MUST NOT 从用户原文、query、title、summary 或 `conversationSummary` 推断额外修复参数

#### Scenario: prompt 引导不能替代 runtime 合同校验
- **WHEN** prompt 指示模型基于 `AgentDecisionFeedback` 修复上一轮决策
- **THEN** runtime MUST 仍然校验下一轮模型输出的 Schema、资源 producer、用户隔离、Policy、预算和 final result 引用
- **AND** runtime MUST NOT 因 prompt 已写明规则而跳过任何确定性合同校验
- **AND** prompt MUST NOT 被视为 artifact、revision、policy、validation、operation 或用户权限事实来源

#### Scenario: 不可恢复边界失败
- **WHEN** 工具失败原因属于权限拒绝、跨用户数据、Policy 拒绝、不可访问资源或不可重试 hard boundary
- **THEN** 系统 MUST NOT 要求模型继续猜测修复
- **AND** 系统 MUST 以 blocked 或 failed 的标准 Agent 结果终止
- **AND** trace MUST 记录该失败不是可恢复 feedback

### Requirement: Agent 修复循环必须受预算和熔断约束
系统 SHALL 对 Agent 决策修复循环设置明确预算，并对重复不可重试失败执行确定性熔断。

#### Scenario: 可恢复错误进入下一轮
- **WHEN** runtime 生成 `AgentDecisionFeedback`
- **AND** 当前 run 仍有剩余 repair turn 和总 step 预算
- **THEN** 系统 MUST 将 feedback 写入当前 run 的 tool result 列表
- **AND** 下一轮模型请求 MUST 能看到该 feedback 的模型可见摘要
- **AND** 系统 MUST 继续保持已有 tool result 和 dependency graph 可验证

#### Scenario: 修复预算耗尽
- **WHEN** 同一 run 的 repair turn 数、同类 feedback 次数或总 step 数达到预算上限
- **THEN** 系统 MUST 停止继续模型修复
- **AND** 系统 MUST 返回标准 failed 结果
- **AND** trace MUST 记录耗尽的是哪一类预算

#### Scenario: 重复失败工具调用被熔断
- **WHEN** 模型重复调用相同 `toolName + normalizedInput`
- **AND** 该调用已经产生相同不可重试 failure code
- **THEN** runtime MUST 不再执行底层工具
- **AND** runtime MUST 返回结构化 `duplicate_tool_failure` feedback
- **AND** feedback MUST 引用首次失败的 tool result id 和重复次数

### Requirement: Agent 最终结果必须以服务端事实收口
系统 SHALL 只允许 `AgentExecutionResult` 的结构化事实字段来自当前 run 已登记的 tool result 或 runtime 可验证投影。

#### Scenario: 保存成功后模型漏填 generated 字段
- **WHEN** `saveConversationArtifactRevision` 或等价写工具已经成功返回唯一的 `revisionId`、`artifactId`、`validationId` 和 `policyDecisionId`
- **AND** 模型随后返回的 `final_result.generated` 缺少可由保存结果唯一确定的结构化字段
- **THEN** runtime MAY 从已登记保存结果投影合法 `AgentExecutionResult.generated`
- **AND** 投影结果 MUST 继续通过 final result 引用校验
- **AND** runtime MUST NOT 从用户自然语言或模型自由文本推断 artifact 事实

#### Scenario: completed operation 必须引用真实写工具结果
- **WHEN** 模型返回 `final_result.completed_operation`
- **THEN** `operationResultId` MUST 来自当前 run 已登记的非 artifact 写工具成功结果
- **AND** `policyDecisionId` 和 `confirmationId` 如存在，MUST 来自当前 run 已登记资源
- **AND** operation 的可见字段 MUST 来自写工具的安全摘要或 runtime 可验证投影
- **AND** 系统 MUST NOT 允许模型只凭自由文本声明用户资料、偏好或其他写操作成功

#### Scenario: 多个候选事实无法唯一投影
- **WHEN** 当前 run 中存在多个可能匹配的 draft、patch、save 或 operation 写结果
- **AND** 模型 final result 没有足够引用来唯一确定使用哪一个结果
- **THEN** runtime MUST NOT 猜测选择业务事实
- **AND** 系统 MUST 生成可恢复 feedback 或返回 failed 结果

#### Scenario: 模型声明成功但没有保存事实
- **WHEN** 模型返回 `generated` 或 `patched`
- **AND** 当前 run 没有可验证的写工具成功结果或合法 `revisionId`
- **THEN** 系统 MUST NOT 产生成功卡片
- **AND** 系统 MUST 生成可恢复 feedback 或返回 failed 结果

### Requirement: 重复成功 tool 调用必须生成收口反馈
系统 SHALL 在同一 run 中识别重复的成功 tool 调用，并以结构化 `AgentDecisionFeedback` 或等价 Planner 可见 feedback 引导 Planner 基于已有成功结果收口或提交新的合法 action，而不是再次执行同一 handler、重复登记 resource 或耗尽 repair 预算。

#### Scenario: 已有同等成功结果时重复调用
- **WHEN** Planner 返回 `tool_call`
- **AND** 当前 run 已存在相同 `toolName + toolVersion + normalizedInputHash` 的 tool result
- **AND** 该既有 tool result 满足 `ok = true`
- **AND** 该既有 tool result 满足 `fulfillment.satisfied = true`
- **THEN** runtime MUST NOT 再次执行相同 tool handler
- **AND** runtime MUST 生成结构化 `AgentDecisionFeedback`
- **AND** feedback MUST 引用既有成功 `toolResultId`
- **AND** feedback MUST 说明 Planner 可以基于既有结果输出合法 terminal action、调用其他当前可见合法 tool，或提交改变后的合法 tool input

#### Scenario: 重复成功 resource producer 不得重复登记 resource
- **WHEN** Planner 返回 `tool_call`
- **AND** 当前 run 已存在相同 `toolName + toolVersion + normalizedInputHash` 的成功且满足 tool result
- **AND** 该既有 tool result 已产生 consumable resource
- **THEN** runtime MUST NOT 再次执行相同 tool handler
- **AND** runtime MUST NOT 再次登记该 tool 的 produced resources
- **AND** runtime MUST NOT 因重复 resource id 产生 hard failure
- **AND** feedback MUST 引用既有成功 `toolResultId` 或既有 resource ref，供 Planner 后续合法 action 使用

#### Scenario: 重复成功反馈不替代语义判断
- **WHEN** runtime 生成重复成功 tool call feedback
- **THEN** feedback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板判断用户是否要求刷新、更多结果或排除已展示动作
- **AND** feedback MUST NOT 代替 Planner 生成用户可见回答内容
- **AND** feedback MUST NOT 改写 Planner 的高层语义 action
- **AND** feedback MUST NOT 写入具体业务 `toolName` 分支来替代通用重复成功边界

#### Scenario: 改变后的合法 input 不触发重复成功反馈
- **WHEN** Planner 返回相同 toolName 的 `tool_call`
- **AND** input 与既有成功结果的 normalized input 不同
- **THEN** runtime MUST 按正常 Action Validator、budget 和 Executor 流程处理该 tool call
- **AND** runtime MUST NOT 仅因 toolName 相同就阻止执行

#### Scenario: 未满足结果不使用重复成功反馈
- **WHEN** 当前 run 只有相同 `toolName + toolVersion + normalizedInputHash` 的 failed、diagnostic 或 `fulfillment.satisfied = false` 结果
- **THEN** runtime MUST NOT 将该结果当作成功收口依据
- **AND** runtime MUST 继续使用既有失败反馈、重复失败熔断、澄清或 failed 收口边界

### Requirement: terminal visible output 失败必须作为结构化 invalid action observation 反馈
系统 SHALL 在 `final_answer.visibleOutputs[]` 通过静态 envelope 但未通过业务 terminal output validator 时，把失败结果作为结构化 invalid action observation 提供给下一轮 Planner。反馈 MUST 保留 output index、`outputType`、`schemaVersion` 和业务 validator 返回的脱敏 details。反馈 MUST NOT 把业务流程建议写成固定下一步。

#### Scenario: section_not_allowed 进入下一轮 observation
- **WHEN** `visibleTrainingProposal` 因 `section_not_allowed` 被 terminal output validator 拒绝
- **AND** 当前 run 仍有 repair 预算
- **THEN** 下一轮 Planner 可见 observations MUST 包含 `type = "invalid_action"`
- **AND** observation content MUST 包含 `code = "terminal_reference_invalid"` 或等价 terminal validation failure code
- **AND** observation content MUST 包含业务 details 中的 `code = "section_not_allowed"`
- **AND** observation content MUST 包含失败的 `exerciseId`、输出的 `section`、数据库 `allowedSections` 和字段 `path`
- **AND** observation content MUST NOT 包含完整数据库对象、完整 handler output、secret、stack trace 或跨用户 payload

#### Scenario: repair feedback 不替代 Planner 决策
- **WHEN** runtime 生成 visible output validation failure feedback
- **THEN** feedback MUST NOT 要求 Planner 必须调用某个具体 tool
- **AND** feedback MUST NOT 自动改写 Planner 上一轮 action
- **AND** feedback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板生成下一步 tool input
- **AND** runtime MUST 继续校验下一轮 Planner 输出的 schema、toolName、tool input、resource、policy、grounding 和 terminal output

### Requirement: 同义旧字段失败必须生成字段级 repair feedback
系统 SHALL 在模型输出使用旧同义字段或缺少统一主字段时，生成结构化字段级 repair feedback。Feedback MUST 直接说明旧字段和新字段的替换关系，而不是只返回泛化的非法 action 消息。

#### Scenario: ask_user 使用 question 旧字段
- **WHEN** 模型返回 `ask_user.question`
- **AND** 当前合同要求 terminal 用户可见文本写入 `content`
- **THEN** runtime MUST 将该输出判定为非法 action
- **AND** repair feedback MUST 包含字段路径 `question`
- **AND** repair feedback MUST 说明 `ask_user` 的用户可见文本必须写入 `content`
- **AND** repair feedback MUST NOT 要求服务端替模型把 `question` 转换成 `content`

#### Scenario: ask_user 使用 content 但 schema 仍有其他旧字段
- **WHEN** 模型返回 `ask_user.content`
- **AND** 同一 action 还包含 `question`、`message` 或等价旧同义字段
- **THEN** runtime MUST 拒绝该 action 或删除旧字段前先进入结构化 repair 边界
- **AND** feedback MUST 指出只允许一个用户可见文本字段
- **AND** feedback MUST 说明语义差异由 `type` 表达

#### Scenario: terminal 使用旧 grounding 字段
- **WHEN** 模型返回 `usedToolResultIds`
- **OR** 模型返回 `usedResourceRefs`
- **AND** 当前合同要求使用统一 `usedRefs`
- **THEN** repair feedback MUST 指出旧字段不可用
- **AND** repair feedback MUST 给出 `usedRefs` 的合法结构
- **AND** runtime MUST NOT 静默转换旧字段

#### Scenario: tool input 使用旧同义字段
- **WHEN** 模型调用 tool 时使用已收敛的旧同义字段
- **THEN** runtime MUST 返回 `invalid_tool_input`
- **AND** feedback MUST 包含脱敏字段路径和新字段名
- **AND** feedback MUST 使用中文说明业务含义，保留字段名、枚举值和 `toolName` 英文原样
- **AND** feedback MUST NOT 基于用户原文替模型补齐 tool input

### Requirement: schema repair feedback 必须由通用错误投影器生成
系统 SHALL 在模型输出违反 `AgentAction`、tool input 或 terminal visible output envelope 的结构合同时，通过通用 schema error projector 生成模型可见 repair feedback。Projector MUST 只使用 schema、discriminator、validator issue、字段路径和脱敏实际值等确定性输入，不得依赖用户自然语言、业务 phrasing、具体 trace case 或手写 tool 特判。

#### Scenario: AgentAction variant 缺少必填字段
- **WHEN** 模型返回一个 discriminator 可确定的 `AgentAction` variant
- **AND** 该 variant 缺少 schema 必填字段
- **THEN** repair feedback MUST 包含 `target.kind = "AgentAction"` 或等价定位
- **AND** feedback MUST 包含已确定的 `variant`
- **AND** feedback MUST 包含 `errors[]` 项，且 `code = "required_field_missing"`
- **AND** 该 error MUST 包含缺失字段的 `path` 和安全 `expected`
- **AND** feedback MUST NOT 用自然语言解释该字段的业务语义
- **AND** feedback MUST NOT 要求服务端替模型补齐或转换字段

#### Scenario: AgentAction 包含未知字段
- **WHEN** 模型返回的 `AgentAction` variant 中包含当前 schema 不允许的字段
- **THEN** repair feedback MUST 包含 `errors[]` 项，且 `code = "unknown_field"`
- **AND** 该 error MUST 包含未知字段的 `path`
- **AND** 该 error SHOULD 包含当前 variant 的 `allowedFields`
- **AND** feedback MUST NOT 把未知字段映射成另一个字段
- **AND** feedback MUST NOT 根据字段名推断模型原本意图

#### Scenario: discriminator 无法选择合法 variant
- **WHEN** 模型返回的 action、tool input 子结构或 visible output envelope 无法通过 discriminator 选择合法 variant
- **THEN** repair feedback MUST 包含 `errors[]` 项，且 `code = "invalid_discriminator"` 或 `code = "invalid_union_variant"`
- **AND** error MUST 包含 discriminator `path`
- **AND** error MUST 包含安全 `actual`
- **AND** error SHOULD 包含 `allowedValues`
- **AND** runtime MUST NOT 基于用户原文或字段组合替模型选择 variant

#### Scenario: 新增 tool 自动获得字段级 repair facts
- **WHEN** 系统注册一个新的 Agent tool
- **AND** 该 tool 暴露有效 `inputSchema`
- **AND** 模型调用该 tool 但 input 未通过 schema 校验
- **THEN** repair feedback MUST 由同一个 schema error projector 生成
- **AND** feedback MUST 使用该 tool 的 schema 定位 `target.toolName`
- **AND** feedback MUST 包含字段级 `errors[]`
- **AND** 实现 MUST NOT 为该 tool 新增专门 repair feedback 分支才能表达缺字段、未知字段、类型错误或枚举错误

#### Scenario: 旧字段只作为 schema 错误事实出现
- **WHEN** 模型输出当前合同不再允许的旧字段
- **AND** 当前 schema 已经不接受该字段
- **THEN** repair feedback MUST 将旧字段表达为 `unknown_field`
- **AND** 如果主字段缺失，feedback MUST 另外表达 `required_field_missing`
- **AND** feedback MUST NOT 包含固定旧字段到新字段的替换文案
- **AND** feedback MUST NOT 静默接受、删除、转换或长期兼容该旧字段

### Requirement: domain validation feedback 只能承载确定性事实
系统 SHALL 在业务 validator 发现 terminal visible output 或 tool result 违反数据库事实、资源事实或业务确定性边界时，向 repair loop 暴露结构化 domain facts。Domain facts MUST 描述 validator 已确定的错误事实，不得描述模型下一步必须如何修复。

#### Scenario: terminal visible output 引用事实不合法
- **WHEN** terminal visible output 通过静态 envelope schema
- **AND** domain validator 判定其中某个字段违反数据库事实或当前可见资源事实
- **THEN** repair feedback MUST 包含失败字段 `path`
- **AND** feedback MUST 包含稳定 `code`
- **AND** feedback SHOULD 包含安全 `actual`、`expected`、`allowedValues` 或 `resourceRef`
- **AND** feedback MUST NOT 包含完整数据库对象、完整 handler payload、secret、stack trace 或跨用户事实
- **AND** feedback MUST NOT 包含固定自然语言恢复方向

#### Scenario: domain validator 不返回下一步 tool 建议
- **WHEN** domain validator 生成可恢复错误 facts
- **THEN** feedback MUST NOT 包含 `repair`、`recoveryDirections`、`recoverableActions`、`nextToolName` 或等价模型可见下一步建议字段
- **AND** feedback MUST NOT 要求模型必须调用某个具体 tool
- **AND** runtime MUST 继续让模型基于当前 prompt、manifest、facts 和用户目标自行决定下一轮合法 action

#### Scenario: repair facts 不替代下一轮校验
- **WHEN** runtime 将 schema errors 或 domain facts 写入下一轮模型可见上下文
- **THEN** runtime MUST 在下一轮继续校验 schema、toolName、tool input、resource、policy、grounding 和 terminal visible output
- **AND** runtime MUST NOT 因上一轮 feedback 已经指出错误而接受未校验的模型输出
- **AND** runtime MUST NOT 从 feedback facts 推导或写入未经模型输出的业务 action

### Requirement: 模型可见 prompt 必须解释通用 repair facts
系统 SHALL 在默认 Agent prompt 或等价 model input 中提供稳定说明，解释模型如何读取通用 schema errors 和 domain facts。该说明 MUST 是全局合同解释，不得由 runtime 针对单次错误动态拼接业务修复文案。

#### Scenario: 模型看到 schema repair facts
- **WHEN** 下一轮模型请求包含上一轮 `schema_validation_failed` 或等价 repair feedback
- **THEN** model input MUST 包含通用说明，引导模型先读取 `target`、`errors[].path`、`errors[].code`、`expected`、`allowedFields`、`requiredFields` 和 `allowedValues`
- **AND** model input MUST 引导模型对照当前可见 schema / manifest 重新输出合法 action
- **AND** model input MUST NOT 依赖 runtime 为每个错误生成固定业务解释

#### Scenario: 模型看到 domain facts
- **WHEN** 下一轮模型请求包含 domain validator facts
- **THEN** model input MUST 说明这些 facts 是确定性错误事实
- **AND** model input MUST 引导模型基于当前可见 tool、资源和用户目标自行选择合法修复动作
- **AND** model input MUST NOT 把 facts 描述成服务端指定的下一步业务流程

