# agent-llm-prompt-configuration Specification

## Purpose
TBD - created by archiving change externalize-agent-llm-prompts. Update Purpose after archive.
## Requirements
### Requirement: LangChain Agent prompt 必须集中配置
系统 SHALL 为 LangChain Agent Runtime 使用的模型可见 prompt 提供独立 builder 或集中配置入口。DeepSeek provider request builder MUST NOT 在供应商请求构造函数中硬编码默认 system prompt 文案。

#### Scenario: 默认 prompt 来自配置模块
- **WHEN** 生产 LangChain runtime 构造 `ChatDeepSeek` 请求
- **THEN** system prompt MUST 来自 `buildLangChainAgentSystemPrompt()` 或等价集中入口
- **AND** provider request builder MUST NOT 在供应商 payload 构造函数中内联默认 prompt 句子
- **AND** prompt 配置 MUST 暴露稳定 `promptVersion` 或等价版本标识

#### Scenario: 测试注入自定义 prompt 配置
- **WHEN** 测试或后续 adapter 构造显式传入自定义 prompt 配置
- **THEN** 模型请求体 MUST 使用该配置生成 system message
- **AND** 默认配置 MUST 不被测试用自定义配置全局污染

### Requirement: Prompt 配置必须保持模型供应商边界
系统 SHALL 将 prompt 内容配置与模型供应商协议解耦。LangChain tool wrapper、业务 validator 和 response adapter MUST NOT 依赖 DeepSeek message 格式、DeepSeek endpoint、API key 或供应商响应结构。

#### Scenario: 业务 tool wrapper 保持供应商无关
- **WHEN** LangChain runtime 调用业务 tool wrapper
- **THEN** tool wrapper MUST 只接收已校验 tool input、actor context 和 AbortSignal
- **AND** tool wrapper MUST NOT 导入 Agent prompt builder
- **AND** tool wrapper MUST NOT 构造 DeepSeek/OpenAI/Anthropic 等供应商请求 messages

#### Scenario: Model factory 只负责供应商模型构造
- **WHEN** `createLangChainDeepSeekModel()` 或等价 model factory 构造生产模型
- **THEN** model factory MAY 将集中配置映射为 `ChatDeepSeek`
- **AND** model factory MUST NOT 注册 tool、执行 tool、投影用户事件或修改 runtime 校验结果

### Requirement: 默认 prompt 必须只描述通用 LangChain Agent 合同
系统 SHALL 将默认 LangChain Agent system prompt 限定为通用决策合同、provider tool calling、structured final response、grounding、安全边界和不可执行能力边界。默认 system prompt MUST NOT 承载具体业务 output type 的完整 payload 规则、业务 examples、固定 tool 调用流程、动作库、训练生成、保存、用户记忆或业务语义分流规则。

#### Scenario: 默认 prompt 描述允许的 LangChain 输出方式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 明确模型通过 DeepSeek native `tool_calls` 请求工具
- **AND** system message MUST 明确成功终态通过 `fitmate_final_response` 结构化工具提交
- **AND** system message MUST 禁止模型输出旧自定义 `AgentAction` JSON、直接执行 tool、伪造 confirmation/hash、泄漏 secret 或输出 NDJSON event

#### Scenario: 默认 prompt 不包含业务输出完整规则
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 system prompt MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构说明、`routine` / `plan` section coverage 细则、`prescription` / `schedule` 细则、业务 examples 或具体业务 toolName 的恢复流程说明
- **AND** 默认 system prompt MAY 简短说明模型在提交训练卡片、routine 或 plan 时必须通过当前 tool catalog 中的结构化收口工具和服务端 validator
- **AND** 具体业务能力和业务输出结构的模型可见说明 MUST 来自 LangChain tool description、schema description、tool result summary、受控业务事实摘要或失败反馈
- **AND** 默认 system prompt MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 action、toolName、outputType 或 payload kind

### Requirement: Prompt 配置不得改变 /api/chat 业务行为
系统 SHALL 在抽离 prompt 配置时保持当前 `/api/chat` 文本聊天能力边界。该 change MUST NOT 修改 `/api/chat` 外部请求 schema、前端事件合同、业务 tool 注册或用户可见训练业务能力。

#### Scenario: /api/chat 仍使用当前文本聊天链路
- **WHEN** prompt 配置抽离完成
- **THEN** `/api/chat` MUST 仍通过 `PreparedChatRequest -> LangChain agent messages -> production LangChain tool catalog -> runLangChainAgentRuntime -> production response adapter` 或等价链路执行
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
- **AND** 文档 MUST 说明业务能力说明应来自 LangChain tool description、schema description、tool result summary 或受控业务事实投影，而不是混入通用默认 prompt

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 通过 LangChain tool description、schema description、tool result summary 或等价模型可见输入表达 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。该能力 MUST 由 `submitVisibleTrainingProposal` 等结构化收口 tool 的 schema / description 或等价说明承载；默认 system prompt 只负责要求模型遵守当前可见工具和服务端 validator。模型可见合同 MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: 模型可见合同描述结构能力
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** 模型可见输入 MUST 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** 该说明 MUST 位于结构化收口 tool description、schema description 或等价模型可见说明中
- **AND** 该说明 MUST 表达每种结构对应的必需字段和服务端校验边界
- **AND** 该说明 MUST 表达模型应根据用户目标、上下文、已获得事实和 tool result 自主选择输出结构
- **AND** 该说明 MUST NOT 写入“用户说某个固定词语就必须输出某个 kind”的规则

#### Scenario: 模型可见合同表达事实来源边界
- **WHEN** 模型可见输入描述 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** 说明 MUST 表达动作 id 应来自当前 run 可见且可消费的动作事实来源，或当前用户可访问的 `visible_training_proposal_fact`
- **AND** 说明 MUST 表达服务端会在渲染和保存前复核数据库事实
- **AND** 说明 MUST NOT 要求模型复写完整动作详情
- **AND** 默认 system prompt MUST NOT 承载这类业务字段的完整来源规则

#### Scenario: Prompt 不引入旧式 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺或要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 承诺或要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 LangChain tool catalog 的训练生成能力

### Requirement: 模型可见合同必须表达 visibleTrainingProposal 的动作 section 事实来源
系统 SHALL 在生产模型可见的 tool description、schema description、tool result summary、失败反馈或等价合同说明中表达 `visibleTrainingProposal.exerciseItems[*]` 的动作事实边界。说明 MUST 表达 `exerciseId` 和 `section` 需要由当前 run 可见动作事实支撑，`allowedSections` 表示该动作可进入哪些 section。该说明 MUST NOT 把具体业务 tool 的调用顺序写成通用 Agent system prompt 规则。

#### Scenario: structured finalization tool 表达 allowedSections 合同
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** 模型可见输入 MUST 包含 `visibleTrainingProposal.exerciseItems[*]` 与动作事实的合同说明
- **AND** 该说明 SHOULD 位于 `visibleTrainingProposal` output contract 的 `groundingRequirements`、`schemaSummary` 或等价字段中
- **AND** 模型可见输入 MUST 表达 `allowedSections` 是校验 `exerciseItems[*].section` 的确定性动作事实字段
- **AND** 模型可见输入 MUST 使用中文描述业务含义
- **AND** 模型可见输入 MUST 保持 `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`allowedSections` 等技术标识英文原样

#### Scenario: 通用 prompt 不写具体 tool 恢复流程
- **WHEN** 默认 Agent LLM prompt 配置生成 system message
- **THEN** system message MUST NOT 包含要求模型在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支
- **AND** 具体 tool 能力、`groups.<section>` 语义和 output 说明 MUST 由对应 tool description、schema description、examples、tool result summary 或业务 output contract 表达

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
- **THEN** `/api/chat`、LangChain runtime、validator、policy / confirmation、tool handler 和 response adapter MUST NOT 新增基于用户原文短语的条件分支
- **AND** 系统 MUST NOT 根据用户原文把请求改写成固定 `toolName`、固定 action、固定 `payload.kind` 或固定 final answer

#### Scenario: 具体业务名只作为局部说明或测试样例
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 或 `searchExerciseResources`
- **THEN** 这些业务名 MUST 只出现在对应 tool description、schema description、tool result summary、业务事实合同、spec 或回归测试中
- **AND** 通用 prompt MUST NOT 把这些业务名写成语义触发条件或固定 tool 调用流程

### Requirement: Agent LLM prompt 配置必须迁移到服务端集中配置目录
系统 SHALL 将生产 LangChain Agent 使用的 prompt builder 或等价 prompt 配置集中管理，并与 Agent runtime TS config 保持清晰边界。迁移 MUST 保持现有模型可见合同含义、版本标识、请求默认值和测试注入能力。

#### Scenario: 默认 prompt 配置入口位于 lib/server/config
- **WHEN** 开发者查看生产 Agent LLM prompt 配置入口
- **THEN** 当前默认入口 MUST 位于 `lib/server/config/` 下
- **AND** 旧 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts` MUST 被删除或改为不承载生产默认内容的短期 re-export
- **AND** 若保留短期 re-export，tasks MUST 明确清理条件和测试覆盖

#### Scenario: Adapter 继续消费 prompt 配置而不内联 prompt
- **WHEN** LangChain runtime 构造 system prompt
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
- **THEN** system message MUST 允许模型按新目标自主选择直接回答、provider tool call 或结构化失败收口
- **AND** system message MUST 要求模型在 content 中避免把独立生成描述成对不可见已有对象的继续、替换、刷新或调整
- **AND** system message MUST NOT 要求固定调用某个业务 tool、固定输出某个 `payload.kind` 或固定引用某个 tool result / resource

### Requirement: 引用目标合同不得引入服务端语义分流
系统 SHALL 保持 `/api/chat`、Agent runtime、validator、tool handler 和 renderer 的语义中立。模型自然语言理解、引用对象判断和最终回复策略 SHALL 继续由模型基于可见输入推理完成。

#### Scenario: 服务端不识别固定用户短语或字段组合
- **WHEN** 实现本 change
- **THEN** `/api/chat`、LangChain runtime、validator、policy / confirmation、tool handler 和 response adapter MUST NOT 新增基于 `换一批`、`再来一组`、`重新来一套` 或等价用户原文短语的条件分支
- **AND** 系统 MUST NOT 根据用户原文、具体 `toolName`、`facts=[]`、`factCount = 0` 或同类字段组合把请求改写成固定 action、固定 tool 调用或固定 final answer

#### Scenario: 具体业务名只作为局部说明或测试样例
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 或 `searchExerciseResources`
- **THEN** 这些具体业务名 MUST 只出现在对应 tool description、schema description、tool result summary、业务事实合同、spec 或回归测试中
- **AND** 通用 Agent prompt MUST NOT 把这些业务名写成语义触发条件或固定 tool 调用流程

### Requirement: 默认 prompt 必须表达 LangChain 输出合同
系统 SHALL 在默认 LangChain Agent system prompt 中表达当前生产输出合同：模型通过 DeepSeek native `tool_calls` 请求工具，通过 `fitmate_final_response` 结构化终态提交最终正文和建议提问。系统 MUST NOT 要求模型输出旧自定义 action JSON、旧 terminal action、旧 grounding 引用字段或 NDJSON event。

#### Scenario: Prompt 描述当前允许的输出方式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明需要工具事实时使用 provider native `tool_calls`
- **AND** system message MUST 说明最终用户可见正文必须通过 `fitmate_final_response.content` 提交
- **AND** system message MUST 说明建议提问必须通过 `fitmate_final_response.suggestedQuestions` 提交
- **AND** system message MUST 禁止模型输出未注册工具、伪造工具执行结果、伪造确认状态、泄漏 secret 或直接输出 NDJSON event

#### Scenario: Prompt 不恢复旧 action JSON
- **WHEN** 开发者查看默认 prompt、tool description、schema description 或 repair feedback
- **THEN** 模型可见说明 MUST NOT 训练模型输出旧 `type/toolName/input/final_answer/ask_user` action object
- **AND** 模型可见说明 MUST NOT 要求模型复制 `usedRefs`、`toolResultId`、`resourceId`、`factRef`、`messageId` 或 trace id
- **AND** 若示例涉及工具调用，示例 MUST 匹配 LangChain / provider tool input 或 `fitmate_final_response` input

### Requirement: 模型可见说明必须表达服务端 provenance 边界
系统 SHALL 将 tool execution、trace、validated visible output、history fact provenance 和用户可见投影作为服务端内部事实边界维护。模型可见内容 MAY 使用脱敏业务事实、数据库业务 id 和工具摘要帮助推理，但 MUST NOT 把内部引用 id 变成模型需要输出、复制或修复的合同。

#### Scenario: 工具结果摘要使用业务事实
- **WHEN** LangChain tool wrapper 将工具结果返回给模型
- **THEN** `toModelVisibleSummary` MUST 保留模型继续推理需要的业务事实、成功/失败状态、约束和可恢复诊断
- **AND** 模型可见摘要 MUST NOT 要求模型在最终回答中复制 `toolCallId`、trace id 或服务端内部引用 id
- **AND** trace MAY 记录内部执行 id，但这些 id MUST 留在服务端 trace / metadata 中

#### Scenario: history facts projection 不暴露源业务引用
- **WHEN** 当前会话历史 `visibleTrainingProposal` 事实进入模型可见输入
- **THEN** projection MUST 使用受控压缩业务事实表达 `proposalKind`、section 摘要、`exerciseItems`、`prescription`、`schedule` 和必要动作详情
- **AND** projection MUST NOT 暴露 `factRef`、`messageId`、`resourceId` 或 `toolResultId`
- **AND** projection MUST 表达这些事实来自当前 actor 和 conversation 可访问边界，但不要求模型输出来源 ID

### Requirement: `fitmate_final_response` 必须表达最终文本合同
系统 SHALL 将 `fitmate_final_response` 作为 LangChain 结构化终态工具。该终态工具只承载用户可见正文和可选建议提问；结构化训练卡片、routine 或 plan MUST 先通过 `submitVisibleTrainingProposal` 等业务 tool 完成服务端校验和投影。

#### Scenario: 最终正文不触发后续工具
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `fitmate_final_response.content` 是本轮回复的最终正文
- **AND** system message MUST 说明提交终态后 runtime 不会继续自动调用工具
- **AND** system message MUST 说明模型不得用最终正文承诺尚未执行的查询、生成、保存、等待或后续内部动作

#### Scenario: 普通文本聊天仍可直接收口
- **WHEN** 用户请求是普通解释、总结、能力说明、训练原则说明或其他不需要工具且模型能可靠回答的问题
- **THEN** prompt MUST 允许模型直接提交 `fitmate_final_response`
- **AND** prompt MUST NOT 暗示所有最终回答都必须先调用工具

#### Scenario: 缺少必要信息时自然澄清
- **WHEN** 当前可见信息不足以可靠回答或生成可校验结构化输出
- **THEN** prompt MUST 引导模型在 `content` 中直接提出一个清晰问题或说明缺少的上下文
- **AND** prompt MUST NOT 要求输出旧 `ask_user` action

### Requirement: 默认 prompt 必须表达 suggestedQuestions 建议提问合同
系统 SHALL 在默认 LangChain Agent prompt 和 `fitmate_final_response` schema description 中把 `suggestedQuestions` 表达为全局可选字段。该字段表示用户可直接点击发送的下一轮自然语言消息，而不是前端事件、内部 action、tool input、确认结果或已执行动作。

#### Scenario: Prompt 描述 suggestedQuestions 输出格式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `suggestedQuestions` 是 `fitmate_final_response` 的可选字符串数组字段
- **AND** system message MUST 说明每条建议提问必须是完整自然语言文本，点击后可作为下一轮用户消息直接发送
- **AND** system message MUST 使用中文描述业务含义
- **AND** `suggestedQuestions`、`fitmate_final_response`、`content` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 限制 suggestedQuestions 数量和口吻
- **WHEN** 默认 prompt 描述 `suggestedQuestions`
- **THEN** system message MUST 说明最多输出 3 条建议提问
- **AND** system message MUST 说明每条建议提问必须使用用户口吻，不得写成助手对用户的命令、说明或追问模板
- **AND** system message MUST 说明建议提问不得重复正文内容
- **AND** system message MUST 说明如果当前回复已经自然结束或没有可靠下一步，可以省略 `suggestedQuestions`

#### Scenario: Prompt 禁止 suggestedQuestions 承诺不可用能力
- **WHEN** 默认 prompt 描述 `suggestedQuestions`
- **THEN** system message MUST 说明建议提问不得承诺未注册 tool、未执行结果、未开放保存能力、医疗诊断或康复处方
- **AND** system message MUST 说明建议提问只是下一轮用户消息候选，不代表服务端已经执行任何操作
- **AND** system message MUST NOT 要求模型固定输出某个业务 `toolName`、固定工具调用或固定训练结构

### Requirement: visibleTrainingProposal 结构化交付必须走业务 tool
系统 SHALL 通过 `submitVisibleTrainingProposal` 或等价 LangChain business tool 提交 `visibleTrainingProposal` 结构，并由服务端 validator、renderer 和 response adapter 生成用户可见投影。默认 final response schema MUST NOT 重新承载结构化训练 payload。

#### Scenario: structured finalization tool 表达训练输出结构
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** `submitVisibleTrainingProposal` 的 description / schema description MUST 说明 `outputType`、`schemaVersion` 和 `payload` 的业务含义
- **AND** 说明 MUST 表达 `payload.kind = "exercise_selection" | "routine" | "plan"` 的结构能力和服务端校验边界
- **AND** 说明 MUST 表达 `exerciseItems[*].exerciseId` 必须来自当前可见且可消费的数据库动作事实
- **AND** 说明 MUST 使用中文描述业务含义，技术标识保持英文原样

#### Scenario: tool accepted 后最终回答可以引用卡片
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "accepted"`
- **THEN** model-visible summary MUST 明确该结构已经通过服务端校验
- **AND** user projection MUST 通过 `validatedVisibleOutputs` 或等价投影把可见训练卡片交给 response adapter
- **AND** 最终 `fitmate_final_response.content` MAY 引用这张已验证训练卡片，但 MUST NOT 重新输出未校验 JSON payload

#### Scenario: tool rejected 不得伪装成功
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "rejected"`
- **THEN** model-visible summary MUST 明确不要把该结构当作已生成卡片
- **AND** 模型 MAY 修正结构后重新调用工具，或通过 `fitmate_final_response.content` 说明无法生成并给出可恢复下一步
- **AND** 模型 MUST NOT 声称已展示、已保存或已生成训练卡片

### Requirement: recentVisibleTrainingProposals 必须保持非引用边界
系统 SHALL 在默认 prompt 或当前上下文摘要中说明 `run.metadata.recentVisibleTrainingProposals` 只是不含可操作内部引用 id 的最近可见训练方案状态摘要。该 metadata MUST NOT 被描述为可直接复制的 tool input、`exerciseId` 来源或最终 grounding 来源。

#### Scenario: metadata 不能作为工具输入引用
- **WHEN** 默认 prompt 配置生成 system message 或服务端上下文摘要
- **THEN** 模型可见说明 MUST 表达 `run.metadata.recentVisibleTrainingProposals` 不包含可复制的 `factRef/messageId/resourceId/toolResultId`
- **AND** 若需要读取可操作的历史训练方案事实，模型 MUST 通过当前 tool catalog 中注册的读取或检查工具获取服务端返回的可消费业务事实
- **AND** metadata 本身 MUST NOT 被当作 `exerciseId` 来源或成功训练方案事实源

### Requirement: 默认 Agent LLM prompt 必须按规则层级收敛
系统 SHALL 在默认 LangChain Agent system prompt 中保留跨 tool 必须首轮可见的通用合同，并压缩或移出只属于单个业务 tool 的操作细节。收敛后的 prompt MUST 保持模型理解 provider tool calling、structured final response、训练结构化收口前置条件、引用对象推理和医疗安全边界的能力。

#### Scenario: system prompt 保留通用终态合同
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达 provider native `tool_calls`、`fitmate_final_response.content` 和 `suggestedQuestions` 的主合同
- **AND** system message MUST 表达最终正文不能替代服务端已校验结构化训练输出
- **AND** system message MUST 表达需要当前工具事实时只能使用当前 LangChain tool catalog
- **AND** system message MUST 表达工具失败、空结果或 diagnostic 摘要不能伪装成成功事实

#### Scenario: system prompt 不重复单个 tool 的操作细节
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 展开 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 或 `submitVisibleTrainingProposal` 的完整操作细节
- **AND** system message MUST NOT 把任意业务 `toolName`、operation、字段组合或用户短语写成固定 tool 调用流程
- **AND** 单个业务 tool 的字段、operation、投影和 examples MUST 由对应 tool description、schema description、tool result summary 或 repair feedback 表达

#### Scenario: system prompt 保留少量关键结构例子
- **WHEN** 默认 prompt 提供示例
- **THEN** 示例 MUST 只说明当前 provider tool input 或 `fitmate_final_response` 的结构形状和事实来源边界
- **AND** 示例 MUST NOT 包含可被模型照抄的 fake `toolResultId`、fake `resourceId`、fake `factRef` 或 fake `messageId`
- **AND** 示例 MUST NOT 把固定用户短语映射为固定 `payload.kind`

### Requirement: 默认 Agent LLM prompt 优化必须保留模型自主规划边界
系统 SHALL 在 prompt 优化后继续让模型基于当前可见 `messages`、server context summary、registered tools、ToolMessage summary 和 metadata 自主选择是否调用工具、调用哪个工具、如何填充 tool input 以及何时用 `fitmate_final_response` 收口。Prompt 优化 MUST NOT 引入服务端语义分流，也 MUST NOT 通过删除规则让模型缺少必要事实判断依据。

#### Scenario: prompt 优化不引入服务端语义规则
- **WHEN** 实现 prompt 相关 change
- **THEN** `/api/chat`、LangChain runtime、tool wrapper、validator、response adapter 和 finalizer MUST NOT 新增基于用户原文关键词、正则、同义词表或短句模板的分支
- **AND** 系统 MUST NOT 根据用户原文替模型选择 `toolName`、tool input、`payload.kind` 或 final response 策略

#### Scenario: prompt 优化后仍覆盖相邻训练输出结构
- **WHEN** 模型可见说明描述 `visibleTrainingProposal.payload.kind`
- **THEN** 说明 MUST 继续区分 `exercise_selection`、`routine` 和 `plan` 的结构能力
- **AND** 说明 MUST 继续表达模型应根据完整用户目标、上下文和当前可见事实自主选择结构
- **AND** 说明 MUST 继续表达 `plan` 优先覆盖多天、周期、频次或训练日 / 休息日安排
- **AND** 说明 MUST 继续表达不能因为当前 run 先拿到 `training` 动作事实就把应为 `routine` 或 `plan` 的目标降级成 `exercise_selection`

#### Scenario: prompt 优化必须可测试
- **WHEN** prompt change 完成实现
- **THEN** 自动化测试 SHOULD 验证默认 system prompt 包含 provider tool calling、`fitmate_final_response`、`suggestedQuestions`、结构化训练输出校验和 routine / plan section coverage 边界
- **AND** 测试 MUST 验证 system prompt 不包含固定用户短语路由或业务 tool 强制流程
- **AND** 测试 MUST 避免依赖长句逐字匹配，优先验证关键字段、结构和边界是否存在

### Requirement: Terminal failure finalizer prompt 必须集中配置
系统 SHALL 为 terminal failure finalizer 提供独立模型可见 prompt 配置。该 prompt MUST 位于服务端集中配置入口，MUST 与主 LangChain Agent system prompt 区分，MUST 使用中文描述业务边界，MUST 保持技术标识英文原样。

#### Scenario: finalizer system prompt 来自配置模块
- **WHEN** terminal failure finalizer 构造模型请求
- **THEN** system message MUST 来自 `lib/server/config/` 下的 finalizer prompt 配置或等价集中入口
- **AND** finalizer adapter MUST NOT 在供应商请求构造函数中内联默认 prompt 句子
- **AND** prompt 配置 MUST 暴露稳定版本标识，例如 `promptVersion`

#### Scenario: finalizer prompt 与主 Agent prompt 分离
- **WHEN** 开发者查看 finalizer prompt 配置
- **THEN** finalizer prompt MUST NOT 复用主 Agent 的完整 tool loop 指令
- **AND** finalizer prompt MUST NOT 描述 provider `tool_calls` 作为可用输出
- **AND** finalizer prompt MUST 明确本阶段只生成失败解释和下一步建议问题

### Requirement: finalizer prompt 必须严格说明本轮未满足需求
terminal failure finalizer system prompt SHALL 明确告知模型：主 LangChain Agent 已经耗尽内部修复机会，本轮没有满足用户需求，模型不得声称已完成或继续执行。该说明 MUST 是模型实际可见输入的一部分。

#### Scenario: prompt 禁止成功承诺
- **WHEN** finalizer system prompt 被构造
- **THEN** prompt MUST 明确“本轮没有满足用户需求”或等价语义
- **AND** prompt MUST 禁止模型声称已生成、已保存、已查询、已确认、已执行或已展示未发生的业务结果
- **AND** prompt MUST 禁止输出训练卡片、JSON payload、NDJSON event 或 provider `tool_calls`

#### Scenario: prompt 限制建议问题
- **WHEN** finalizer system prompt 描述 `suggestedQuestions`
- **THEN** prompt MUST 说明建议问题最多 3 条
- **AND** prompt MUST 说明每条建议问题必须是用户口吻的完整自然语言问题
- **AND** prompt MUST 说明建议问题只是下一轮用户消息候选，不代表服务端已经执行任何操作
- **AND** prompt MUST 禁止建议问题承诺不可用能力、医疗诊断、保存结果或未注册 tool

### Requirement: finalizer 模型输入必须使用结构化失败摘要
系统 SHALL 让 terminal failure finalizer 的 user message 使用结构化 JSON 摘要，而不是直接复制主 Agent prompt、完整 conversation payload 或完整 tool result output。该摘要 MUST 让模型理解失败原因和可恢复方向，同时避免泄漏内部实现。

#### Scenario: user message 包含失败摘要
- **WHEN** finalizer 构造 user message
- **THEN** user message MUST 包含主 Agent failure category、稳定错误 code、用户目标摘要、未满足要求摘要和允许回复模式
- **AND** user message MUST 包含已验证事实的脱敏摘要
- **AND** user message MUST 使用中文描述业务含义
- **AND** `failureCategory`、`suggestedQuestions`、`validatedVisibleOutputs` 等技术标识 MUST 保持英文原样

#### Scenario: user message 不复制主 Agent 可执行上下文
- **WHEN** finalizer 构造 user message
- **THEN** user message MUST NOT 包含完整 tool description / schema
- **AND** user message MUST NOT 包含完整 LangChain message state
- **AND** user message MUST NOT 包含完整 raw tool output
- **AND** user message MUST NOT 包含服务端根据用户原文关键词或 phrasing 生成的业务意图

### Requirement: finalizer 输出 schema 必须独立于主 Agent 结构化终态
系统 SHALL 为 terminal failure finalizer 输出定义独立 schema。该 schema MUST 只允许 `content` 和可选 `suggestedQuestions`，MUST NOT 与主 LangChain runtime 的工具调用、业务 tool input 或 `fitmate_final_response` schema 混用。

#### Scenario: output schema 只允许失败回复字段
- **WHEN** finalizer 返回模型输出
- **THEN** 系统 MUST 使用独立 schema 校验输出
- **AND** schema MUST 要求 `content` 为非空字符串
- **AND** schema MUST 允许 `suggestedQuestions` 为最多 3 条字符串
- **AND** schema MUST 拒绝 `toolName`、`input`、`validatedVisibleOutputs`、`tool_calls` 或任意业务 tool input 字段

#### Scenario: 输出校验失败不进入 repair
- **WHEN** finalizer 输出 schema 校验失败
- **THEN** 系统 MUST 不再向模型发送 repair prompt
- **AND** production adapter MUST 使用确定性 fallback
- **AND** trace MUST 记录 finalizer 输出校验失败

### Requirement: LangChain DeepSeek model factory 必须消费 thinkingEnabled 构造 Thinking 请求
系统 SHALL 将首页聊天请求中的 `thinkingEnabled` 传递到生产 LangChain DeepSeek model factory 或等价 provider request builder，并映射为 DeepSeek Thinking Mode 请求参数。该映射 MUST 保持在供应商 model factory、配置或 provider request builder 边界内。

#### Scenario: 开启思考模式
- **WHEN** `/api/chat` 请求中 `thinkingEnabled` 为 `true` 或省略后被服务端默认视为开启
- **THEN** `createLangChainDeepSeekModel()` 或等价 provider builder 构造的 DeepSeek 请求配置 MUST 包含 `thinking.type = "enabled"` 或供应商 SDK 当前等价参数
- **AND** 请求配置 MUST 包含集中配置指定的 `reasoning_effort` 或当前 SDK 等价参数
- **AND** 模型可见 prompt 仍 MUST 要求使用 provider native `tool_calls` 和 `fitmate_final_response`

#### Scenario: 关闭思考模式
- **WHEN** `/api/chat` 请求中 `thinkingEnabled` 为 `false`
- **THEN** `createLangChainDeepSeekModel()` 或等价 provider builder 构造的 DeepSeek 请求配置 MUST 包含 `thinking.type = "disabled"` 或供应商 SDK 当前等价参数
- **AND** builder MUST NOT 因 DeepSeek 默认开启 Thinking Mode 而省略 disabled 请求参数

#### Scenario: Thinking Mode 不改变 LangChain 执行合同
- **WHEN** Thinking Mode 开启或关闭
- **THEN** LangChain runtime MUST 继续通过 provider native `tool_calls` 执行注册工具
- **AND** LangChain runtime MUST 继续通过 `toolStrategy` / `fitmate_final_response` 获取结构化最终回答
- **AND** Thinking Mode MUST NOT 引入旧自定义 action JSON 作为生产工具调用合同

#### Scenario: tool wrapper 保持供应商无关
- **WHEN** 实现 Thinking Mode 请求映射
- **THEN** LangChain tool wrapper、业务 validator 和 response adapter MUST NOT 导入 DeepSeek Thinking Mode 类型、DeepSeek request body、`reasoning_content` 或供应商响应结构
- **AND** Thinking Mode 专有字段 MUST 只存在于 provider model factory、配置、trace projection 或生产装配层

### Requirement: reasoning_content 必须作为受控诊断而非用户可见回复处理
系统 SHALL 支持读取 DeepSeek 响应中的 `reasoning_content` 或 LangChain 暴露的等价 reasoning metadata，但当前用户可见聊天响应 MUST NOT 展示原始 reasoning 内容。系统 MUST 保留后续受控展示 reasoning 的扩展边界。

#### Scenario: 响应解析保留 reasoning 诊断
- **WHEN** DeepSeek 响应或 LangChain message metadata 包含 reasoning 内容
- **THEN** provider adapter / trace projection MAY 记录受控诊断摘要
- **AND** runtime MUST 继续以 provider tool calls、ToolMessage 和 structured response 为执行来源
- **AND** `reasoning_content` MUST NOT 被拼接进用户可见 `content` 或当作 tool input / final response schema 解析来源

#### Scenario: 当前不向前端展示 reasoning 原文
- **WHEN** `/api/chat` 返回用户可见 NDJSON
- **THEN** 系统 MUST NOT 新增展示原始 `reasoning_content` 的用户可见事件
- **AND** 系统 MUST NOT 将原始 `reasoning_content` 保存为 chat history 中的 assistant content
- **AND** 后续若要展示 reasoning MUST 通过独立 change 定义前端事件、存储、脱敏和关闭策略

### Requirement: 模型可见输入不得暴露可操作内部引用 ID
系统 SHALL 将 LangChain messages、ToolMessage summary、server context summary、history fact 摘要和 compressed tool results 投影为模型可消费的业务事实。模型可见内容 MAY 包含业务对象的稳定标识，例如数据库 `exerciseId`；MUST NOT 暴露可被模型复制到工具输入或最终回答的内部 `toolResultId`、`resourceId`、`factRef`、`messageId` 或 trace id。

#### Scenario: tool summary 使用业务事实而非引用操作
- **WHEN** tool wrapper 生成 model-visible summary
- **THEN** summary MUST 保留模型判断下一步所需的业务事实、成功/失败状态、约束和诊断摘要
- **AND** summary MUST NOT 要求模型在后续 tool input 或 final response 中引用内部 `toolResultId`
- **AND** 如 trace 仍记录 `toolResultId`，该字段 MUST 留在 trace / server metadata，不作为模型输出合同的一部分

### Requirement: LangChain 模型可见合同必须描述 native Tool Calling 边界
系统 SHALL 将生产模型可见合同迁移为 LangChain agent prompt、DeepSeek native Tool Calling tools、tool schema description、tool result summary 和结构化终态说明。模型可见合同 MUST NOT 要求模型输出旧 `AgentAction` JSON。

#### Scenario: 构造 LangChain system prompt
- **WHEN** 生产 `/api/chat` 构造 LangChain agent
- **THEN** system prompt MUST 使用中文说明 AI 健身助手角色、非医疗边界、tool calling 规则、能力边界和终态回答要求
- **AND** prompt MUST NOT 要求模型输出 `{ "type": "tool_call" }`、`final_answer` 或 `ask_user` 旧 action JSON
- **AND** prompt MUST NOT 描述旧 `AgentAction`、旧 `ToolRegistry`、旧 `PlannerPort` 或旧 Response Renderer

#### Scenario: 构造 DeepSeek tools
- **WHEN** LangChain model request 暴露生产 tools
- **THEN** 每个 tool 的 `description`、schema description 和 examples 中的描述性自然语言 MUST 默认使用中文
- **AND** `toolName`、字段名、枚举值、resource type、provider 字段和代码标识 MUST 保持英文原样
- **AND** tool description MUST 描述稳定能力边界、输入来源、输出事实含义和 grounding 方式
- **AND** tool description MUST NOT 写用户关键词、短句模板或 phrasing 触发规则

### Requirement: LangChain prompt 必须保留服务端确定性边界
系统 SHALL 在模型可见说明中表达：模型负责自然语言理解和 tool calling 决策，服务端负责 schema、权限、数据库事实、policy、结构化输出和 response projection 校验。

#### Scenario: 模型可见服务端边界
- **WHEN** LangChain agent prompt 被构造
- **THEN** prompt MUST 说明工具调用只是请求执行工具，不代表工具已执行成功
- **AND** prompt MUST 说明工具结果和结构化输出会被服务端校验
- **AND** prompt MUST 说明模型不得伪造工具结果、数据库事实、保存结果或确认状态
- **AND** prompt MUST 说明需要当前 tools 未注册的能力时不得承诺已执行

#### Scenario: 结构化训练输出说明
- **WHEN** 模型可见输入描述训练方案、动作推荐、routine 或 plan 输出
- **THEN** 说明 MUST 表达结构化输出必须来自当前可见事实和可消费 tool result
- **AND** 说明 MUST 表达 `exerciseId` 必须来自数据库事实或服务端可校验来源
- **AND** 说明 MUST 表达服务端会在渲染或保存前校验输出
- **AND** 说明 MUST NOT 通过固定用户短语规定 payload kind、tool 调用顺序或输出策略

### Requirement: Prompt 迁移不得引入服务端语义分流
系统 SHALL 保持语义判断由模型基于可见 prompt、messages、tool descriptions 和 tool results 完成。服务端 route、runtime、tool wrapper、validator 和 response adapter MUST NOT 基于用户原文关键词改写模型决策。

#### Scenario: 用户请求训练业务
- **WHEN** 用户要求推荐动作、生成训练、调整计划、保存内容或引用上一轮结果
- **THEN** 模型 MAY 基于 LangChain prompt 和 tools 自主选择 tool call、回答或澄清
- **AND** 服务端 MUST NOT 根据用户原文固定选择 tool、固定输出结构或固定回复策略
- **AND** 具体业务名只可出现在对应 tool description、schema、observation / tool result summary、spec 或测试样例中
