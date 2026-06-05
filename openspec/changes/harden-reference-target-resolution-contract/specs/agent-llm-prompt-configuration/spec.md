## ADDED Requirements

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
