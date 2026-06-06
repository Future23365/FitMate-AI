# agent-contract-repair-loop Specification

## Purpose
TBD - created by archiving change harden-agent-contract-repair-loop. Update Purpose after archive.
## Requirements
### Requirement: Agent 决策合同失败必须生成结构化反馈
系统 SHALL 在 Agent 模型决策违反可恢复执行合同时生成结构化 `AgentDecisionFeedback` 或等价模型可见 repair feedback，并将该反馈作为下一轮模型可见的工具结果摘要或 invalid action observation，而不是只返回通用 `model_output_invalid` 或泛化 schema 失败消息。

#### Scenario: ToolResult 失败进入反馈上下文
- **WHEN** tool 返回结构化失败、权限失败、schema 失败、resource contract 失败或不可重试执行失败
- **THEN** runtime MUST 将该结果作为失败事实和模型可见摘要登记
- **AND** runtime MUST NOT 把该结果登记为可被后续工具消费的成功资源
- **AND** runtime MUST NOT 从用户原文、query、title、summary 或 `conversationSummary` 推断额外修复参数
- **AND** runtime MUST NOT 把 `ok = true` 但返回 0 条或候选不足的查询结果归类为执行失败

#### Scenario: 0 条成功结果不是 repair failure
- **WHEN** tool 成功执行并返回 0 条结果、空候选或候选不足诊断
- **AND** 该 result 满足 `ok = true`
- **THEN** runtime MUST 将该 result 作为 current-run 事实材料提供给 Planner
- **AND** runtime MUST 允许 Planner 引用该 result 输出普通 `final_answer` 解释空结果
- **AND** runtime MUST NOT 因中间结果未满足业务目标而强制进入 repair failure
- **AND** 如果 Planner 随后提交结构化 `visibleOutputs`，是否成功 MUST 由对应 terminal output validator 判定

### Requirement: Agent 修复循环必须受预算和熔断约束
系统 SHALL 对 Agent 决策修复循环设置明确预算，并对重复不可重试失败或重复输入执行确定性熔断。

#### Scenario: 重复工具输入被反馈
- **WHEN** 模型重复调用相同 `toolName + toolVersion + normalizedInputHash`
- **AND** 当前 run 已存在该输入对应的 tool result
- **THEN** runtime SHOULD NOT 再次执行底层工具
- **AND** runtime MUST 返回结构化 duplicate input feedback
- **AND** feedback MUST 引用既有 `toolResultId` 和重复次数
- **AND** feedback MUST 说明重复相同 input 不会产生新事实
- **AND** feedback MUST NOT 使用 `success` / `satisfied` 等词表达业务目标已经满足或未满足
- **AND** feedback MUST NOT 指定 Planner 必须调用某个具体业务 tool、固定 action 或固定 tool input

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
系统 SHALL 在同一 run 中识别重复的成功 tool 调用，并以结构化 `AgentDecisionFeedback` 或等价 Planner 可见 feedback 引导 Planner 基于已有结果收口或提交新的合法 action，而不是再次执行同一 handler、重复登记 resource 或耗尽 repair 预算。

#### Scenario: 已有同等结果时重复调用
- **WHEN** Planner 返回 `tool_call`
- **AND** 当前 run 已存在相同 `toolName + toolVersion + normalizedInputHash` 的 tool result
- **AND** 该既有 tool result 满足 `ok = true`
- **THEN** runtime MUST NOT 再次执行相同 tool handler
- **AND** runtime MUST 生成结构化 duplicate input feedback
- **AND** feedback MUST 引用既有 `toolResultId`
- **AND** feedback MUST 说明 Planner 可以基于既有结果输出合法 terminal action、调用其他当前可见合法 tool、提交改变后的合法 tool input、ask_user 或失败收口
- **AND** feedback MUST NOT 因既有 result 返回 0 条、候选不足或业务诊断而改变 duplicate input 的通用边界

#### Scenario: 重复反馈不替代语义判断
- **WHEN** runtime 生成重复 tool input feedback
- **THEN** feedback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板判断用户是否要求刷新、更多结果、放宽条件或排除已展示动作
- **AND** feedback MUST NOT 代替 Planner 生成用户可见回答内容
- **AND** feedback MUST NOT 改写 Planner 的高层语义 action
- **AND** feedback MUST NOT 写入具体业务 `toolName` 分支来替代通用重复输入边界

### Requirement: terminal visible output 失败必须作为结构化 invalid action observation 反馈
系统 SHALL 在 `final_answer.visibleOutputs[]` 通过静态 envelope 但未通过业务 terminal output validator 时，把失败结果作为结构化 invalid action observation 提供给下一轮 Planner。反馈 MUST 保留 output index、`outputType`、`schemaVersion` 和业务 validator 返回的脱敏 details。反馈 MUST NOT 把业务流程建议写成固定下一步。

#### Scenario: 最终输出失败才表示结构化交付失败
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 对应 terminal output validator 判定 payload 不满足数据库事实、数量、section、prescription、schedule 或其他确定性业务边界
- **THEN** runtime MUST 拒绝该结构化输出
- **AND** runtime MUST 将失败作为 invalid action observation 或 terminal validation failure 反馈
- **AND** runtime MUST NOT 把中间 tool result 的空结果、候选不足或诊断字段直接当作该结构化输出失败的替代判定
- **AND** feedback MUST NOT 要求 Planner 必须调用某个具体 tool

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

### Requirement: Repair Prompt 必须独立于正常 Planning Prompt
系统 SHALL 在模型输出被 validator 判定为非法且仍有 repair 预算时，向下一轮 Planner 提供独立 repair-only prompt 或等价 repair 指令。正常首轮 planning 请求 MUST NOT 携带 repair-only 指令、上一轮非法 action 或 validator repair payload。

#### Scenario: 首轮请求不包含 repair 指令
- **WHEN** runtime 首次调用 Planner
- **THEN** 模型可见输入 MUST 不包含 `repairContext`
- **AND** 模型可见输入 MUST 不包含“只修正上一轮非法 action”的 repair-only 指令
- **AND** 模型可见输入 MAY 包含少量通用 repair 边界，但 MUST NOT 展开 validator 错误路径、错误码修复手册或上一轮失败内容

#### Scenario: 校验失败后追加 repairContext
- **WHEN** Planner 返回的 action 未通过 `validateAgentActionAsync` 或等价 validator
- **AND** runtime 仍有 repair budget
- **THEN** 下一轮 Planner 输入 MUST 包含 `repairContext`
- **AND** `repairContext` MUST 包含上一轮非法 action 的安全表示
- **AND** `repairContext` MUST 包含 validator code、message 和脱敏 details
- **AND** 如果存在字段级错误，`repairContext` MUST 包含 `errors[]` 中的 path、expected、actual、allowedFields、requiredFields 或 allowedValues

#### Scenario: repair 只能局部修正上一轮 action
- **WHEN** 模型可见输入包含 `repairContext`
- **THEN** repair-only prompt MUST 要求模型只修正上一轮非法 action
- **AND** repair-only prompt MUST 要求模型不重新规划用户目标
- **AND** repair-only prompt MUST 要求模型不引入新事实、不编造 id、不扩大任务范围
- **AND** repair-only prompt MUST 允许事实不足时移除结构化输出、返回 `ask_user` 或失败收口

#### Scenario: repair 不替代 runtime 校验
- **WHEN** 模型在 repair 轮返回新 action
- **THEN** runtime MUST 继续执行 schema、toolName、tool input、resource、policy、grounding 和 terminal output validator 校验
- **AND** runtime MUST NOT 因存在 repair prompt 而跳过任何确定性校验
- **AND** runtime MUST NOT 基于用户原文或 repair error code 把 action 改写成另一个语义 action

### Requirement: Repair feedback 必须保持模型可见描述中文化
系统 SHALL 确保 repair prompt、repair payload summary、invalid action observation 和 compressed repair details 中的描述性自然语言使用中文。技术标识、字段名、enum、action type、resource type 和错误 code MUST 保持英文原样。

#### Scenario: repair payload 使用中文描述业务含义
- **WHEN** runtime 生成 `repairContext` 或 invalid action observation
- **THEN** 用户意图、字段用途、恢复边界和失败含义 MUST 使用中文描述
- **AND** `toolName`、`AgentAction`、`tool_call`、`final_answer`、`ask_user`、`visibleOutputs`、`usedRefs`、`resourceId` 和错误 code MUST 保持英文原样
- **AND** repair payload MUST NOT 暴露 provider 原文、secret、stack trace、完整 handler output 或跨用户事实

