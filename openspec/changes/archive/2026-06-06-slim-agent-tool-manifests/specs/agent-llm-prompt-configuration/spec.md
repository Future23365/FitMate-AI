## MODIFIED Requirements

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
