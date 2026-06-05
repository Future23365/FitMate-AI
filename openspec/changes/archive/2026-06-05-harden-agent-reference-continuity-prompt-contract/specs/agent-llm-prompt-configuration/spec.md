## ADDED Requirements

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
