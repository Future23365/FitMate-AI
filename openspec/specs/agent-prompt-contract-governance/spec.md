# agent-prompt-contract-governance Specification

## Purpose
TBD - created by archiving change add-agent-prompt-contract-governance-skill. Update Purpose after archive.
## Requirements
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

### Requirement: 业务 tool 模型可见说明必须区分事实查询和候选消费
系统 SHALL 要求修改业务 Agent tool 模型可见说明时，明确区分只读事实查询结果、失败或 diagnostic 结果，以及下游候选消费资源。

#### Scenario: 0 条事实查询说明
- **WHEN** 后续 change 修改 `searchExerciseResources` 或等价只读查询 tool 的 manifest、schema description、examples、observation 或 compressed tool result
- **THEN** 模型可见说明 MUST 明确合法查询返回 `totalMatches = 0` 是事实结果，不是数据库失败
- **AND** 模型可见说明 MUST 明确 `ok = true && fulfillment.satisfied = true` 的 0 条事实查询可以通过 `final_answer.usedToolResultIds` 支撑“没有找到”类普通文本回答
- **AND** 模型可见说明 MUST 明确该结果不等于 routine、plan、训练卡片或候选消费资源

#### Scenario: 不把业务语义分流写入服务端规则
- **WHEN** 业务 tool 的模型可见说明需要解释存在性查询、可用性查询、推荐请求或空结果处理
- **THEN** 实现 MUST NOT 新增服务端关键词、正则、同义词表、短句模板或基于用户原文的语义改写
- **AND** 实现 MUST 将自然语言解释交给 Planner，并通过结构化 output、observation、repair feedback 或澄清边界提供事实依据
- **AND** 通用 Agent prompt MUST NOT 新增单个业务 tool 的自然语言路由特例

### Requirement: 0 条事实查询 observation 必须可用于 repair
系统 SHALL 要求 0 条事实查询相关 observation 和 repair feedback 保留足够结构化信息，使模型能够从非法引用、重复调用或错误理解中恢复。

#### Scenario: Repair 轮可见合法收口方式
- **WHEN** Planner 因引用不可用 tool result、非法 input 或其他可恢复错误进入 repair
- **AND** 当前 run 存在 `ok = true && fulfillment.satisfied = true && totalMatches = 0` 的事实查询结果
- **THEN** repair / observation 内容 MUST 保留该 `toolResultId`、`totalMatches`、`returnedCount`、`appliedFilters` 和 grounding 说明
- **AND** 模型可见内容 MUST 说明可以基于该事实输出合法 `final_answer`，但不能将空 `exercises` 当作候选消费资源

### Requirement: 模型可见描述性 prompt 默认使用中文
系统 SHALL 要求所有 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results、AgentAction 输出格式说明和 final grounding 说明中的描述性自然语言默认使用中文。

#### Scenario: 审查模型可见描述字段
- **WHEN** 后续 change 修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations 或 compressed tool results
- **THEN** 实现前 MUST 检查模型实际可见的描述性自然语言是否默认使用中文
- **AND** `toolName`、字段名、enum、action type、resource type、schema id、命令、路径和代码标识符 MUST 保持英文原样
- **AND** 如果必须保留英文原文，说明中 MUST 同时提供中文解释，且不得改变结构化合同含义

#### Scenario: 新增或修改业务 tool 模型可见说明
- **WHEN** 后续 change 新增或修改业务 Agent tool 的 `description`、`whenToUse`、`whenNotToUse`、schema description 或 examples
- **THEN** 这些描述性字段 MUST 使用中文说明业务能力边界、使用条件、禁止条件、成功结果、失败含义和 final answer 引用方式
- **AND** 技术标识、字段名和枚举值 MUST 保持原始英文值

### Requirement: terminal output repair feedback 必须表达可恢复边界

系统 SHALL 要求修改 Agent prompt、model input、tool manifest、observations、compressed tool results 或 repair feedback 时，确保 terminal output validation failure 的模型可见信息表达可恢复边界。模型可见说明 MUST 帮助 Planner 在结构冲突、字段缺失、引用不可用或资源覆盖不足时选择合法的 `tool_call`、`final_answer`、`ask_user` 或安全失败收口，而不是重复输出同一个非法结构。

#### Scenario: visible output 校验失败进入模型可见 repair

- **WHEN** Planner 的 `final_answer.visibleOutputs[]` 因 schema、section 覆盖、数据库动作事实、resource grounding 或 terminal reference 校验失败
- **AND** repair budget 尚未耗尽
- **THEN** 下一轮模型可见 observation / repair feedback MUST 包含稳定失败 code、失败 path、失败边界摘要和可恢复方向
- **AND** 模型可见内容 MUST 区分可消费 resource、satisfied tool result、diagnostic / failed / unsatisfied result 和不可引用事实
- **AND** 模型可见内容 MUST NOT 暴露完整数据库对象、secret、跨用户 payload 或内部 stack

#### Scenario: routine / plan section 覆盖失败不变成语义分流

- **WHEN** repair feedback 需要说明 `visibleTrainingProposal.payload.kind = "routine"` 或 `payload.kind = "plan"` 缺少必要 section
- **THEN** 模型可见内容 MUST 表达 `warmup`、`training`、`stretch` 的结构化覆盖要求
- **AND** 模型可见内容 MUST 表达正文建议不能替代 `exerciseItems[]` 中可校验的 section 动作事实
- **AND** 模型可见内容 MUST NOT 使用具体用户原话、关键词、短句模板、同义词表或 phrasing 作为触发条件
- **AND** 模型可见内容 MUST NOT 要求服务端基于用户原文选择或改写 `payload.kind`

#### Scenario: 业务实例只进入局部合同或测试

- **WHEN** 修复方案涉及 `visibleTrainingProposal`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 或等价业务名
- **THEN** 这些业务名 MUST 只作为 tool manifest、schema description、observation projection、resource contract、validator diagnostics 或回归测试样例出现
- **AND** 通用 Agent prompt、runtime、Response Renderer 和 `/api/chat` route MUST NOT 新增针对具体业务 toolName 的语义分支
- **AND** 回归测试 MAY 使用真实用户输入和 trace 条件，但测试样例 MUST NOT 反向决定生产规则

