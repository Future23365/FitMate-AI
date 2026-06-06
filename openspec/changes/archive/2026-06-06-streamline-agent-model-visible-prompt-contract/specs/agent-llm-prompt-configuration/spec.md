## ADDED Requirements

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
