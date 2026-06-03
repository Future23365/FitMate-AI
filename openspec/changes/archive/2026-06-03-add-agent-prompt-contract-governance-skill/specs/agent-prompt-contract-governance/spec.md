## ADDED Requirements

### Requirement: Agent prompt 相关任务必须执行 prompt contract governance preflight
系统 SHALL 为修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results、LLM 输出格式说明或业务 tool 模型可见说明的任务执行统一 prompt contract governance preflight。

#### Scenario: 修改 Agent prompt 或 model input
- **WHEN** 开发者或 Codex 准备修改 Agent prompt / model input / manifest / schema summary / examples / repair feedback / observations
- **THEN** 实现前 MUST 使用 Agent prompt 合同治理 Skill
- **AND** 实现前 MUST 检查当前 OpenSpec change 状态和 Git 工作区状态
- **AND** 实现前 MUST 明确本次修改属于通用 Agent prompt 合同、单个业务 tool 模型可见说明、repair / feedback 合同、context / observation 投影，或 production 接入 prompt 规则
- **AND** 实现前 MUST 明确本次允许触碰的 prompt / model input 入口和禁止触碰的 runtime / core 模块

#### Scenario: 任务不属于 Agent prompt 治理范围
- **WHEN** 任务只是普通 UI 文案、README 文案、非 Agent prompt 文案或与模型执行合同无关的小修
- **THEN** 系统 MAY 跳过 Agent prompt 合同治理 Skill
- **AND** 系统 MUST NOT 因此跳过项目已有 OpenSpec、测试、提交和工作区检查规则

### Requirement: Skill 必须固化通用 Agent 编排器 prompt 合同
系统 SHALL 提供一个 Agent prompt 合同治理 Codex Skill，使后续 prompt / model input 变更不会漏掉通用 Agent Orchestrator 的固定使用方式、输出格式和执行边界。

#### Scenario: Skill 被触发
- **WHEN** 用户请求修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations 或业务 tool 的模型可见说明
- **THEN** Codex MUST 使用该 Skill
- **AND** Skill MUST 指示 Codex 先确认模型实际可见输入，而不是只检查源文件文案
- **AND** Skill MUST 指示 Codex 输出问题根因或产品需求、设计方向、预计影响模块和取舍
- **AND** Skill MUST 指示 Codex 在实现完成后总结改动、为什么优于局部 prompt 补丁、如何验证和剩余风险

#### Scenario: Skill 不能替代 prompt 验证
- **WHEN** 后续 change 只新增或更新 Agent prompt 合同治理 Skill
- **THEN** 该 change MUST NOT 被视为 prompt 合同闭环完成
- **AND** 完整实现 MUST 同时包含 prompt config、manifest、schema summary、model input builder、runtime grounding 或等价自动化验证计划

### Requirement: Prompt 必须表达固定 AgentAction 输出格式和 tool 调用边界
系统 SHALL 要求 Agent prompt / model input 明确告诉模型只能按受控 Agent 编排合同行动，不得假装服务端已执行工具或绕过 tool loop。

#### Scenario: 写入通用 Agent prompt 合同
- **WHEN** 后续 change 修改通用 Agent prompt 或 model input
- **THEN** prompt / model input MUST 明确模型只能输出受控 `AgentAction`
- **AND** prompt / model input MUST 明确允许的 action 类型和每类 action 的必需字段
- **AND** prompt / model input MUST 明确 tool 只能使用 `ToolRegistry` 中注册的 `toolName`
- **AND** prompt / model input MUST 明确 tool input 必须严格匹配模型可见 schema
- **AND** prompt / model input MUST 明确模型不能假装 tool 已执行、不能虚构 tool result、不能绕过 `ResourceStore`、`Policy Guard`、`Resource Contract Validator` 或 `Response Renderer`

#### Scenario: Prompt 中缺失固定输出格式
- **WHEN** 后续 prompt change 会改变模型输出格式说明
- **THEN** 该 change MUST 包含测试或审阅步骤，证明 `tool_call`、`final_answer` 和 `ask_user` 的字段要求仍被模型可见输入表达
- **AND** 如果某类 action 暂不支持，prompt / model input MUST 明确该 action 不可用或由服务端拒绝

### Requirement: Prompt 必须表达 final grounding、resource、diagnostic 和 confirmation 边界
系统 SHALL 要求 Agent prompt / model input 明确模型如何基于 tool result 和 resource 收口，避免 failed / diagnostic / unsatisfied 结果支撑成功 final answer。

#### Scenario: 写入成功收口规则
- **WHEN** 后续 change 修改 final answer、tool result、resource、observation 或 repair feedback 相关 prompt
- **THEN** prompt / model input MUST 明确 `final_answer` 必须基于 `satisfied=true` 的 tool result 或 `consumable` resource
- **AND** prompt / model input MUST 明确 diagnostic、failed 或 `satisfied=false` 的 tool result 不能支撑成功 `final_answer`
- **AND** prompt / model input MUST 明确 diagnostic 或 failed 证据只能用于 `ask_user`、失败解释、阻断说明或下一轮 repair
- **AND** prompt / model input MUST 明确 write / high risk tool 必须经过 `Policy Guard` / confirmation，不得由模型自行宣称已确认或已写入

#### Scenario: 修改 repair feedback 或 observations
- **WHEN** 后续 change 修改 repair feedback、observations 或 compressed tool results
- **THEN** 模型可见内容 MUST 保留错误码、tool result 满足状态、resource role 和可恢复建议
- **AND** 模型可见内容 MUST NOT 把完整 tool output、secret、内部 handler payload 或不可消费 diagnostic 伪装成成功资源

### Requirement: 新增业务 tool 必须补齐模型可见说明
系统 SHALL 要求后续新增或修改业务 Agent tool 时同步定义该 tool 的模型可见 prompt 合同，且不得把业务语义分流写回通用 prompt 或服务端规则。

#### Scenario: 新增业务 tool 的模型可见合同
- **WHEN** 后续 change 新增真实业务 Agent tool
- **THEN** 该 change MUST 定义 tool 何时使用、何时不用、input schema 关键字段、成功结果含义、失败或 diagnostic 含义、产出 resource 的 role 和 final answer 如何引用
- **AND** 该 change MUST 区分通用 Agent prompt 规则和该业务 tool 的专属 manifest / schema 描述
- **AND** 该 change MUST NOT 为单个业务 tool 修改通用 Agent prompt 的安全、resource、policy 或 grounding 基础规则，除非 design 明确说明这是 core contract 级需求

#### Scenario: 业务 tool prompt 禁止语义补丁
- **WHEN** 业务 tool prompt 的目标是修复用户自然语言理解、意图选择或 tool 选择偏差
- **THEN** 实现 MUST NOT 通过服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判改写 LLM 的高层语义决策
- **AND** 实现 MUST 优先通过模型可见 manifest、schema summary、examples、Structured Outputs、LLM repair、澄清或领域能力拆分解决

### Requirement: OpenSpec tasks 必须包含 Agent prompt 验证步骤
系统 SHALL 要求非文案类 Agent prompt change 的 `tasks.md` 包含与改动范围对应的 prompt / model input 验证、自动化测试和 OpenSpec validate 步骤。

#### Scenario: 编写后续 Agent prompt change tasks
- **WHEN** 后续 OpenSpec change 涉及 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results 或业务 tool 模型可见说明
- **THEN** `tasks.md` MUST 包含 `openspec validate <change> --strict`
- **AND** `tasks.md` MUST 包含相关 prompt config、manifest、schema summary、model input builder、Agent runtime、final grounding 或黑盒验证任务
- **AND** 如果修改 TypeScript、API、Schema、AI 编排或共享业务逻辑，`tasks.md` MUST 包含 `npm test` 或相关自动化测试，并按需包含 `npm run typecheck`
- **AND** 如果无法运行某项验证，最终实现总结 MUST 说明原因和剩余风险
