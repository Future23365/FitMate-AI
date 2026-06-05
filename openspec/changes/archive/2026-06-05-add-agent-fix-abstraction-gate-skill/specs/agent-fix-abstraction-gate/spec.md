## ADDED Requirements

### Requirement: Agent 修复方案必须执行抽象层级门禁审查
系统 SHALL 提供一个 Codex Skill，在开始实现 Agent / prompt / tool 修复方案或审查某个相关 OpenSpec change 前，检查方案是否把具体失败证据、业务实例或测试样例错误升格为通用生产规则。

#### Scenario: 开始实现 Agent 修复方案
- **WHEN** 用户要求修复来自具体 trace、用户原话、tool result、模型输出失败、repair 失败或 final grounding 失败的 Agent / prompt / tool 问题
- **THEN** Codex MUST 使用抽象层级门禁 Skill
- **AND** Codex MUST 先区分失败证据、通用合同、业务实例和回归测试
- **AND** Codex MUST 在方案中说明没有新增服务端语义分流、关键词规则或 phrasing 特判

#### Scenario: 审查某个 OpenSpec change
- **WHEN** 用户要求审查某个 Agent / prompt / tool 相关 change 是否违反抽象层级门禁
- **THEN** Codex MUST 使用抽象层级门禁 Skill
- **AND** Codex MUST 读取该 change 的 proposal、design、tasks 和相关 spec
- **AND** Codex MUST 对照 `AGENTS.md` 的 `Agent 修复方案抽象层级门禁` 和 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节输出审查结论

### Requirement: 门禁必须禁止 case-specific 生产规则
系统 SHALL 要求 Agent 修复方案不得把具体用户短句、具体 `toolName`、字段组合、phrasing 或业务实例名作为通用 prompt、runtime 或服务端生产规则的触发条件。

#### Scenario: 方案包含用户短句触发规则
- **WHEN** 修复方案包含“当用户说 X 时”或等价短句模板规则
- **THEN** Codex MUST 判定该方案违反抽象层级门禁
- **AND** Codex MUST 暂停执行
- **AND** Codex MUST 建议改为通用合同、tool 局部说明、observation、resource contract、repair 或回归测试层面的修复

#### Scenario: 方案包含具体 toolName 或字段组合触发规则
- **WHEN** 修复方案包含“当 `toolName = Y` 且字段 `Z = 某值` 时”或等价业务实例组合规则
- **THEN** Codex MUST 判定该方案违反抽象层级门禁，除非该业务名仅出现在 tool manifest、observation projection、resource contract 或回归测试中
- **AND** Codex MUST 暂停执行并指出具体业务名被放错的层级

#### Scenario: 方案新增服务端自然语言语义分流
- **WHEN** 修复方案要求服务端根据用户自然语言、关键词、正则、同义词、短句模板、历史摘要或 phrasing 改写 `action`、`toolName`、调用顺序、引用目标、调整目标或最终回答策略
- **THEN** Codex MUST 判定该方案违反抽象层级门禁
- **AND** Codex MUST 暂停执行

### Requirement: 违规审查必须输出暂停结论和修复层级
系统 SHALL 要求抽象层级门禁 Skill 在发现违规时输出固定暂停结构，包含违反条款、证据、问题层级、正确修复层级和继续条件。

#### Scenario: 发现违反门禁
- **WHEN** Codex 发现方案把失败证据、业务实例或测试样例错误升格为通用 prompt、runtime 或服务端生产规则
- **THEN** Codex MUST 输出 `结论：暂停执行`
- **AND** 输出 MUST 包含违反条款、证据、问题层级、正确修复层级和继续条件
- **AND** Codex MUST NOT 继续实施该修复方案，直到 proposal、design、tasks、实现方案或测试计划被调整

### Requirement: 通过审查必须输出可继续结论和语义分流检查
系统 SHALL 要求抽象层级门禁 Skill 在未发现违规时输出固定通过结构，明确抽象问题类型、通用合同修复、业务 tool 局部说明、回归测试样例和服务端语义分流检查。

#### Scenario: 未发现违反门禁
- **WHEN** Codex 完成抽象层级门禁审查且未发现违规
- **THEN** Codex MUST 输出 `结论：可继续`
- **AND** 输出 MUST 包含抽象问题类型、通用合同修复、业务 tool 局部说明、回归测试样例
- **AND** 输出 MUST 明确未新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支

### Requirement: Skill 必须保持职责边界
系统 SHALL 要求抽象层级门禁 Skill 不替代 Agent tool 变更治理或 Agent prompt 合同治理。

#### Scenario: 修复方案同时触发多个治理 Skill
- **WHEN** Agent 修复方案同时触碰 Agent tool / core / production 边界或模型实际可见输入
- **THEN** Codex MUST 使用抽象层级门禁 Skill 审查修复方案层级
- **AND** Codex MUST 继续使用 `agent-tool-change-governance` 判断可改模块和禁止模块
- **AND** Codex MUST 继续使用 `agent-prompt-contract-governance` 审查模型实际可见合同
