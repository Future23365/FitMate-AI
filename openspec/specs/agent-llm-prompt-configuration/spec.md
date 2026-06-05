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
系统 SHALL 保持 `/api/chat`、Agent runtime、validator、tool handler 和 renderer 的语义中立。模型自然语言理解、引用资源操作和最终输出策略 SHALL 继续由模型基于可见输入推理完成。

#### Scenario: route 和 runtime 不识别固定用户短语
- **WHEN** 实现本 change
- **THEN** `/api/chat`、Agent runtime、validator、`Policy Guard`、`ResourceStore`、tool handler 和 `Response Renderer` MUST NOT 新增基于用户原文短语的条件分支
- **AND** 系统 MUST NOT 根据用户原文把请求改写成固定 `toolName`、固定 action、固定 `payload.kind` 或固定 final answer

#### Scenario: 具体业务名只作为局部说明或测试样例
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 或 `searchExerciseResources`
- **THEN** 这些业务名 MUST 只出现在对应 tool manifest、observation projection、resource contract、spec 或回归测试中
- **AND** 通用 prompt MUST NOT 把这些业务名写成语义触发条件或固定 tool 调用流程

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

### Requirement: Agent LLM prompt 配置必须迁移到服务端集中配置目录
系统 SHALL 将生产 `LlmPlanner` 使用的 Agent LLM prompt 配置放在 `lib/server/config/` 下，与 Agent runtime TS config 统一管理。迁移 MUST 保持现有模型可见合同含义、`promptVersion`、请求默认值和测试注入能力。

#### Scenario: 默认 prompt 配置入口位于 lib/server/config
- **WHEN** 开发者查看生产 Agent LLM prompt 配置入口
- **THEN** 当前默认入口 MUST 位于 `lib/server/config/` 下
- **AND** 旧 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts` MUST 被删除或改为不承载生产默认内容的短期 re-export
- **AND** 若保留短期 re-export，tasks MUST 明确清理条件和测试覆盖

#### Scenario: Adapter 继续消费 prompt 配置而不内联 prompt
- **WHEN** `DeepSeekModelAdapter` 构造 system message
- **THEN** adapter MUST 从迁移后的 prompt 配置入口构造 system prompt
- **AND** adapter MUST NOT 在供应商请求构造函数中内联默认 prompt 句子
- **AND** adapter MUST 继续支持测试传入自定义 prompt 配置

#### Scenario: 迁移不改变 prompt 语义
- **WHEN** prompt 配置迁移完成
- **THEN** 生成的默认 system prompt 内容 MUST 与本 change 前的业务含义保持一致，除非实现任务明确列出独立 prompt 合同变更
- **AND** 本 change MUST NOT 借迁移新增服务端关键词分流、固定 tool 调用规则或新的业务 toolName 流程

#### Scenario: 文档和测试指向新入口
- **WHEN** 开发者阅读 prompt 相关文档或测试失败信息
- **THEN** 文档和测试 MUST 指向 `lib/server/config/` 下的新 prompt 配置入口
- **AND** 文档 MUST 不再把旧 `lib/server/ai/prompt-config.ts` 或旧 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts` 当作生产默认入口

### Requirement: 默认 prompt 必须表达引用资源操作合同
系统 SHALL 在默认 Agent LLM prompt 中表达引用资源操作合同。Prompt MUST 引导模型区分复用、派生、调整、替换和澄清这些稳定操作类型；Prompt MUST NOT 使用固定用户短语、关键词、正则、同义词表、具体业务 `toolName` 或字段组合规定必须选择某个操作、tool、action 或 `payload.kind`。

#### Scenario: Prompt 引导引用资源操作分类
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明引用已有对象时应先基于当前可见上下文判断目标是 `reuse`、`derive`、`modify`、`replace` 还是 `clarify`
- **AND** system message MUST 说明 `reuse`、`derive` 和 `modify` 应优先把可消费资源作为正向事实来源
- **AND** system message MUST 说明 `replace` 才适合把已看到动作作为负向排除约束
- **AND** system message MUST 使用中文描述业务含义，技术标识保持英文原样

#### Scenario: Prompt 不包含固定短句触发规则
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 包含原始失败用户短句或等价固定短语作为触发规则
- **AND** system message MUST NOT 表达成 `toolName = "inspectVisibleTrainingProposals"` 或 `toolName = "searchExerciseResources"` 时必须选择固定下一步
- **AND** system message MUST NOT 根据 `factRef`、`excludeExerciseIds`、`requiredExerciseIds` 或 section 数量的具体组合替模型判断用户语义

### Requirement: 默认 prompt 必须表达结构输出受可见事实覆盖约束
系统 SHALL 在默认 Agent LLM prompt 中表达：最终 `visibleTrainingProposal` 的结构强度必须由当前 run 可见事实支撑。Prompt MUST 引导模型在事实不足时继续获取事实、澄清、失败收口或输出当前事实可支撑的结构。

#### Scenario: Prompt 表达 routine 和 plan 的 section 覆盖要求
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达 `routine` 和 `plan` 需要 `warmup`、`training`、`stretch` 三类 section 的可消费动作事实
- **AND** system message MUST 表达 `exerciseItems[*].section` 必须被对应动作事实的 `allowedSections` 支撑
- **AND** system message MUST 表达只有 `training` 动作事实时不得伪造 `warmup` 或 `stretch`

#### Scenario: Prompt 表达事实不足的恢复方式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达如果最终结构所需 section、动作、处方或 schedule 缺少可见事实，模型应基于可见 tool 和事实自主选择继续查询、澄清、失败收口或输出当前事实可支撑结构
- **AND** system message MUST NOT 固定要求调用某个业务 tool
- **AND** system message MUST NOT 固定要求输出某个 `payload.kind`

### Requirement: 默认 prompt 必须区分引用型请求和独立生成请求
系统 SHALL 在默认 Agent LLM prompt 中表达引用目标解析合同。Prompt MUST 引导模型区分“操作已有对象”的引用型请求和“按新目标生成内容”的独立生成请求；系统 MUST NOT 通过服务端关键词、正则、同义词表、短句模板、业务 `toolName` 或字段组合替模型判断该语义。

#### Scenario: 引用型请求需要真实可操作对象
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当本轮请求依赖已有对象时，模型必须基于当前 run 的 `messages`、`metadata`、`observations`、`toolResults` 或 consumable resource 判断被引用对象是否真实存在且可操作
- **AND** system message MUST 使用中文描述业务含义
- **AND** system message MUST NOT 包含 `换一批`、`再来一组`、`facts=[]`、`toolName = inspectVisibleTrainingProposals` 或等价固定短语 / 固定字段 / 固定业务 tool 条件作为触发规则

#### Scenario: 缺失引用对象不得降级成相邻新生成
- **WHEN** 当前可见事实不足以确认引用对象存在或可操作
- **THEN** system message MUST 说明模型不得把引用型请求改写成相邻的新生成目标
- **AND** system message MUST 说明模型不得输出结构化结果并声称已经完成替换、刷新或调整
- **AND** system message MUST 引导模型自然说明缺少可继续操作的上下文、请求用户补充目标，或在用户已提供独立生成目标和约束时明确按新目标处理

#### Scenario: 独立生成必须明确不是继续操作
- **WHEN** 用户已经提供足够独立生成所需的目标和约束
- **THEN** system message MUST 允许模型按新目标自主选择 tool_call、final_answer 或 ask_user
- **AND** system message MUST 要求模型在 content 中避免把独立生成描述成对不可见已有对象的继续、替换、刷新或调整
- **AND** system message MUST NOT 要求固定调用某个业务 tool、固定输出某个 `payload.kind` 或固定引用某个 tool result / resource

### Requirement: 引用目标合同不得引入服务端语义分流
系统 SHALL 保持 `/api/chat`、Agent runtime、validator、tool handler 和 renderer 的语义中立。模型自然语言理解、引用对象判断和最终回复策略 SHALL 继续由模型基于可见输入推理完成。

#### Scenario: 服务端不识别固定用户短语或字段组合
- **WHEN** 实现本 change
- **THEN** `/api/chat`、Agent runtime、validator、`Policy Guard`、`ResourceStore`、tool handler 和 `Response Renderer` MUST NOT 新增基于 `换一批`、`再来一组`、`重新来一套` 或等价用户原文短语的条件分支
- **AND** 系统 MUST NOT 根据用户原文、具体 `toolName`、`facts=[]`、`factCount = 0` 或同类字段组合把请求改写成固定 action、固定 tool 调用或固定 final answer

#### Scenario: 具体业务名只作为局部说明或测试样例
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 或 `searchExerciseResources`
- **THEN** 这些具体业务名 MUST 只出现在对应 tool manifest、observation projection、resource contract、spec 或回归测试中
- **AND** 通用 Agent prompt MUST NOT 把这些业务名写成语义触发条件或固定 tool 调用流程

### Requirement: 默认 prompt 必须用短 JSON 形状表达 AgentAction 字段
系统 SHALL 在默认 Agent LLM prompt 或等价模型可见输入中，用简短 JSON 形状表达当前允许的 `AgentAction` 类型和必需字段。字段示例 MUST 与当前 schema 完全一致，并且 MUST 遵守同一语义槽只使用一个字段名的原则。

#### Scenario: prompt 展示三类 action 的合法形状
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** 模型可见输入 MUST 包含 `tool_call`、`final_answer` 和 `ask_user` 的最小合法 JSON 形状
- **AND** `final_answer` 示例 MUST 使用 `content`
- **AND** `ask_user` 示例 MUST 使用 `content`
- **AND** `tool_call` 示例 MUST 使用 `toolName` 和 `input`
- **AND** 示例 MUST NOT 使用 `ask_user.question`、`usedToolResultIds`、`usedResourceRefs` 或其他已废弃同义字段

#### Scenario: prompt 说明语义差异由 type 表达
- **WHEN** 模型可见输入说明 terminal action
- **THEN** prompt MUST 说明 `final_answer` 与 `ask_user` 的用户可见文本都写入 `content`
- **AND** prompt MUST 说明两者差异由 action `type` 表达
- **AND** prompt MUST 使用中文解释业务含义，`type`、`content`、`tool_call`、`final_answer`、`ask_user` 等技术标识保持英文原样

#### Scenario: prompt 说明旧字段不可用
- **WHEN** prompt 描述字段要求或 repair 规则
- **THEN** prompt MUST 明确 `ask_user.question`、`final_answer.assistantSuggestions`、`ask_user.suggestions`、`usedToolResultIds` 和 `usedResourceRefs` 不属于新主合同
- **AND** prompt MUST NOT 暗示服务端会把这些字段转换成新字段
- **AND** prompt MUST 引导模型在 repair 时直接输出新字段形状

### Requirement: 默认 prompt 必须表达统一 grounding 引用字段
系统 SHALL 在默认 Agent LLM prompt 中表达 terminal action 使用统一 `usedRefs` 引用当前 run 中已登记事实来源。Prompt MUST NOT 继续要求模型在 tool result 和 resource 之间切换不同顶层字段名。

#### Scenario: prompt 说明 usedRefs 结构
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `usedRefs` 是 terminal action 的统一事实来源引用数组
- **AND** `tool_result` 引用 MUST 使用 `{ "type": "tool_result", "id": "..." }` 或当前 schema 等价结构
- **AND** `resource` 引用 MUST 使用 `{ "type": "resource", "id": "...", "resourceType": "..." }` 或当前 schema 等价结构
- **AND** prompt MUST 说明 `visibleOutputs[]` 仍是结构化用户可见输出，不是 grounding 引用的同义字段

#### Scenario: prompt 不改变 grounding 安全边界
- **WHEN** prompt 描述 `usedRefs`
- **THEN** prompt MUST 说明服务端仍会校验 tool result、resource role、resourceType、当前 run 归属和 satisfied 状态
- **AND** prompt MUST 说明 failed、diagnostic 或 `satisfied=false` 结果不能支撑成功 `final_answer`
- **AND** prompt MUST NOT 要求模型绕过 ResourceStore、Policy Guard、Resource Contract Validator 或 Response Renderer

### Requirement: 默认 prompt 必须表达明确 routine 请求的正向组合路径
系统 SHALL 在默认 Agent LLM prompt 中表达：当模型判断用户目标需要一次可执行 `routine`，且当前 run 已具备主训练 `training` 动作事实并可通过可见 tool 获取缺失 section 时，模型 MUST 优先继续获取 `warmup` / `stretch` 动作事实并输出完整三段式 `routine`。该合同 MUST NOT 使用固定用户短语、关键词、正则、同义词表或服务端语义分流替代模型判断。

#### Scenario: Prompt 引导候选足够时生成完整 routine
- **WHEN** 默认 prompt 配置生成 system message
- **AND** system message 描述 `payload.kind = "routine"` 的输出边界
- **THEN** system message MUST 说明明确 routine 目标在已有 `training` 动作事实且可继续查询缺失 section 时，应继续获取 `warmup` / `stretch` 动作事实
- **AND** system message MUST 说明候选足够后最终输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** system message MUST 说明 `routine` 必须包含 `warmup`、`training`、`stretch` 三类 `exerciseItems`，并为每个动作项绑定 `prescription`

#### Scenario: Prompt 禁止 routine 目标降级为动作列表
- **WHEN** 默认 prompt 描述明确 routine 目标的终态
- **THEN** system message MUST 说明不得因为只先查到 `training` 动作事实，就输出 `payload.kind = "exercise_selection"`、正文动作列表或“用户自行组合”的说明来替代 `routine`
- **AND** system message MUST 说明如果候选不足、tool 不可用或关键约束不足，合法收口是 `ask_user` 或不带 `visibleOutputs` 的 `final_answer`，说明缺口和可恢复下一步

#### Scenario: Prompt 不新增服务端语义分流
- **WHEN** 实现本 change
- **THEN** 默认 prompt MUST NOT 写入 F04、F17、F18 或等价测试编号
- **AND** 默认 prompt MUST NOT 写入“当用户说 X 时必须调用 Y”这类固定短语规则
- **AND** `/api/chat`、Agent runtime、tool handler、validator 和 renderer MUST NOT 根据用户原文改写 `toolName`、action 或 `payload.kind`

### Requirement: 默认 prompt 必须表达新训练输出的信息充分性门槛
系统 SHALL 在默认 Agent LLM prompt 中表达：当模型准备新输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal` 时，必须先确认当前对话、当前 run 已导入事实或当前 run 的 tool results 已提供足够可解释的训练目标和关键约束。信息不足时，模型 MUST 使用 `ask_user`，或输出不含 `visibleOutputs` 的 `final_answer` 说明可选方向和可恢复下一步。

#### Scenario: Prompt 表达 exercise_selection 的最低信息门槛
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `payload.kind = "exercise_selection"` 至少需要当前可见上下文中存在训练目标、身体部位、动作类别、器械限制、场地限制、目标标签、点名动作或其他可解释筛选条件之一
- **AND** system message MUST 说明缺少这些条件时不得输出随机动作卡片
- **AND** system message MUST 使用中文描述业务含义
- **AND** `payload.kind`、`exercise_selection`、`visibleOutputs`、`ask_user` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 表达 routine 的最低信息门槛
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `payload.kind = "routine"` 需要当前可见上下文中存在单次训练目标或部位、单次时长、可用器械或场地等关键约束
- **AND** system message MUST 说明目标、时长、器械或场地不足以解释方案时，应先澄清或给出可选方向，不得推送默认 routine 卡片

#### Scenario: Prompt 表达 plan 的最低信息门槛
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `payload.kind = "plan"` 需要当前可见上下文中存在长期目标、训练频率或周期、单次时长、可用器械或场地等关键约束
- **AND** system message MUST 说明频率、时长、目标或器械/场地不足时，应先澄清或给出可选方向，不得推送空泛 plan 卡片

#### Scenario: Prompt 不引入 phrasing 特判
- **WHEN** 默认 prompt 表达信息充分性门槛
- **THEN** system message MUST NOT 使用固定用户短句作为触发条件
- **AND** system message MUST NOT 要求固定 `toolName`、固定 tool 调用次数、固定调用顺序或服务端语义分流
- **AND** system message MUST NOT 承诺服务端会自动补齐训练目标、时长、频率、器械或场地

### Requirement: 默认 prompt 必须表达 final_answer 的终态完成语义
系统 SHALL 在默认 Agent LLM prompt 中表达 `final_answer` 是当前 run 的终态动作。Prompt MUST 说明 `final_answer.content` 只能解释本轮已经完成、明确阻断或失败收口的结果；如果还需要执行 tool、查询事实、生成结构、保存结果或等待内部步骤，模型 MUST 返回合法 `tool_call`、`ask_user` 或失败收口。

#### Scenario: Prompt 说明 final_answer 不会触发后续 tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `final_answer` 是终态，不会让 runtime 在本轮回复后继续自动调用 tool
- **AND** system message MUST 使用中文描述业务含义
- **AND** `final_answer`、`tool_call`、`ask_user`、`visibleOutputs`、`usedToolResultIds` 和 `usedResourceRefs` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 禁止未执行步骤的成功承诺
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明模型不得用 `final_answer.content` 承诺尚未执行的查询、生成、保存、等待或后续内部动作
- **AND** system message MUST 说明需要继续获取事实时必须返回当前可见且合法的 `tool_call`
- **AND** system message MUST NOT 要求固定 tool 调用次数、固定 tool 调用顺序或固定业务 `toolName`

#### Scenario: Prompt 表达 tool 后 final_answer 的 grounding
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当前 run 已经有 tool result 时，成功 `final_answer` 应通过 `usedToolResultIds`、`usedResourceRefs` 或合法 `visibleOutputs[]` 连接到当前 run 已满足事实
- **AND** system message MUST 说明 failed、diagnostic 或 `satisfied=false` 的 tool result 只能用于 `ask_user`、失败解释、阻断说明或下一轮 repair

#### Scenario: Prompt 保持普通文本聊天能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明普通聊天、概念解释、能力说明、总结整理、训练原则说明等不需要工具执行的问题仍可直接使用 `final_answer`
- **AND** system message MUST NOT 暗示所有 `final_answer` 都必须引用 tool result

#### Scenario: Prompt 不新增服务端隐藏业务能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺服务端会自动补齐训练动作、自动生成训练编排、自动保存 artifact 或执行未注册 tool
- **AND** system message MUST NOT 要求调用 `generatePlanDraft` 或 `generateRoutineDraft`

### Requirement: 默认 prompt 必须表达 suggestedQuestions 建议提问合同
系统 SHALL 在默认 Agent LLM prompt 中把 `suggestedQuestions` 表达为 `final_answer` 和 `ask_user` 都可使用的全局可选字段。该字段表示用户可直接点击发送的建议提问文本，而不是前端事件、内部 action、tool input 或业务确认结果。

#### Scenario: Prompt 描述 suggestedQuestions 输出格式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `suggestedQuestions` 是可选字符串数组字段
- **AND** system message MUST 说明 `final_answer` 和 `ask_user` 都可以在适合时输出 `suggestedQuestions`
- **AND** system message MUST 说明每条建议提问必须是完整自然语言文本，点击后可作为下一轮用户消息直接发送
- **AND** system message MUST 使用中文描述业务含义
- **AND** `suggestedQuestions`、`final_answer`、`ask_user` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 限制 suggestedQuestions 数量和口吻
- **WHEN** 默认 prompt 描述 `suggestedQuestions`
- **THEN** system message MUST 说明最多输出 3 条建议提问
- **AND** system message MUST 说明每条建议提问必须使用用户口吻，不得写成助手对用户的命令、说明或追问模板
- **AND** system message MUST 说明建议提问不得重复正文内容
- **AND** system message MUST 说明如果当前回复已经自然结束或没有可靠下一步，可以不输出 `suggestedQuestions`

#### Scenario: Prompt 禁止 suggestedQuestions 承诺不可用能力
- **WHEN** 默认 prompt 描述 `suggestedQuestions`
- **THEN** system message MUST 说明建议提问不得承诺未注册 tool、未执行结果、未开放保存能力、医疗诊断或康复处方
- **AND** system message MUST 说明建议提问只是下一轮用户消息候选，不代表服务端已经执行任何操作
- **AND** system message MUST NOT 要求模型固定输出某个业务 `toolName`、固定 action 或固定训练结构

#### Scenario: Prompt 不强制所有回复输出 suggestedQuestions
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 要求每个 `final_answer` 或每个 `ask_user` 都必须包含 `suggestedQuestions`
- **AND** system message MUST 将是否输出建议提问交给模型基于当前可见上下文、tool result、observations 和用户目标判断
- **AND** system message MUST NOT 用固定用户短语或关键词作为输出建议提问的触发条件

### Requirement: 默认 prompt 必须把 routine 和 plan section readiness 表达为 final 前置条件
系统 SHALL 在默认 Agent LLM prompt 中表达：`final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload.kind = "routine"` 或 `"plan"` 只有在当前 run 已具备 `warmup`、`training`、`stretch` 三类可消费动作事实时才允许输出。该合同 SHALL 作为首轮模型可见规则出现，MUST NOT 只依赖 validation failure 或 repair feedback 才表达。

#### Scenario: Prompt 表达 routine 和 plan 的 final 前置条件
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明如果最终输出 `final_answer.visibleOutputs[].payload.kind = "routine"` 或 `"plan"`，当前 run 必须已经具备 `warmup`、`training`、`stretch` 三类当前可消费动作事实
- **AND** system message MUST 说明 `exerciseItems[*].exerciseId` 和 `exerciseItems[*].section` 必须由当前 run 可见动作事实支撑
- **AND** system message MUST 使用中文描述业务含义
- **AND** `final_answer`、`visibleOutputs`、`visibleTrainingProposal`、`payload.kind`、`routine`、`plan`、`exerciseItems`、`exerciseId`、`section`、`warmup`、`training`、`stretch` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 禁止缺 section 时输出 routine 或 plan visibleOutputs
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当当前 run 只有 `training`，或 `missingSectionsForRoutineOrPlan` 非空时，模型不得输出 `final_answer.visibleOutputs[]` 中的 `routine` 或 `plan`
- **AND** system message MUST 说明不得在正文中解释“缺少热身或拉伸”后仍提交不完整的 `routine` 或 `plan`
- **AND** system message MUST 说明这种禁止只约束 `routine` / `plan` 的结构化输出，不阻止模型输出当前事实可支撑的普通解释或 `exercise_selection`

#### Scenario: Prompt 表达缺 section 时的允许下一步
- **WHEN** 默认 prompt 描述 `routine` / `plan` 输出前置条件
- **AND** 当前可见事实不足以支撑 `warmup`、`training`、`stretch` 三类 section
- **THEN** system message MUST 说明模型可以继续调用当前可见且合法的 tool 获取缺失 section 的动作事实
- **AND** system message MUST 说明模型可以使用 `ask_user` 澄清必要约束
- **AND** system message MUST 说明模型可以不输出 `visibleOutputs`，只用正文说明当前事实不足或失败收口
- **AND** system message MUST NOT 要求固定 tool 调用次数、固定 tool 调用顺序或固定业务 `toolName`

#### Scenario: Prompt 不引入服务端生成或旧 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺服务端会自动补齐 `warmup` 或 `stretch` 动作
- **AND** system message MUST NOT 要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏训练生成服务或绕过 `ToolRegistry` 的训练生成能力

