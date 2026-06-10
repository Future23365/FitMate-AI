## MODIFIED Requirements

### Requirement: schema repair feedback 必须由通用错误投影器生成
系统 SHALL 在模型输出违反 `AgentAction`、tool input 或 terminal visible output envelope 的结构合同时，通过通用 schema error projector 生成模型可见 repair feedback。Projector MUST 只使用 schema、discriminator、validator issue、字段路径和脱敏实际值等确定性输入，不得依赖用户自然语言、业务 phrasing、具体 trace case 或手写 tool 特判。若 `AgentAction` 顶层未知字段已被 type-aware normalization 安全丢弃且 normalized action 可执行，系统 SHALL NOT 为这些被丢弃字段生成 repair feedback。

#### Scenario: AgentAction variant 缺少必填字段
- **WHEN** 模型返回一个 discriminator 可确定的 `AgentAction` variant
- **AND** 该 variant 缺少 schema 必填字段
- **THEN** repair feedback MUST 包含 `target.kind = "AgentAction"` 或等价定位
- **AND** feedback MUST 包含已确定的 `variant`
- **AND** feedback MUST 包含 `errors[]` 项，且 `code = "required_field_missing"`
- **AND** 该 error MUST 包含缺失字段的 `path` 和安全 `expected`
- **AND** feedback MUST NOT 用自然语言解释该字段的业务语义
- **AND** feedback MUST NOT 要求服务端替模型补齐或转换字段

#### Scenario: AgentAction 顶层未知字段被 normalization 安全丢弃
- **WHEN** 模型返回的 `AgentAction` variant 中包含当前 variant 不允许的顶层字段
- **AND** 这些字段不参与 selected variant 的执行语义
- **AND** selected variant 的 required fields 均存在
- **AND** normalized action 通过后续 schema、registry、tool input、policy、resource 或 terminal 校验
- **THEN** runtime MUST NOT 为这些被丢弃字段生成 `unknown_field` repair feedback
- **AND** runtime MUST NOT 消耗 repair budget
- **AND** runtime MUST 继续执行 normalized action
- **AND** runtime MUST NOT 将被丢弃字段映射成另一个字段或用来补齐 required fields

#### Scenario: AgentAction 包含不可安全处理的未知字段
- **WHEN** 模型返回的 `AgentAction` variant 中包含当前 schema 不允许的字段
- **AND** 该字段不符合 type-aware normalization 的丢弃条件
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
- **AND** 该字段未被 type-aware normalization 作为 selected variant 的无关顶层字段安全丢弃
- **THEN** repair feedback MUST 将旧字段表达为 `unknown_field`
- **AND** 如果主字段缺失，feedback MUST 另外表达 `required_field_missing`
- **AND** feedback MUST NOT 包含固定旧字段到新字段的替换文案
- **AND** feedback MUST NOT 静默接受、转换或长期兼容该旧字段
