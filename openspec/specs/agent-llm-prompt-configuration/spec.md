# agent-llm-prompt-configuration Specification

## Purpose
TBD - created by archiving change externalize-agent-llm-prompts. Update Purpose after archive.
## Requirements
### Requirement: Agent LLM prompt 必须集中配置
系统 SHALL 为 `LlmPlanner` 使用的模型可见 prompt 提供独立配置模块。模型 adapter MUST NOT 在供应商请求构造函数中硬编码默认 system prompt 文案。

#### Scenario: 默认 prompt 来自配置模块
- **WHEN** 生产 `DeepSeekModelAdapter` 构造模型请求体
- **THEN** system message MUST 来自 Agent LLM prompt 配置模块
- **AND** adapter MUST NOT 在 `createRequestBody()` 或等价函数中内联默认 prompt 句子
- **AND** prompt 配置 MUST 暴露稳定 `promptVersion` 或等价版本标识

#### Scenario: 测试注入自定义 prompt 配置
- **WHEN** 测试或后续 adapter 构造显式传入自定义 prompt 配置
- **THEN** 模型请求体 MUST 使用该配置生成 system message
- **AND** 默认配置 MUST 不被测试用自定义配置全局污染

### Requirement: Prompt 配置必须保持模型供应商边界
系统 SHALL 将 prompt 内容配置与模型供应商协议解耦。`agent-core` MUST NOT 依赖 prompt 配置、DeepSeek message 格式、DeepSeek endpoint、API key 或供应商响应结构。

#### Scenario: agent-core 保持模型无关
- **WHEN** Agent runtime 调用 `PlannerPort`
- **THEN** `agent-core` MUST 只传递 `PlannerInput`
- **AND** `agent-core` MUST NOT 导入 Agent LLM prompt 配置模块
- **AND** `agent-core` MUST NOT 构造 DeepSeek/OpenAI/Anthropic 等供应商请求 messages

#### Scenario: Adapter 只负责供应商请求映射
- **WHEN** `DeepSeekModelAdapter` 收到 `PlannerInput`
- **THEN** adapter MAY 将 prompt 配置和 user payload 映射为 DeepSeek messages
- **AND** adapter MUST NOT 注册 tool、执行 tool、投影用户事件或修改 runtime 校验结果

### Requirement: 默认 prompt 必须只描述通用 AgentAction 合同
系统 SHALL 将默认 Agent LLM prompt 限定为通用决策合同、输出格式和安全边界。默认 prompt MUST NOT 混入具体业务 tool、动作库、训练生成、保存、用户记忆或业务语义分流规则。

#### Scenario: 默认 prompt 描述允许的 AgentAction
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 要求模型只返回一个 JSON object
- **AND** system message MUST 要求输出匹配 `AgentAction`
- **AND** system message MUST 明确允许的 `type` 为 `tool_call`、`final_answer`、`ask_user`
- **AND** system message MUST 禁止模型直接执行 tool、伪造 confirmation/hash、泄漏 secret 或输出 NDJSON event

#### Scenario: 默认 prompt 不包含业务能力说明
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 prompt MUST NOT 包含 `searchExercises`、训练生成、计划保存、artifact revision、用户记忆、推荐卡片或具体业务 toolName 的流程说明
- **AND** 具体业务能力的模型可见说明 MUST 来自后续独立业务 tool 的 manifest、resource contract、projection 或 observation

### Requirement: Prompt 配置不得改变 /api/chat 业务行为
系统 SHALL 在抽离 prompt 配置时保持当前 `/api/chat` 文本聊天能力边界。该 change MUST NOT 修改 `/api/chat` 外部请求 schema、前端事件合同、业务 tool 注册或用户可见训练业务能力。

#### Scenario: /api/chat 仍使用当前文本聊天链路
- **WHEN** prompt 配置抽离完成
- **THEN** `/api/chat` MUST 仍通过 `PreparedChatRequest -> AgentRunInput -> ToolRegistry -> LlmPlanner -> runAgentRuntime -> Response Renderer` 或等价链路执行
- **AND** 本 change MUST NOT 新增动作推荐、训练生成、保存 artifact、用户记忆或数据库业务查询能力
- **AND** 本 change MUST NOT 在 `/api/chat` 中新增关键词、正则、同义词或短句模板分流

#### Scenario: 架构扫描验证未混入业务
- **WHEN** 本 change 完成实现
- **THEN** 自动化扫描 MUST 证明 prompt 配置模块未导入业务 tool 注册入口、动作库服务、训练生成服务、Prisma 数据访问或旧 `agent-orchestrator`
- **AND** 扫描 MUST 证明生产注册入口没有因 prompt 配置抽离新增 fixture tool 或真实业务 tool

### Requirement: Prompt 文档必须指向当前真实入口
系统 SHALL 更新 prompt 相关文档，使开发者能从文档定位当前生产 prompt 配置入口，并区分旧 prompt module 与新 Agent LLM prompt 配置。

#### Scenario: 文档不再把旧 prompt-config 当作当前入口
- **WHEN** 开发者阅读 prompt 说明文档
- **THEN** 文档 MUST 指向新的 Agent LLM prompt 配置模块作为当前生产 `/api/chat` 的 prompt 来源
- **AND** 文档 MUST 说明旧 `lib/server/ai/prompt-config.ts` 不再是当前生产入口
- **AND** 文档 MUST 说明业务能力说明应来自 tool manifest/resource/projection，而不是混入通用默认 prompt

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 在默认 Agent LLM prompt 中说明 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。Prompt MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: Prompt 描述结构能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** system message MUST 说明每种结构对应的必需字段和服务端校验边界
- **AND** system message MUST 说明模型应根据用户目标、上下文、已获得事实和 tool result 自主选择输出结构
- **AND** system message MUST NOT 写入“用户说某个固定词语就必须输出某个 kind”的规则

#### Scenario: Prompt 表达事实来源边界
- **WHEN** system message 描述 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** system message MUST 说明动作 id 应来自当前 run 可见且 `satisfied=true` 的动作事实来源，或当前用户可访问的 `visible_training_proposal_fact`
- **AND** system message MUST 说明服务端会在渲染和保存前复核数据库事实
- **AND** system message MUST NOT 要求模型复写完整动作详情

#### Scenario: Prompt 不引入旧式 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺或要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 承诺或要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 `ToolRegistry` 的训练生成能力

### Requirement: 模型可见合同必须表达 visibleTrainingProposal 的动作 section 事实来源
系统 SHALL 在生产 Planner 可见的 prompt、model input 或等价合同说明中表达 `visibleTrainingProposal.exerciseItems[*]` 的动作事实边界。说明 MUST 表达 `exerciseId` 和 `section` 需要由当前 run 可见动作事实支撑，`allowedSections` 表示该动作可进入哪些 section。该说明 MUST NOT 把具体业务 tool 的调用顺序写成通用 Agent prompt 规则。

#### Scenario: prompt 表达 allowedSections 合同
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** 模型可见输入 MUST 包含 `visibleTrainingProposal.exerciseItems[*]` 与动作事实的合同说明
- **AND** 模型可见输入 MUST 表达 `allowedSections` 是校验 `exerciseItems[*].section` 的确定性动作事实字段
- **AND** 模型可见输入 MUST 使用中文描述业务含义
- **AND** 模型可见输入 MUST 保持 `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`allowedSections` 等技术标识英文原样

#### Scenario: 通用 prompt 不写具体 tool 恢复流程
- **WHEN** 默认 Agent LLM prompt 配置生成 system message
- **THEN** system message MUST NOT 包含要求 Planner 在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支
- **AND** 具体 tool 能力、`groups.<section>` 语义和 output 说明 MUST 由对应 tool manifest、schema description、examples 或 observation projection 表达

### Requirement: 默认 prompt 必须引导引用对象推理
系统 SHALL 在默认 Agent LLM prompt 中表达通用引用对象推理规则。Prompt MUST 引导模型基于本轮用户请求、最近对话、metadata、observations 和 tool results 自行判断用户是否在引用上一轮、当前可见、已生成或已选择的对象；系统 MUST NOT 通过服务端关键词、正则、同义词表、短句模板或业务条件替模型判断该语义。

#### Scenario: 省略表达由模型自行推理引用对象
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明省略、续问、替换、调整、继续或引用最近内容的用户请求，需要由模型基于当前可见上下文和事实自行判断依赖对象
- **AND** system message MUST 使用中文描述业务含义
- **AND** system message MUST NOT 包含 `换一批`、`再来一组`、`factCount = 0` 或等价固定短语 / 固定字段条件作为触发规则

#### Scenario: 缺少引用对象时不得编造或复读历史回复
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明如果当前可见事实不足以确认被引用对象存在或可操作，模型不得编造对象
- **AND** system message MUST 说明历史 assistant 消息只能作为上下文参考，不得作为本轮回复模板重复输出，除非用户明确要求复述
- **AND** system message MUST 引导模型在上下文不足时自然说明缺少可继续操作的上下文，并给出可恢复下一步

#### Scenario: 本轮新增事实优先参与推理
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当本轮存在新的 observations 或 tool results 时，terminal action 应将这些最新事实纳入推理
- **AND** system message MUST NOT 要求模型固定调用某个业务 tool、固定输出某个 `payload.kind` 或固定引用某个 tool result / resource

#### Scenario: 不新增模型可见语义外壳
- **WHEN** 实现本 prompt change
- **THEN** 系统 MAY 继续使用当前 `messages`、`metadata`、`observations` 和 `toolResults` 作为模型可见输入结构
- **AND** 本 change MUST NOT 因该规则新增 `currentTurn`、`evidence`、`conversationContext` 或等价稳定语义外壳

### Requirement: prompt change 不得引入服务端语义分流
系统 SHALL 保持 `/api/chat`、Agent runtime、validator 和 tool handler 的语义中立。模型自然语言理解、引用对象判断和最终回复策略 SHALL 继续由模型基于可见输入推理完成。

#### Scenario: route 和 runtime 不识别固定用户短语
- **WHEN** 实现本 change
- **THEN** `/api/chat`、Agent runtime、validator、`Policy Guard`、`ResourceStore` 和 `Response Renderer` MUST NOT 新增基于 `换一批`、`再来一组`、`重新来一套` 或等价用户原文短语的条件分支
- **AND** 系统 MUST NOT 根据用户原文把请求改写成固定 `toolName`、固定 action 或固定 final answer

#### Scenario: 不实现强制 tool result 引用 guard
- **WHEN** 实现本 change
- **THEN** validator 或 runtime MUST NOT 新增“只要本轮调用过 tool，terminal action 就必须引用 tool result / resource”的强制 guard
- **AND** 是否使用 tool result / resource MUST 由模型基于本轮用户请求、上下文和可见事实自行判断

### Requirement: Agent LLM prompt 必须表达 visibleTrainingProposal 刷新语义
系统 SHALL 在默认 Agent LLM prompt 中表达 `visibleTrainingProposal` 的刷新语义：当用户基于上一套用户可见训练方案要求替换、重新来一套、不满意或同类继续请求时，模型应理解为保留原目标和约束，并优先让新的 `exerciseItems` 与上一套用户已看到动作产生实质差异。该说明 MUST NOT 写成固定自然语言短语到固定 tool、固定 action 或固定 `payload.kind` 的映射。

#### Scenario: Prompt 描述刷新结果要求
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明上一套 `visibleTrainingProposal` 的刷新目标是保留原训练目标、器械、难度、时长、section 和计划约束
- **AND** system message MUST 说明刷新时应优先替换上一套用户已看到的 `exerciseItems`
- **AND** system message MUST 说明不得只按原始需求和同一排序重新生成导致重复方案
- **AND** system message MUST 使用中文描述业务含义，`visibleTrainingProposal`、`exerciseItems`、`routine`、`plan`、`payload.kind` 等技术标识保持英文原样

#### Scenario: Prompt 不固定 tool 调用
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 表达成用户说出某个固定短语时必须调用 `inspectVisibleTrainingProposals`
- **AND** system message MUST NOT 表达成用户说出某个固定短语时必须调用 `searchExerciseResources`
- **AND** system message MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序
- **AND** system message MUST NOT 要求服务端根据用户原文选择 tool 或改写 action

#### Scenario: Prompt 描述候选不足和保留例外
- **WHEN** system message 描述训练方案刷新
- **THEN** system message MUST 说明如果用户明确要求保留某些动作，模型可以保留这些动作
- **AND** system message MUST 说明如果在当前约束下候选不足，模型应说明原因、询问是否放宽条件或只输出可支撑的结构
- **AND** system message MUST 说明模型不能在未说明原因的情况下把重复旧动作称为已经完成刷新

### Requirement: Agent LLM prompt 必须区分刷新动作与调整处方
系统 SHALL 在模型可见合同中区分替换训练方案动作和调整既有训练方案处方。用户要求“换一批”“重新来一套”等表达可能意味着替换动作；用户要求调整组数、时长、顺序、休息或难度时，模型应优先保留动作并调整对应结构字段，除非用户同时表达替换动作。

#### Scenario: Prompt 描述处方调整不默认换动作
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达仅调整处方、顺序、时长、休息或难度的请求不应默认替换全部动作
- **AND** system message MUST 表达模型应根据用户目标和上下文自主判断是调整字段、读取事实、查询替代动作、澄清还是失败收口
- **AND** system message MUST NOT 使用关键词表替代模型判断

### Requirement: Agent LLM prompt 必须表达多天计划组合路径
系统 SHALL 在默认 Agent LLM prompt 中为 `visibleTrainingProposal.payload.kind = "plan"` 提供模型可见的结构选择和组合顺序说明。Prompt MUST 引导模型根据用户目标、上下文、可见 tools、observations 和 tool results 自主判断训练输出结构；系统 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板替模型选择或改写 `payload.kind`。

#### Scenario: Prompt 描述 plan 的结构选择边界
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当用户目标需要周期、多天、频次、训练日 / 休息日安排或跨天训练计划时，模型应优先使用 `payload.kind = "plan"`
- **AND** system message MUST 说明这是一条训练输出结构选择规则，不是固定词语触发规则
- **AND** system message MUST 说明服务端只校验模型声明的结构、权限和数据库事实，不会根据用户原文替模型改写 `kind`
- **AND** system message MUST 继续说明只需要一批可选训练动作时使用 `payload.kind = "exercise_selection"`

#### Scenario: Prompt 描述 plan 的生成顺序
- **WHEN** 默认 prompt 描述 `payload.kind = "plan"`
- **THEN** system message MUST 说明模型应先确认或使用当前可见的训练目标、限制、器械、时间和难度
- **AND** system message MUST 说明模型应查询或复用 `training` 动作事实作为主训练动作来源
- **AND** system message MUST 说明当前 run 缺少可消费 `warmup` 或 `stretch` 动作事实时，应优先使用可见 tool 查询缺失 section
- **AND** system message MUST 说明 `plan` 的 `exerciseItems` 必须组成同一套 `warmup` / `training` / `stretch` 编排，并为每个动作项绑定 `prescription`
- **AND** system message MUST 说明 `plan` 必须用 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** system message MUST 说明 `schedule` 不得内嵌每天不同的完整动作编排

#### Scenario: Prompt 禁止 plan 或 routine 目标降级为纯动作推荐
- **WHEN** 模型判断用户目标需要 `routine` 或 `plan`
- **AND** 当前 run 只具备 `training` 动作事实
- **AND** 当前可见 tools 支持继续查询缺失 section
- **THEN** system message MUST 引导模型优先继续查询缺失的 `warmup` / `stretch` 动作事实
- **AND** system message MUST 说明不得因为只查到了 `training` 动作就输出 `payload.kind = "exercise_selection"` 来替代 `routine` 或 `plan`
- **AND** system message MUST 说明如果 tool 不可用、事实仍不足或用户目标缺少必要约束，模型应使用 `ask_user`、失败收口或仅输出不伪造结构事实的说明

#### Scenario: Prompt 不把 repair feedback 当作主合同
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 在首轮可见合同中表达 plan 组合路径和禁止降级边界
- **AND** system message MUST NOT 只依赖 validation failure 或 repair feedback 才向模型说明 plan 需要补齐 `warmup` / `stretch` 和 `schedule`
- **AND** system message MUST NOT 要求模型调用未注册 tool 或隐藏训练生成服务

