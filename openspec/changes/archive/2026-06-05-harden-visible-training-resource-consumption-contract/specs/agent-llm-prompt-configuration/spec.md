## ADDED Requirements

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

## MODIFIED Requirements

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
