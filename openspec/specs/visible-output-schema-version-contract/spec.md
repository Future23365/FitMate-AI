# visible-output-schema-version-contract Specification

## Purpose
TBD - created by archiving change extend-visible-proposal-reference-tool. Update Purpose after archive.
## Requirements
### Requirement: visibleOutputs schemaVersion 必须使用字符串合同
`final_answer.visibleOutputs[].schemaVersion` SHALL 使用字符串版本合同。`visibleTrainingProposal` 的 visible output envelope MUST 使用 `schemaVersion = "1"`。模型可见 prompt、schema summary、examples、业务 observations 和 compressed tool results MUST NOT 引导模型输出数字 `1` 作为 visible output schemaVersion。通用 `agent-core` repair feedback SHALL 只表达 `schemaVersion` 的字符串类型边界，不硬编码具体业务 outputType 的版本值。

#### Scenario: 模型输出 visibleTrainingProposal
- **WHEN** 模型输出 `final_answer.visibleOutputs[]`
- **AND** visible output 使用 `outputType = "visibleTrainingProposal"`
- **THEN** visible output MUST 使用 `schemaVersion = "1"`
- **AND** `schemaVersion` MUST 是字符串
- **AND** `payload` MUST 承载训练方案业务结构

#### Scenario: prompt 使用字符串版本
- **WHEN** 系统构造 Agent system prompt、tool manifest、schema summary、examples 或 final grounding 说明
- **THEN** 所有描述 `visibleOutputs[].schemaVersion` 的模型可见内容 MUST 使用 `"1"` 表达字符串版本
- **AND** 模型可见内容 MUST NOT 使用 `schemaVersion = 1`、`schemaVersion: 1` 或等价数字示例引导模型复制

#### Scenario: 数字版本触发 repair
- **WHEN** 模型输出 `visibleOutputs[].schemaVersion` 为数字 `1`
- **THEN** `AgentAction` 或 terminal output validation MUST 拒绝该 action
- **AND** 通用 repair feedback MUST 明确指出该字段应为字符串
- **AND** 通用 `agent-core` repair feedback MUST NOT 硬编码 `visibleTrainingProposal` 的业务版本 `"1"`
- **AND** `visibleTrainingProposal` 的业务模型可见合同 MUST 继续声明该 outputType 使用字符串 `"1"`
- **AND** runtime MUST NOT 为了兼容该错误而自动把数字转换为字符串后继续执行

### Requirement: 模型可见事实版本不得误导 visible output 版本
系统 SHALL 区分服务端内部事实存储版本和模型需要输出的 visible output envelope 版本。模型可见 `list_recent` / `read_recent` observation 不得把内部数字事实版本以泛名 `schemaVersion` 暴露成可复制的 visible output 字段。

#### Scenario: list_recent / read_recent observation 暴露版本信息
- **WHEN** `inspectVisibleTrainingProposals` 的 `list_recent` 或 `read_recent` 向模型投影事实摘要
- **THEN** 如模型可见内容暴露 visible output 版本，字段 MUST 使用 `visibleOutputSchemaVersion = "1"`
- **AND** 如模型可见内容暴露事实存储版本，字段 MUST 使用 `factSchemaVersion = 1`
- **AND** 模型可见内容 MUST 说明 `factSchemaVersion` 是服务端事实存储版本，不应复制到 `final_answer.visibleOutputs[].schemaVersion`

#### Scenario: schemaVersion 名称不混用
- **WHEN** 模型可见 prompt、examples、observations 或 compressed tool results 同时涉及事实版本和 visible output 版本
- **THEN** visible output 版本 MUST 使用 `visibleOutputSchemaVersion` 或直接示例 `"schemaVersion": "1"`
- **AND** 内部事实版本 MUST 使用 `factSchemaVersion` 或等价非 envelope 字段名
- **AND** 模型可见内容 MUST NOT 在同一上下文中把数字事实版本写成可复制的 `visibleOutputs[].schemaVersion`

### Requirement: schemaVersion 合同必须具备自动化验证
系统 SHALL 为 `visibleOutputs[].schemaVersion` 字符串合同提供 prompt、validator、repair 和 production chat 回归测试。

#### Scenario: Prompt 和 manifest 测试
- **WHEN** 测试读取默认 Agent prompt、production tool manifest、schema summary、examples 和 repair feedback
- **THEN** tests MUST 断言模型可见内容包含 `schemaVersion = "1"` 或等价 JSON 字符串示例
- **AND** tests MUST 断言模型可见内容不包含引导 visible output 使用数字 `schemaVersion = 1` 的说明

#### Scenario: Validator 和 repair 测试
- **WHEN** 测试向 validator 输入 `schemaVersion: 1`
- **THEN** tests MUST 断言校验失败
- **AND** tests MUST 断言通用 repair feedback 指向字符串类型
- **AND** tests MUST 断言通用 repair feedback 不硬编码业务版本 `"1"`
- **AND** tests MUST 断言 `schemaVersion: "1"` 可以进入后续 terminal output validation

#### Scenario: 生产聊天回归
- **WHEN** production chat replay 模拟模型先输出数字 `schemaVersion`
- **THEN** runtime MUST 通过结构化 repair 要求模型修正为字符串
- **AND** 模型可见业务合同 MUST 继续提供 `visibleTrainingProposal` 的字符串版本 `"1"`
- **AND** 模型修正后 MUST 能继续输出合法 `visibleTrainingProposal`
- **AND** 用户响应 MUST 不暴露内部 schema 错误细节

