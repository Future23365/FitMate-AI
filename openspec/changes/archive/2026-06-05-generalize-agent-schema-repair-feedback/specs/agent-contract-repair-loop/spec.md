## ADDED Requirements

### Requirement: schema repair feedback 必须由通用错误投影器生成
系统 SHALL 在模型输出违反 `AgentAction`、tool input 或 terminal visible output envelope 的结构合同时，通过通用 schema error projector 生成模型可见 repair feedback。Projector MUST 只使用 schema、discriminator、validator issue、字段路径和脱敏实际值等确定性输入，不得依赖用户自然语言、业务 phrasing、具体 trace case 或手写 tool 特判。

#### Scenario: AgentAction variant 缺少必填字段
- **WHEN** 模型返回一个 discriminator 可确定的 `AgentAction` variant
- **AND** 该 variant 缺少 schema 必填字段
- **THEN** repair feedback MUST 包含 `target.kind = "AgentAction"` 或等价定位
- **AND** feedback MUST 包含已确定的 `variant`
- **AND** feedback MUST 包含 `errors[]` 项，且 `code = "required_field_missing"`
- **AND** 该 error MUST 包含缺失字段的 `path` 和安全 `expected`
- **AND** feedback MUST NOT 用自然语言解释该字段的业务语义
- **AND** feedback MUST NOT 要求服务端替模型补齐或转换字段

#### Scenario: AgentAction 包含未知字段
- **WHEN** 模型返回的 `AgentAction` variant 中包含当前 schema 不允许的字段
- **THEN** repair feedback MUST 包含 `errors[]` 项，且 `code = "unknown_field"`
- **AND** 该 error MUST 包含未知字段的 `path`
- **AND** 该 error SHOULD 包含当前 variant 的 `allowedFields`
- **AND** feedback MUST NOT 把未知字段映射成另一个字段
- **AND** feedback MUST NOT 根据字段名推断模型原本意图

#### Scenario: discriminator 无法选择合法 variant
- **WHEN** 模型返回的 action、tool input 子结构或 visible output envelope 无法通过 discriminator 选择合法 variant
- **THEN** repair feedback MUST 包含 `errors[]` 项，且 `code = "invalid_discriminator"` 或 `code = "invalid_union_variant"`
- **AND** error MUST 包含 discriminator `path`
- **AND** error MUST 包含安全 `actual`
- **AND** error SHOULD 包含 `allowedValues`
- **AND** runtime MUST NOT 基于用户原文或字段组合替模型选择 variant

#### Scenario: 新增 tool 自动获得字段级 repair facts
- **WHEN** 系统注册一个新的 Agent tool
- **AND** 该 tool 暴露有效 `inputSchema`
- **AND** 模型调用该 tool 但 input 未通过 schema 校验
- **THEN** repair feedback MUST 由同一个 schema error projector 生成
- **AND** feedback MUST 使用该 tool 的 schema 定位 `target.toolName`
- **AND** feedback MUST 包含字段级 `errors[]`
- **AND** 实现 MUST NOT 为该 tool 新增专门 repair feedback 分支才能表达缺字段、未知字段、类型错误或枚举错误

#### Scenario: 旧字段只作为 schema 错误事实出现
- **WHEN** 模型输出当前合同不再允许的旧字段
- **AND** 当前 schema 已经不接受该字段
- **THEN** repair feedback MUST 将旧字段表达为 `unknown_field`
- **AND** 如果主字段缺失，feedback MUST 另外表达 `required_field_missing`
- **AND** feedback MUST NOT 包含固定旧字段到新字段的替换文案
- **AND** feedback MUST NOT 静默接受、删除、转换或长期兼容该旧字段

### Requirement: domain validation feedback 只能承载确定性事实
系统 SHALL 在业务 validator 发现 terminal visible output 或 tool result 违反数据库事实、资源事实或业务确定性边界时，向 repair loop 暴露结构化 domain facts。Domain facts MUST 描述 validator 已确定的错误事实，不得描述模型下一步必须如何修复。

#### Scenario: terminal visible output 引用事实不合法
- **WHEN** terminal visible output 通过静态 envelope schema
- **AND** domain validator 判定其中某个字段违反数据库事实或当前可见资源事实
- **THEN** repair feedback MUST 包含失败字段 `path`
- **AND** feedback MUST 包含稳定 `code`
- **AND** feedback SHOULD 包含安全 `actual`、`expected`、`allowedValues` 或 `resourceRef`
- **AND** feedback MUST NOT 包含完整数据库对象、完整 handler payload、secret、stack trace 或跨用户事实
- **AND** feedback MUST NOT 包含固定自然语言恢复方向

#### Scenario: domain validator 不返回下一步 tool 建议
- **WHEN** domain validator 生成可恢复错误 facts
- **THEN** feedback MUST NOT 包含 `repair`、`recoveryDirections`、`recoverableActions`、`nextToolName` 或等价模型可见下一步建议字段
- **AND** feedback MUST NOT 要求模型必须调用某个具体 tool
- **AND** runtime MUST 继续让模型基于当前 prompt、manifest、facts 和用户目标自行决定下一轮合法 action

#### Scenario: repair facts 不替代下一轮校验
- **WHEN** runtime 将 schema errors 或 domain facts 写入下一轮模型可见上下文
- **THEN** runtime MUST 在下一轮继续校验 schema、toolName、tool input、resource、policy、grounding 和 terminal visible output
- **AND** runtime MUST NOT 因上一轮 feedback 已经指出错误而接受未校验的模型输出
- **AND** runtime MUST NOT 从 feedback facts 推导或写入未经模型输出的业务 action

### Requirement: 模型可见 prompt 必须解释通用 repair facts
系统 SHALL 在默认 Agent prompt 或等价 model input 中提供稳定说明，解释模型如何读取通用 schema errors 和 domain facts。该说明 MUST 是全局合同解释，不得由 runtime 针对单次错误动态拼接业务修复文案。

#### Scenario: 模型看到 schema repair facts
- **WHEN** 下一轮模型请求包含上一轮 `schema_validation_failed` 或等价 repair feedback
- **THEN** model input MUST 包含通用说明，引导模型先读取 `target`、`errors[].path`、`errors[].code`、`expected`、`allowedFields`、`requiredFields` 和 `allowedValues`
- **AND** model input MUST 引导模型对照当前可见 schema / manifest 重新输出合法 action
- **AND** model input MUST NOT 依赖 runtime 为每个错误生成固定业务解释

#### Scenario: 模型看到 domain facts
- **WHEN** 下一轮模型请求包含 domain validator facts
- **THEN** model input MUST 说明这些 facts 是确定性错误事实
- **AND** model input MUST 引导模型基于当前可见 tool、资源和用户目标自行选择合法修复动作
- **AND** model input MUST NOT 把 facts 描述成服务端指定的下一步业务流程
