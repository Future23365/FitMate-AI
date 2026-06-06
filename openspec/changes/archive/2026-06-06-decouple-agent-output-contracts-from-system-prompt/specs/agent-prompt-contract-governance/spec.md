## ADDED Requirements

### Requirement: Prompt 合同治理必须检查模型可见规则分层
系统 SHALL 在 Agent prompt / model input / output contract / tool manifest / observation / repair feedback 变更前执行模型可见规则分层检查。治理检查 MUST 区分通用 system prompt、`outputContracts`、业务 tool manifest、resource contract、observation projection、repair feedback 和测试样例，防止把业务实例继续升格为通用 prompt 或服务端语义规则。

#### Scenario: 审查通用 system prompt 改动
- **WHEN** 后续 change 修改默认 Agent LLM system prompt
- **THEN** 设计说明 MUST 明确该规则属于跨业务能力的 `AgentAction`、tool loop、grounding、policy / resource / validator、安全、不可执行能力或医疗安全边界
- **AND** 设计说明 MUST 说明为什么不能由 `outputContracts`、tool manifest、observation、repair feedback 或 validator diagnostics 承载
- **AND** system prompt MUST NOT 内联单个业务 output type 的完整 payload 规则、examples、字段组合、具体业务 toolName 恢复流程或用户 phrasing 触发规则

#### Scenario: 审查业务输出合同改动
- **WHEN** 后续 change 修改 `visibleTrainingProposal` 或等价用户可见结构化输出能力
- **THEN** 设计说明 MUST 优先把 schema summary、examples、payload kind、grounding requirements、validator boundary 和失败恢复说明放入 `outputContracts` 或等价 schema summary
- **AND** 相关业务名 MAY 出现在 output contract、tool manifest、resource contract、observation projection、validator diagnostics 或回归测试中
- **AND** 相关业务名 MUST NOT 作为通用 system prompt 的语义触发条件、固定 tool 调用流程或服务端 action 路由条件

#### Scenario: 审查 repair feedback 或 observation 改动
- **WHEN** 后续 change 修改 repair feedback、observations、compressed tool results 或 tool result projection
- **THEN** 模型可见内容 MUST 表达稳定失败 code、可消费状态、resource role、grounding 要求和可恢复方向
- **AND** 模型可见内容 MUST NOT 把 failed / diagnostic / unsatisfied result 描述成成功事实来源
- **AND** 模型可见内容 MUST NOT 暴露完整 handler payload、secret、跨用户 payload、provider 原文或 stack

### Requirement: Prompt change 必须声明业务实例的合法位置
系统 SHALL 要求 Agent / prompt / tool 修复方案在出现具体业务名、trace 个例、用户原话、tool result 或模型输出失败时，明确这些内容的合法位置。业务实例 MUST 只能作为失败证据、局部合同、observation projection、resource contract、validator diagnostics 或回归测试出现，不得直接决定生产通用规则。

#### Scenario: 修复方案来自具体 trace
- **WHEN** 修复方案由具体 trace、用户原话、tool result、validator failure 或模型输出失败触发
- **THEN** 方案 MUST 先说明抽象问题类型，例如引用对象缺失、grounding 缺失、output contract 缺失、tool observation 不足、repair feedback 不足或 fallback 边界不足
- **AND** 通用合同修复 MUST 使用稳定抽象，例如 action、resource、tool result、usedRefs、outputContracts、grounding、repair、clarification 或 fallback
- **AND** 方案 MUST NOT 使用“当用户说 X 时”“当 `toolName = Y` 且字段 Z 为某值时”作为生产规则

#### Scenario: 测试可以包含业务实例
- **WHEN** 回归测试需要覆盖具体失败 case
- **THEN** 测试 MAY 使用真实用户输入、业务 toolName、具体 outputType、validator path 或 trace 条件
- **AND** 测试 MUST 证明这些样例只验证通用合同或局部 output contract
- **AND** 测试样例 MUST NOT 反向要求生产代码新增关键词、正则、同义词表、短句模板、固定 toolName 分支或用户原文语义路由

### Requirement: Prompt / output contract tests 必须覆盖分层边界
系统 SHALL 为 prompt、model input 和 output contract 变更提供自动化验证，证明模型实际可见输入符合分层边界。测试 MUST 关注结构化合同、必要字段、禁止项和关键边界，而不是依赖长 system prompt 逐字匹配。

#### Scenario: system prompt 瘦身测试
- **WHEN** 实现本 change
- **THEN** tests MUST 断言默认 system prompt 仍包含 `AgentAction`、`tool_call`、`final_answer`、`ask_user`、`usedRefs`、tool registry、grounding、policy / validator 和不可执行能力边界
- **AND** tests MUST 断言默认 system prompt 不再包含 `visibleTrainingProposal` 的完整 payload 规则、完整 routine / plan section 细则、完整 examples 或具体业务 toolName 恢复流程

#### Scenario: outputContracts 可见测试
- **WHEN** production Planner model input builder 构造模型请求
- **THEN** tests MUST 断言 `outputContracts` 可见
- **AND** tests MUST 断言 `visibleTrainingProposal` output contract 包含 `outputType`、`schemaVersion`、`schemaSummary`、`groundingRequirements`、`validatorBoundary` 和关键 examples / whenToUse / whenNotToUse 信息
- **AND** tests MUST 断言描述性自然语言为中文，技术标识保持英文

#### Scenario: 无服务端语义分流测试
- **WHEN** 实现本 change
- **THEN** architecture / regression tests MUST 证明 `/api/chat`、Agent runtime、tool handler、validator 和 renderer 没有新增基于用户原文、关键词、正则、同义词表、短句模板、具体 phrasing 或业务 `toolName` 的 action / outputType / payload kind 分支
