## ADDED Requirements

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
