# agent-visible-output-contracts Specification

## Purpose
TBD - created by archiving change decouple-agent-output-contracts-from-system-prompt. Update Purpose after archive.
## Requirements
### Requirement: Planner 可见输入必须包含结构化输出能力合同
系统 SHALL 为 Planner 暴露 `outputContracts`，用于描述当前 run 可输出的用户可见结构化结果。`outputContracts` MUST 与 `tools`、`observations` 和 `toolResults` 一起进入模型可见输入；它 MUST NOT 作为服务端语义路由、固定 action 选择器或隐藏业务执行入口。

#### Scenario: 构造 Planner 模型输入
- **WHEN** production `LlmPlanner` 构造模型请求
- **THEN** user payload MUST 包含 `outputContracts`
- **AND** `outputContracts` MUST 是数组
- **AND** 每个 output contract MUST 至少包含 `outputType`、`schemaVersion`、`description`、`schemaSummary`、`groundingRequirements` 和 `validatorBoundary`
- **AND** 描述性自然语言 MUST 使用中文
- **AND** `outputType`、`schemaVersion`、字段名、enum 和 schema id MUST 保持英文技术标识原样

#### Scenario: outputContracts 不替模型选择业务意图
- **WHEN** Planner 读取 `outputContracts`
- **THEN** 模型 MUST 基于用户目标、messages、metadata、tools、observations、toolResults 和可消费 resource 自主判断是否输出结构化结果
- **AND** `/api/chat`、Agent runtime、validator、tool handler 和 renderer MUST NOT 根据用户原文、关键词、短句模板、同义词表或具体 phrasing 选择 `outputType`、action、toolName 或 payload kind
- **AND** `outputContracts` MUST NOT 要求固定 tool 调用顺序或固定 tool 调用次数

### Requirement: visibleTrainingProposal 输出合同必须从 system prompt 解耦
系统 SHALL 通过 `outputContracts` 暴露 `visibleTrainingProposal` 的业务输出合同。默认 Agent system prompt SHALL 只要求模型遵守当前可见 `outputContracts[]`；`visibleTrainingProposal` 的 payload 业务结构、section coverage、处方、schedule 和 examples MUST 由 `visibleTrainingProposal` output contract 承载。

#### Scenario: visibleTrainingProposal 合同可见
- **WHEN** production Planner 可输出训练推荐、训练编排或多天训练计划
- **THEN** `outputContracts` MUST 包含 `outputType = "visibleTrainingProposal"` 的合同
- **AND** 该合同 MUST 声明 `schemaVersion = "1"`
- **AND** 该合同 MUST 集中提供字段字典，解释 `visibleTrainingProposal`、`visible_training_proposal_fact`、`consumable resource`、`producedResources`、`resource summary`、`fulfillment.satisfied`、`missingSectionsForRoutineOrPlan`、`payload`、`exerciseItems` 和 `schedule.assignments`
- **AND** 该合同 MUST 说明 payload `kind` 只能是 `exercise_selection`、`routine` 或 `plan`
- **AND** 该合同 MUST 说明 `exerciseItems[*].exerciseId` 和 `exerciseItems[*].section` 必须由当前 run 可见动作事实或可消费训练事实支撑
- **AND** 该合同 MUST 说明 `content` 不能作为动作、处方、编排或计划事实源

#### Scenario: routine 和 plan 的结构合同
- **WHEN** `visibleTrainingProposal` output contract 描述 `routine` 或 `plan`
- **THEN** 合同 MUST 说明 `routine` 和 `plan` 需要 `warmup`、`training`、`stretch` 三类 section 的当前 run 可消费动作事实
- **AND** 合同 MUST 说明 `routine` 和 `plan` 的每个动作项都必须绑定 `prescription`
- **AND** 合同 MUST 明确当前 `plan = one routine template + schedule`
- **AND** 合同 MUST 说明 `plan` 必须使用 `schedule.assignments` 表达周期内 `training` / `rest` 日
- **AND** 合同 MUST 说明 `schedule` 不得内嵌每天不同的完整动作编排
- **AND** 合同 MUST 说明当前 schema 不支持 `routines[]`、`schedule.assignments[].routineId` 或 A/B 多训练日模板
- **AND** 合同 MUST 说明缺少可消费 section 事实时不得伪造结构化输出

#### Scenario: exercise_selection 的结构合同
- **WHEN** `visibleTrainingProposal` output contract 描述 `exercise_selection`
- **THEN** 合同 MUST 说明 `exercise_selection` 只表达一批可选 `training` 动作事实
- **AND** 合同 MUST 说明 `exercise_selection` 不表示一次可直接照做的训练编排
- **AND** 合同 MUST 说明 `exercise_selection` 不应输出 `prescription` 或 `schedule`

#### Scenario: output contract examples 覆盖关键边界
- **WHEN** `visibleTrainingProposal` output contract 暴露 examples
- **THEN** examples MUST 覆盖缺少训练约束时的 `ask_user`
- **AND** examples MUST 覆盖需要动作事实时的合法 `tool_call` 方向
- **AND** examples MUST 覆盖只有 `training` 事实但用户需要 `routine` 时不得降级为 `exercise_selection`
- **AND** examples MUST 覆盖已有三类 section 事实时输出 `routine`
- **AND** examples MUST 覆盖已有三类 section 事实且需要周期安排时输出单模板 `plan`
- **AND** examples MUST 覆盖基于已有对象 `derive`、`replace` 或 `modify` 的引用边界

### Requirement: output contract 必须与 terminal output validator 保持一致
系统 SHALL 使 `outputContracts` 与对应 terminal output validator 的结构边界一致。模型可见 output contract MUST NOT 承诺 validator 不接受的字段、版本、resource role 或 payload shape。

#### Scenario: visible output schema version 一致
- **WHEN** `visibleTrainingProposal` output contract 暴露 schema version
- **THEN** 合同 MUST 使用字符串 `"1"`
- **AND** 合同 MUST NOT 使用数字 `1`、`schemaVersion = 1` 或等价数字版本示例
- **AND** 自动化测试 MUST 证明模型可见 output contract 与 validator 支持版本一致

#### Scenario: output contract 不暴露内部 payload
- **WHEN** 系统构造 `outputContracts`
- **THEN** 合同 MUST 只包含 schema summary、examples 和安全业务说明
- **AND** 合同 MUST NOT 暴露完整 tool handler output、完整数据库对象、secret、跨用户 payload、provider 原文或内部 stack
- **AND** 合同 MUST NOT 把 diagnostic resource 描述成可成功消费的训练事实

### Requirement: output contract 必须支持 trace 和测试审计
系统 SHALL 为模型可见 `outputContracts` 提供可审计证据。测试和 trace MUST 能证明某次 Planner 调用看到了哪些 output type、schema version 和关键边界。

#### Scenario: 测试检查 outputContracts
- **WHEN** 自动化测试读取 production Planner 模型输入
- **THEN** tests MUST 断言 `outputContracts` 存在
- **AND** tests MUST 断言 `visibleTrainingProposal` 合同包含 `outputType`、`schemaVersion`、`kind`、section coverage、groundingRequirements 和 validatorBoundary
- **AND** tests MUST 断言通用 system prompt 不再承载 `visibleTrainingProposal` 的完整业务输出规则

#### Scenario: trace 记录 output contract 摘要
- **WHEN** production Planner 模型请求进入 trace
- **THEN** trace SHOULD 记录 `outputContracts` 的 output type、schema version、数量或等价摘要
- **AND** trace MUST NOT 因记录 output contract 而泄漏完整数据库对象、secret 或跨用户 payload
