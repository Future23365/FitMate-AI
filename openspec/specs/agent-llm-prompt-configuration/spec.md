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
系统 SHALL 将默认 Agent LLM system prompt 限定为通用决策合同、输出格式、grounding、安全边界和不可执行能力边界。默认 system prompt MUST NOT 承载具体业务 output type 的完整 payload 规则、业务 examples、固定 tool 调用流程、动作库、训练生成、保存、用户记忆或业务语义分流规则。

#### Scenario: 默认 prompt 描述允许的 AgentAction
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 要求模型只返回一个 JSON object
- **AND** system message MUST 要求输出匹配 `AgentAction`
- **AND** system message MUST 明确允许的 `type` 为 `tool_call`、`final_answer`、`ask_user`
- **AND** system message MUST 禁止模型直接执行 tool、伪造 confirmation/hash、泄漏 secret 或输出 NDJSON event

#### Scenario: 默认 prompt 不包含业务输出完整规则
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 system prompt MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构说明、`routine` / `plan` section coverage 细则、`prescription` / `schedule` 细则、业务 examples 或具体业务 toolName 的恢复流程说明
- **AND** 默认 system prompt MAY 简短说明模型在输出 `visibleOutputs[]` 时必须遵守当前模型可见 `outputContracts[]`
- **AND** 具体业务能力和业务输出结构的模型可见说明 MUST 来自 `outputContracts`、业务 tool manifest、resource contract、projection、observation 或 repair feedback
- **AND** 默认 system prompt MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 action、toolName、outputType 或 payload kind

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
系统 SHALL 通过 Planner 模型可见输入表达 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。该能力 MUST 由 `outputContracts` 或等价 schema summary 承载；默认 system prompt 只负责要求模型遵守当前可见 output contract。模型可见合同 MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: 模型可见合同描述结构能力
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** 模型可见输入 MUST 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** 该说明 MUST 位于 `outputContracts` 或等价 schema summary 中
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
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 `ToolRegistry` 的训练生成能力

### Requirement: 模型可见合同必须表达 visibleTrainingProposal 的动作 section 事实来源
系统 SHALL 在生产 Planner 可见的 `outputContracts`、tool manifest、observation、repair feedback 或等价合同说明中表达 `visibleTrainingProposal.exerciseItems[*]` 的动作事实边界。说明 MUST 表达 `exerciseId` 和 `section` 需要由当前 run 可见动作事实支撑，`allowedSections` 表示该动作可进入哪些 section。该说明 MUST NOT 把具体业务 tool 的调用顺序写成通用 Agent system prompt 规则。

#### Scenario: outputContracts 表达 allowedSections 合同
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** 模型可见输入 MUST 包含 `visibleTrainingProposal.exerciseItems[*]` 与动作事实的合同说明
- **AND** 该说明 SHOULD 位于 `visibleTrainingProposal` output contract 的 `groundingRequirements`、`schemaSummary` 或等价字段中
- **AND** 模型可见输入 MUST 表达 `allowedSections` 是校验 `exerciseItems[*].section` 的确定性动作事实字段
- **AND** 模型可见输入 MUST 使用中文描述业务含义
- **AND** 模型可见输入 MUST 保持 `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`allowedSections` 等技术标识英文原样

#### Scenario: 通用 prompt 不写具体 tool 恢复流程
- **WHEN** 默认 Agent LLM prompt 配置生成 system message
- **THEN** system message MUST NOT 包含要求 Planner 在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支
- **AND** 具体 tool 能力、`groups.<section>` 语义和 output 说明 MUST 由对应 tool manifest、schema description、examples、observation projection 或 output contract 表达

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
系统 SHALL 在默认 Agent LLM prompt、`actionContract` 或等价模型可见输入中，用短 JSON 形状表达当前允许的 `AgentAction` 类型和字段。该形状 MUST 与 Planner 可见 schema 一致，并 MUST NOT 要求模型输出内部 grounding、tool result、ResourceStore 或历史事实引用 ID。

#### Scenario: Prompt 展示新的最小 AgentAction 形状
- **WHEN** production Planner 构造模型可见协议层
- **THEN** 模型可见输入 MUST 包含 `tool_call`、`final_answer` 和 `ask_user` 的最小合法 JSON 形状
- **AND** `tool_call` 示例 MUST 只包含 `type`、`toolName`、`input` 和可选活动摘要
- **AND** `final_answer` 示例 MUST 只包含 `type`、`content`、可选 `suggestedQuestions`、可选 `visibleOutputs` 和可选活动摘要
- **AND** `ask_user` 示例 MUST 只包含 `type`、`content`、可选 `suggestedQuestions` 和可选活动摘要
- **AND** 示例 MUST NOT 包含 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`consumes`、`resourceId`、`toolResultId`、`factRef` 或 `messageId`

#### Scenario: Prompt 说明内部 provenance 由服务端维护
- **WHEN** prompt、`actionContract`、glossary 或 planner policy 描述 final grounding
- **THEN** 模型可见说明 MUST 表达模型只输出业务 action 和业务结构
- **AND** 模型可见说明 MUST 表达服务端内部负责记录 tool results、ResourceStore resource、history fact provenance、visible output validation metadata 和 trace
- **AND** 模型可见说明 MUST NOT 要求模型复制、选择、拼接或修复 `resourceId`、`toolResultId`、`factRef` 或 `messageId`
- **AND** 模型可见说明 MUST 使用中文描述业务含义，`AgentAction`、`tool_call`、`final_answer`、`ask_user`、`visibleOutputs` 等技术标识保持英文原样

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

### Requirement: 默认 prompt 必须表达 final_answer 的终态完成语义
系统 SHALL 在默认 Agent LLM system prompt 中表达 `final_answer` 是当前 run 的终态动作。Prompt MUST 说明 `final_answer.content` 只能解释本轮已经完成、明确阻断或由 runtime fallback 收口的结果；如果还需要执行 tool、查询事实、生成结构、保存结果或等待内部步骤，模型 MUST 返回合法 `tool_call`、`ask_user` 或让失败边界收口。

#### Scenario: Prompt 说明 final_answer 不会触发后续 tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `final_answer` 是终态，不会让 runtime 在本轮回复后继续自动调用 tool
- **AND** system message MUST 使用中文描述业务含义
- **AND** `final_answer`、`tool_call`、`ask_user`、`visibleOutputs`、`usedRefs` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 禁止未执行步骤的成功承诺
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明模型不得用 `final_answer.content` 承诺尚未执行的查询、生成、保存、等待或后续内部动作
- **AND** system message MUST 说明需要继续获取事实时必须返回当前可见且合法的 `tool_call`
- **AND** system message MUST NOT 要求固定 tool 调用次数、固定 tool 调用顺序或固定业务 `toolName`

#### Scenario: Prompt 表达 tool 后 final_answer 的 grounding
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当前 run 已经有 tool result 时，成功 `final_answer` 应通过 `usedRefs` 或合法 `visibleOutputs[]` 连接到当前 run 已满足事实
- **AND** system message MUST 说明 failed、diagnostic、不可消费 resource 或 `satisfied=false` 的 tool result 不能支撑成功 `final_answer`
- **AND** system message MUST 说明如果模型需要解释这类失败事实，应优先返回 `ask_user`、继续合法 `tool_call`，或交由 production terminal failure fallback / finalizer 收口

#### Scenario: Prompt 保持普通文本聊天能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明普通聊天、概念解释、能力说明、总结整理、训练原则说明等不需要工具执行的问题仍可直接使用 `final_answer`
- **AND** system message MUST NOT 暗示所有 `final_answer` 都必须引用 tool result

#### Scenario: Prompt 不新增服务端隐藏业务能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺服务端会自动补齐训练动作、自动生成训练编排、自动保存 artifact 或执行未注册 tool
- **AND** system message MUST NOT 要求调用 `generatePlanDraft` 或 `generateRoutineDraft`

### Requirement: 默认 prompt 必须表达 suggestedQuestions 建议提问合同
系统 SHALL 在默认 Agent LLM prompt 中把 `suggestedQuestions` 表达为 `final_answer` 和 `ask_user` 都可使用的全局可选字段。该字段表示用户可直接点击发送的建议提问文本，而不是前端事件、内部 action、tool input 或业务确认结果。默认 prompt SHALL 明确：当成功回答、动作推荐或结构化训练输出已经存在可靠自然下一步时，模型应把 1-3 条下一步写入 `suggestedQuestions`，而不是只写在 `content`。

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

#### Scenario: Prompt 引导成功回答输出自然下一步
- **WHEN** 默认 prompt 描述 `final_answer` 的成功收口
- **AND** 本轮成功回答、动作推荐、训练卡片、`routine`、`plan` 或训练解释存在可靠自然下一步
- **THEN** prompt MUST 说明模型应输出 1-3 条 `suggestedQuestions`
- **AND** prompt MUST 说明这些下一步可以覆盖调整条件、换一批、生成计划、细化目标或继续提问
- **AND** prompt MUST 说明下一步不得只写在 `content` 中

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

### Requirement: 默认 prompt 必须表达 recentVisibleTrainingProposals 的非引用边界
系统 SHALL 在默认 prompt 中说明 `run.metadata.recentVisibleTrainingProposals` 只是不含具体引用 id 的最近可见训练方案状态摘要。该 metadata MUST NOT 被描述为 `read_recent` input 来源、`exerciseId` 来源或 terminal resource grounding 来源。

#### Scenario: metadata 不能作为 read_recent 输入
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `run.metadata.recentVisibleTrainingProposals` 不包含可复制的具体 `factRef/messageId`
- **AND** system message MUST 说明 `inspectVisibleTrainingProposals(operation = "list_recent")` 才会返回本轮可复制到 `read_recent.ref.value` 的引用索引
- **AND** system message MUST 说明 `list_recent` 仍不能直接作为 `exerciseId` 来源或成功训练方案事实源

### Requirement: Planner 模型输入不得重复传递成功 tool result 的详细事实
系统 SHALL 在构造 production Planner 模型输入时，为成功且已满足的 tool result 选择单一权威详细事实通道。详细模型可见事实 MUST 保留在 redacted `toolResults[].projection.model` 或等价安全 projection 中，`observations` 中对应条目只能作为轻量索引和导航摘要。

#### Scenario: 成功 tool result 同时存在 observation 和 toolResults
- **WHEN** 当前 run 已有 `ok = true` 且 `fulfillment.satisfied = true` 的 tool result
- **AND** Runtime 准备构造下一轮 Planner 模型输入
- **THEN** `toolResults[]` MUST 保留该结果的安全 `projection.model`、fulfillment 摘要、`toolResultId` 和可验证引用
- **AND** 对应 `observations[]` MUST NOT 再包含同一份完整 `projection.model`
- **AND** 对应 `observations[]` MUST 只保留 `toolResultId`、`toolName`、`ok`、`fulfillment.satisfied`、必要 resource / grounding 摘要和“详细事实见 toolResults”或等价边界说明
- **AND** 模型输入 MUST NOT 默认包含完整 handler `output`

#### Scenario: repair 和 diagnostic observation 保持可见
- **WHEN** observation 来源是 failed tool result、diagnostic tool result、`fulfillment.satisfied = false`、invalid action、duplicate success feedback 或 runtime error
- **THEN** `observations[]` MUST 继续保留结构化 code、details、repair facts、recoverable actions 和安全摘要
- **AND** 这些 observation MUST 继续可用于下一轮 Planner 修复、澄清、阻断说明或失败收口
- **AND** 系统 MUST NOT 因去重成功 tool facts 而删除 repair / diagnostic observation

#### Scenario: 模型输入描述语言保持中文边界
- **WHEN** 新增或调整 observations / compressed tool results 中的模型可见说明
- **THEN** 描述性自然语言 MUST 使用中文
- **AND** `toolName`、字段名、enum、action type、resource type、schema id、错误码和代码标识符 MUST 保持英文原样

### Requirement: 默认 Agent LLM prompt 必须按规则层级收敛
系统 SHALL 在默认 Agent LLM system prompt 中保留跨 tool 必须首轮可见的通用合同，并压缩或移出只属于单个业务 tool 的操作细节。收敛后的 prompt MUST 保持模型理解 `AgentAction`、terminal grounding、`visibleOutputs[]`、`visibleTrainingProposal` 输出前置条件、引用对象推理和医疗安全边界的能力。

#### Scenario: system prompt 保留通用终态合同
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 继续表达 `tool_call`、`final_answer`、`ask_user` 的合法 JSON 形状和字段要求
- **AND** system message MUST 继续表达 `final_answer.content` 是本轮终态，不会触发后续自动 tool 调用
- **AND** system message MUST 继续表达 `usedRefs`、`suggestedQuestions` 和 `visibleOutputs[]` 的主合同
- **AND** system message MUST 继续表达 `visibleOutputs[]` 是结构化训练输出入口，正文不能替代动作、处方、编排或计划事实
- **AND** system message MUST 继续表达 `routine` / `plan` 需要 `warmup`、`training`、`stretch` 三类当前 run 可消费动作事实

#### Scenario: system prompt 不重复单个 tool 的操作细节
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 展开 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或 `resolveExerciseResourceMentions` 的完整 `whenToUse` / `whenNotToUse`
- **AND** system message MUST NOT 把任意业务 `toolName`、operation、字段组合或用户短语写成固定 tool 调用流程
- **AND** 单个业务 tool 的字段、operation、resource role、projection 和 examples MUST 由对应 tool manifest、schema description、observation 或 repair feedback 表达

#### Scenario: system prompt 保留少量关键结构例子
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 保留至少一个合法 `AgentAction` 最小 JSON 形状示例
- **AND** 如 system message 提供训练输出例子，例子 MUST 只说明结构形状和事实来源边界
- **AND** 例子 MUST NOT 包含可被模型照抄的 fake `toolResultId`、fake `resourceId`、fake `factRef` 或 fake `messageId`
- **AND** 例子 MUST NOT 把固定用户短语映射为固定 `payload.kind`

### Requirement: 默认 Agent LLM prompt 优化必须保留模型自主规划边界
系统 SHALL 在 prompt 优化后继续让 Planner 基于当前可见 `tools`、`observations`、`toolResults`、messages 和 metadata 自主选择 action、tool、`payload.kind` 和收口方式。Prompt 优化 MUST NOT 引入服务端语义分流，也 MUST NOT 通过删除规则让模型缺少必要事实判断依据。

#### Scenario: prompt 优化不引入服务端语义规则
- **WHEN** 实现本 change
- **THEN** `/api/chat`、Agent runtime、tool handler、validator 和 Response Renderer MUST NOT 新增基于用户原文关键词、正则、同义词表或短句模板的分支
- **AND** 系统 MUST NOT 根据用户原文替模型选择 `toolName`、action、`payload.kind` 或 final answer 策略

#### Scenario: prompt 优化后仍覆盖相邻训练输出结构
- **WHEN** 默认 prompt 描述 `visibleTrainingProposal.payload.kind`
- **THEN** system message MUST 继续区分 `exercise_selection`、`routine` 和 `plan` 的结构能力
- **AND** system message MUST 继续表达模型应根据完整用户目标、上下文和当前可见事实自主选择结构
- **AND** system message MUST 继续表达 `plan` 优先覆盖多天、周期、频次或训练日 / 休息日安排
- **AND** system message MUST 继续表达不能因为当前 run 先拿到 `training` 动作事实就把应为 `routine` 或 `plan` 的目标降级成 `exercise_selection`

#### Scenario: prompt 优化必须可测试
- **WHEN** 本 change 完成实现
- **THEN** 自动化测试 MUST 验证默认 system prompt 仍包含关键 `AgentAction`、`usedRefs`、`suggestedQuestions`、`visibleOutputs[]` 和 routine / plan section coverage 合同
- **AND** 测试 MUST 验证 system prompt 不包含固定用户短语路由或业务 tool 强制流程
- **AND** 测试 MUST 避免依赖长句逐字匹配，优先验证关键字段、结构和边界是否存在

### Requirement: Terminal failure finalizer prompt 必须集中配置

系统 SHALL 为 terminal failure finalizer 提供独立模型可见 prompt 配置。该 prompt MUST 位于服务端集中配置入口，MUST 与主 Agent planner prompt 区分，MUST 使用中文描述业务边界，MUST 保持技术标识英文原样。

#### Scenario: finalizer system prompt 来自配置模块

- **WHEN** terminal failure finalizer 构造模型请求
- **THEN** system message MUST 来自 `lib/server/config/` 下的 finalizer prompt 配置或等价集中入口
- **AND** finalizer adapter MUST NOT 在供应商请求构造函数中内联默认 prompt 句子
- **AND** prompt 配置 MUST 暴露稳定版本标识，例如 `promptVersion`

#### Scenario: finalizer prompt 与主 Agent prompt 分离

- **WHEN** 开发者查看 finalizer prompt 配置
- **THEN** finalizer prompt MUST NOT 复用主 Agent planner 的完整 tool loop 指令
- **AND** finalizer prompt MUST NOT 描述 `tool_call` 作为可用输出
- **AND** finalizer prompt MUST NOT 要求模型输出 `AgentAction`
- **AND** finalizer prompt MUST 明确本阶段只生成失败解释和下一步建议问题

### Requirement: finalizer prompt 必须严格说明本轮未满足需求

terminal failure finalizer system prompt SHALL 明确告知模型：主 Agent 已经耗尽内部修复机会，本轮没有满足用户需求，模型不得声称已完成或继续执行。该说明 MUST 是模型实际可见输入的一部分。

#### Scenario: prompt 禁止成功承诺

- **WHEN** finalizer system prompt 被构造
- **THEN** prompt MUST 明确“本轮没有满足用户需求”或等价语义
- **AND** prompt MUST 禁止模型声称已生成、已保存、已查询、已确认、已执行或已展示未发生的业务结果
- **AND** prompt MUST 禁止输出训练卡片、JSON payload、NDJSON event、`visibleOutputs`、`tool_call` 或 `AgentAction`

#### Scenario: prompt 限制建议问题

- **WHEN** finalizer system prompt 描述 `suggestedQuestions`
- **THEN** prompt MUST 说明建议问题最多 3 条
- **AND** prompt MUST 说明每条建议问题必须是用户口吻的完整自然语言问题
- **AND** prompt MUST 说明建议问题只是下一轮用户消息候选，不代表服务端已经执行任何操作
- **AND** prompt MUST 禁止建议问题承诺不可用能力、医疗诊断、保存结果或未注册 tool

### Requirement: finalizer 模型输入必须使用结构化失败摘要

系统 SHALL 让 terminal failure finalizer 的 user message 使用结构化 JSON 摘要，而不是直接复制主 Agent prompt、完整 conversation payload 或完整 tool results。该摘要 MUST 让模型理解失败原因和可恢复方向，同时避免泄漏内部实现。

#### Scenario: user message 包含失败摘要

- **WHEN** finalizer 构造 user message
- **THEN** user message MUST 包含主 Agent failure category、稳定错误 code、用户目标摘要、未满足要求摘要和允许回复模式
- **AND** user message MUST 包含已验证事实的脱敏摘要
- **AND** user message MUST 使用中文描述业务含义
- **AND** `failureCategory`、`suggestedQuestions`、`visibleOutputs` 等技术标识 MUST 保持英文原样

#### Scenario: user message 不复制主 Agent 可执行上下文

- **WHEN** finalizer 构造 user message
- **THEN** user message MUST NOT 包含 tool manifest
- **AND** user message MUST NOT 包含完整 `PlannerInput`
- **AND** user message MUST NOT 包含完整 `toolResults.output`
- **AND** user message MUST NOT 包含服务端根据用户原文关键词或 phrasing 生成的业务意图

### Requirement: finalizer 输出 schema 必须独立于 AgentAction

系统 SHALL 为 terminal failure finalizer 输出定义独立 schema。该 schema MUST 只允许 `content` 和可选 `suggestedQuestions`，MUST NOT 与主 Agent `AgentAction` schema 混用。

#### Scenario: output schema 只允许失败回复字段

- **WHEN** finalizer 返回模型输出
- **THEN** 系统 MUST 使用独立 schema 校验输出
- **AND** schema MUST 要求 `content` 为非空字符串
- **AND** schema MUST 允许 `suggestedQuestions` 为最多 3 条字符串
- **AND** schema MUST 拒绝 `type`、`toolName`、`input`、`visibleOutputs`、`usedRefs` 或其他 `AgentAction` 字段

#### Scenario: 输出校验失败不进入 repair

- **WHEN** finalizer 输出 schema 校验失败
- **THEN** 系统 MUST 不再向模型发送 repair prompt
- **AND** production adapter MUST 使用确定性 fallback
- **AND** trace MUST 记录 finalizer 输出校验失败

### Requirement: DeepSeekModelAdapter 必须消费 thinkingEnabled 构造 Thinking 请求
系统 SHALL 将首页聊天请求中的 `thinkingEnabled` 传递到生产 `DeepSeekModelAdapter`，并映射为 DeepSeek Thinking Mode 请求参数。该映射 MUST 保持在供应商 adapter 或等价 provider request builder 边界内。

#### Scenario: 开启思考模式
- **WHEN** `/api/chat` 请求中 `thinkingEnabled` 为 `true` 或省略后被服务端默认视为开启
- **THEN** `DeepSeekModelAdapter` 构造的 DeepSeek 请求体 MUST 包含 `thinking.type = "enabled"`
- **AND** 请求体 MUST 包含集中配置指定的 `reasoning_effort`
- **AND** 模型可见 prompt 仍 MUST 要求输出合法 `AgentAction` JSON

#### Scenario: 关闭思考模式
- **WHEN** `/api/chat` 请求中 `thinkingEnabled` 为 `false`
- **THEN** `DeepSeekModelAdapter` 构造的 DeepSeek 请求体 MUST 包含 `thinking.type = "disabled"`
- **AND** adapter MUST NOT 因 DeepSeek 默认开启 Thinking Mode 而省略 disabled 请求参数

#### Scenario: Thinking Mode 不改变 AgentAction 合同
- **WHEN** Thinking Mode 开启或关闭
- **THEN** `LlmPlanner` 和 `runAgentRuntime` MUST 继续只消费 `AgentAction` candidate
- **AND** 允许的 action type MUST 仍为 `tool_call`、`final_answer`、`ask_user`
- **AND** 本 change MUST NOT 新增 DeepSeek 原生 `tools`、`tool_calls` 或 `role = "tool"` 协议作为生产工具调用合同

#### Scenario: agent-core 保持供应商无关
- **WHEN** 实现 Thinking Mode 请求映射
- **THEN** `agent-core` MUST NOT 导入 DeepSeek Thinking Mode 类型、DeepSeek request body、`reasoning_content` 或供应商响应结构
- **AND** Thinking Mode 专有字段 MUST 只存在于 provider adapter、配置、trace projection 或生产装配层

### Requirement: reasoning_content 必须作为受控诊断而非用户可见回复处理
系统 SHALL 支持读取 DeepSeek 响应中的 `reasoning_content`，但当前用户可见聊天响应 MUST NOT 展示原始 reasoning 内容。系统 MUST 保留后续受控展示 reasoning 的扩展边界。

#### Scenario: 响应解析保留 reasoning 诊断
- **WHEN** DeepSeek 响应包含 `reasoning_content`
- **THEN** adapter MUST 能识别该字段
- **AND** 解析 `AgentAction` 时 MUST 继续以模型正式 `content` 为准
- **AND** `reasoning_content` MUST NOT 被拼接进 `content` 或当作 `AgentAction` JSON 解析来源

#### Scenario: 当前不向前端展示 reasoning 原文
- **WHEN** `/api/chat` 返回用户可见 NDJSON
- **THEN** 系统 MUST NOT 新增展示原始 `reasoning_content` 的用户可见事件
- **AND** 系统 MUST NOT 将原始 `reasoning_content` 保存为 chat history 中的 assistant content
- **AND** 后续若要展示 reasoning MUST 通过独立 change 定义前端事件、存储、脱敏和关闭策略

### Requirement: Planner 模型输入必须暴露 outputContracts
系统 SHALL 在生产 Planner user payload 中暴露 `outputContracts`，并使其与 `tools`、`observations` 和 `toolResults` 并列成为模型可见事实。`outputContracts` MUST 只描述可输出的用户可见结构化结果能力，不得成为服务端 action 路由或业务语义判断入口。

#### Scenario: user payload 包含 outputContracts
- **WHEN** `DeepSeekModelAdapter` 或等价 Planner model input builder 构造模型请求
- **THEN** user payload MUST 包含 `outputContracts`
- **AND** `outputContracts` MUST 至少覆盖当前 production 可输出的 `visibleTrainingProposal`
- **AND** `outputContracts` MUST 使用中文描述性说明并保留英文技术标识
- **AND** tests MUST 能断言该 payload 中的 `outputContracts` 与 `tools`、`observations`、`toolResults` 同级或等价可见

### Requirement: Planner 模型输入必须暴露 actionContract 字段字典

系统 SHALL 在生产 Planner user payload 中暴露 `actionContract`，用于集中描述 `AgentAction` 最小形状、字段含义、决策顺序、grounding、引用操作、repair 边界和少量 few-shot。默认 system prompt MUST NOT 把这些字段说明重复展开成后端接口文档。

#### Scenario: actionContract 集中表达 tool 与 resource glossary
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** `actionContract` MUST 包含 `tool_call`、`final_answer` 和 `ask_user` 的最小合法形状
- **AND** `actionContract.fieldDictionary` 或等价字段 MUST 集中解释 `factRef`、`messageId`、`resource.id`、`diagnostic resource`、`consumable resource`、`factSchemaVersion` 和 `visibleOutputs[].schemaVersion`
- **AND** `actionContract` MUST 表达 tool result 不是最终回答、tool 不生成最终 `visibleOutputs`、failed / diagnostic / satisfied=false 结果不能支撑成功结构化输出
- **AND** `actionContract` MUST 表达 `resource.id` 才能进入 `final_answer.usedRefs[type="resource"]`
- **AND** 具体业务 tool manifest MUST NOT 反复复制这些全局禁止项

#### Scenario: actionContract 表达引用已有动作的正负锚点策略
- **WHEN** 用户目标涉及已有训练方案、已解析动作或当前 run 可见动作事实的复用、派生、调整、替换或排除
- **THEN** `actionContract.referencePolicy` 或等价策略 MUST 表达保留、复用、派生或调整时使用当前 run 可见正向事实或 `requiredExerciseIds`
- **AND** `actionContract.referencePolicy` 或等价策略 MUST 表达替换、排除或避免重复时使用 `excludeExerciseIds`
- **AND** 该策略 MUST NOT 写成固定用户短语到固定 tool call 的映射
- **AND** 服务端 MUST NOT 根据用户原文把请求改写成固定 action、固定 `toolName` 或固定 input

#### Scenario: actionContract examples 和 tool examples 形态一致
- **WHEN** Planner 可见输入同时包含 `actionContract.examples` 和 `tools[].examples`
- **THEN** 需要调用工具的 examples MUST 展示完整 `AgentAction` tool_call 形态
- **AND** examples MUST NOT 训练模型输出裸 tool input

### Requirement: 默认 prompt 必须集中不可执行请求决策顺序
系统 SHALL 在默认 Agent LLM system prompt 中提供短的通用不可执行请求决策顺序。该顺序 MUST 只基于 action、tool capability、事实充分性和 grounding 抽象，不得包含具体用户短语、业务 toolName、业务 outputType 或服务端自然语言分流规则。

#### Scenario: 不需要工具时直接回答
- **WHEN** 用户请求是普通解释、总结、能力说明、训练原则说明或其他不需要工具且模型能可靠回答的问题
- **THEN** system prompt MUST 允许模型返回 `final_answer`
- **AND** system prompt MUST NOT 要求先调用工具或输出 unsupported capability fallback

#### Scenario: 缺少必要信息时澄清
- **WHEN** 当前可见信息不足以可靠回答或生成可校验结构化输出
- **THEN** system prompt MUST 引导模型返回 `ask_user`
- **AND** `ask_user.content` MAY 说明缺少什么信息和可选补充方向

#### Scenario: 需要未注册能力时不得执行
- **WHEN** 用户请求需要当前 `tools[]` 未注册的能力、写入、保存、查询或外部执行
- **THEN** system prompt MUST 要求模型不得输出该未注册能力的 `tool_call`
- **AND** system prompt MUST 要求模型不得承诺已执行、已保存、已查询、已生成卡片或已等待内部流程
- **AND** 在没有已有 failed tool result 的情况下，模型 MAY 用 `final_answer` 说明当前能力边界和可行替代方向

#### Scenario: 已有事实不足时恢复或失败收口
- **WHEN** 当前 run 已有 tool result、observation 或 resource，但事实不足以支撑用户目标
- **THEN** system prompt MUST 引导模型优先继续当前可见且合法的 `tool_call`
- **AND** 如果不能继续获取事实或缺少用户必要信息，模型 MUST 返回 `ask_user`
- **AND** 如果 runtime 已经进入不可恢复 terminal failure，用户可见回复 MUST 由 production fallback / finalizer 收口
- **AND** system prompt MUST NOT 用成功 `final_answer` 承诺未完成结果

### Requirement: Planner 模型输入必须分离稳定协议和当前事实
系统 SHALL 将生产 Planner 的模型可见输入分为稳定协议层和当前事实层。稳定协议层 SHALL 承载 `AgentAction` 合同、glossary、Planner policy、output contract 摘要和 prompt 版本；当前事实层 SHALL 承载本轮 `run`、`step`、`tools`、`observations` 和 `toolResults`。系统 MUST NOT 继续把完整长期协议和当前事实平铺在同一个 user payload 顶层。

#### Scenario: 首轮 Planner 请求分层
- **WHEN** `DeepSeekModelAdapter` 或等价 adapter 构造首轮 production Planner 请求
- **THEN** 模型请求 MUST 包含高优先级稳定协议内容
- **AND** 稳定协议内容 MUST 包含 `AgentAction` 顶层 action 类型、字段字典、引用 glossary、grounding policy、Planner policy 和 output contract 摘要
- **AND** 当前事实 payload MUST 包含 `run`、`step`、`tools`、`observations` 和 `toolResults`
- **AND** 当前事实 payload MUST NOT 在顶层平铺完整 `actionContract`
- **AND** 当前事实 payload MUST NOT 把长期规则当作本轮普通数据传入

#### Scenario: adapter 保持供应商协议边界
- **WHEN** 实现 Planner 输入分层
- **THEN** `agent-core` MUST 继续只依赖模型无关 `PlannerPort` / `ModelActionCompletionInput` 或等价输入结构
- **AND** `agent-core` MUST NOT 构造 DeepSeek message、导入 DeepSeek 请求类型或依赖供应商专有字段
- **AND** adapter MAY 将稳定协议渲染为单个 system message 或供应商支持的等价高优先级 message
- **AND** adapter MUST NOT 注册 tool、执行 tool、修改 validation result 或绕过 runtime 校验

#### Scenario: trace 摘要保留分层证据
- **WHEN** 记录模型请求 trace summary
- **THEN** trace summary SHOULD 表达本次请求是否包含 `protocol`、`context` 和可选 `repairContext`
- **AND** trace summary MUST NOT 泄漏完整 tool output、secret、provider 原始敏感内容或跨用户事实

### Requirement: output contract action 示例必须使用真实 AgentAction 形态
系统 SHALL 区分模型可见 output contract 中的 action 示例和自然语言决策说明。字段名为 `expectedAction` 时，其值 MUST 是完整 `AgentAction` object；自然语言说明 MUST 使用 `expectedDecision` 或等价非 action 字段。

#### Scenario: expectedAction 不允许字符串
- **WHEN** `getAgentVisibleOutputContracts()` 或等价 helper 返回模型可见 output contract
- **THEN** 任意 `examples[].expectedAction` 如果存在，MUST 是 JSON object
- **AND** `examples[].expectedAction.type` MUST 是 `tool_call`、`final_answer` 或 `ask_user`
- **AND** `examples[].expectedAction` MUST NOT 是字符串、Markdown、伪代码或只描述 input 的片段

#### Scenario: 自然语言决策说明使用 expectedDecision
- **WHEN** output contract 需要表达“继续合法 tool_call、ask_user 或失败收口”等策略
- **THEN** 该说明 MUST 写入 `expectedDecision` 或等价字段
- **AND** 该字段 MUST 使用中文说明业务决策边界
- **AND** 该字段 MUST NOT 被命名为 `expectedAction`

#### Scenario: action 示例不复制占位业务 id
- **WHEN** output contract 示例包含 `visibleOutputs[]`
- **THEN** 示例中的 `exerciseId`、`resourceId`、`toolResultId`、`factRef` 或 `messageId` MUST 清楚表达不可照抄
- **AND** 示例 MUST 引导模型使用当前 run 可见事实
- **AND** 示例 MUST NOT 暴露看起来像真实 id 的可复制占位值

### Requirement: AgentAction 必须支持受控活动摘要
系统 SHALL 允许生产 Planner 在 `AgentAction` 中输出可选 `activitySummary` 字段，用于表达本轮 action 的用户可见短活动摘要。该字段 MUST 由 `AgentAction` schema 和模型可见 action contract 明确定义；字段缺失 MUST NOT 触发 repair，服务端和前端 MUST 使用现有活动 stage fallback。

#### Scenario: 模型可见合同说明 activitySummary
- **WHEN** 默认 Agent LLM prompt 配置生成 system message 和 `protocol.actionContract`
- **THEN** 模型可见输入 MUST 说明 `activitySummary` 是当前 action 的用户可见短活动摘要
- **AND** 说明 MUST 使用中文描述业务含义
- **AND** `activitySummary`、`AgentAction`、`tool_call`、`final_answer`、`ask_user` 等技术标识 MUST 保持英文原样
- **AND** 说明 MUST 表达该字段不是 `final_answer.content`、不是 `ask_user.content`、不是 tool input、不是模型推理内容、不是 NDJSON event

#### Scenario: activitySummary 覆盖三类 action
- **WHEN** Planner 输出 `tool_call`、`final_answer` 或 `ask_user`
- **THEN** 每类 action MAY 包含 `activitySummary`
- **AND** schema MUST 对三类 action 使用一致的字段含义和安全边界
- **AND** schema MUST NOT 要求旧 `tool_call.rationale` 承担用户可见活动摘要职责

#### Scenario: activitySummary 不参与 Agent 决策
- **WHEN** Runtime、Action Validator、Policy Guard、ResourceStore、tool handler 或 Response Renderer 处理合法 action
- **THEN** 系统 MUST NOT 使用 `activitySummary` 决定 action type、`toolName`、tool input、resource 引用、grounding、权限、确认策略、最终回答或结构化输出
- **AND** 系统 MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板生成、改写或替换 `activitySummary`

#### Scenario: activitySummary 不展示内部实现细节
- **WHEN** 模型可见合同说明 `activitySummary` 的写法
- **THEN** 合同 MUST 要求摘要使用面向用户的短中文
- **AND** 合同 MUST 禁止摘要暴露内部执行合同、工具名、schema 字段、validator、runtime、resource、provider、trace、prompt、AgentAction、错误码或 raw model output
- **AND** 合同 SHOULD 示例化用户安全表达，例如“需要查询动作库”“需要读取已有训练内容”“需要校验训练安排”“需要向你确认训练时间”

### Requirement: activitySummary 必须遵守 prompt 分层边界
系统 SHALL 将 `activitySummary` 的字段形状放在 `Action Contract` / schema 中，将用户安全写法放在默认 Agent LLM prompt 的短规则或 field dictionary 中。系统 MUST NOT 为该字段新增业务 tool 固定流程、业务关键词触发规则或具体 trace case 规则。

#### Scenario: 字段规则落在 Action Contract
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** `activitySummary` 的字段含义、可选性、长度边界和用户安全边界 MUST 位于 `protocol.actionContract`、field dictionary、schema 或等价 action 合同层
- **AND** system prompt MAY 只保留短句提醒模型该字段是用户安全活动摘要
- **AND** system prompt MUST NOT 承载业务 tool 的长流程说明

#### Scenario: repair 只处理字段结构问题
- **WHEN** 模型输出非法 `activitySummary`
- **THEN** repair feedback MAY 指出字段类型、长度、未知字段或内部术语泄漏等确定性错误
- **AND** repair feedback MUST NOT 根据用户语义替模型生成新的摘要
- **AND** 如果摘要缺失，系统 MUST NOT 因缺失该可选字段进入 repair

### Requirement: 模型可见输入不得暴露可操作内部引用 ID
系统 SHALL 将 `toolResults`、`observations`、resource 摘要、history fact 摘要和 compressed tool results 投影为模型可消费的业务事实。模型可见内容 MAY 包含业务对象的稳定标识，例如数据库 `exerciseId`；MUST NOT 暴露可被模型复制到 action 的 `toolResultId`、`resourceId`、`factRef`、`messageId` 或 trace id。

#### Scenario: toolResults projection 使用业务事实而非引用操作
- **WHEN** adapter 构造 production Planner 的当前事实层
- **THEN** `toolResults[]` 或等价事实投影 MUST 保留模型判断下一步所需的业务事实、成功/失败状态、约束和诊断摘要
- **AND** 投影 MUST NOT 要求模型在最终 action 中引用 `toolResultId`
- **AND** 如 trace 仍记录 `toolResultId`，该字段 MUST 留在 trace / server metadata，不作为模型输出合同的一部分

#### Scenario: history facts projection 不暴露源业务引用
- **WHEN** 当前会话历史 `visibleTrainingProposal` 事实进入模型可见输入
- **THEN** projection MUST 使用受控压缩业务事实表达 `proposalKind`、section 摘要、`exerciseItems`、`prescription`、`schedule` 和必要动作详情
- **AND** projection MUST NOT 暴露 `factRef`、`messageId`、`resourceId` 或 `toolResultId`
- **AND** projection MUST 表达这些事实来自当前 actor 和 conversation 可访问边界，但不要求模型输出来源 ID

### Requirement: actionContract 必须表达 visibleOutputs 是结构化交付通道
系统 SHALL 在 `actionContract`、output contract 或 planner policy 中表达：结构化用户可见结果通过 `final_answer.visibleOutputs[]` 交付；该结构通过 terminal output validator 后即可作为成功交付依据。模型不需要额外输出 `usedRefs` 来证明同一个 `visibleOutputs[]`。

#### Scenario: visibleOutputs 成功不需要 usedRefs
- **WHEN** 模型可见合同描述 `final_answer.visibleOutputs[]`
- **THEN** 合同 MUST 表达 `visibleOutputs[]` 是结构化交付字段
- **AND** 合同 MUST 表达 `visibleOutputs[]` 会由服务端基于 `outputType`、`schemaVersion` 和业务 validator 校验
- **AND** 合同 MUST NOT 要求同一个 `final_answer` 同时输出 `usedRefs`

