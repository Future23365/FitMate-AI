## REMOVED Requirements

### Requirement: Agent runtime 必须区分可消费资源和诊断资源

**Reason**: consumable/diagnostic 区分是有价值经验，但当前 requirement 绑定旧 Agent runtime、旧 tool result id 和旧 final result 引用校验。

**Migration**: 删除旧 runtime 合同；后续新 core 重新定义 resource role、resource id、resource contract 和 replay fixture。

### Requirement: Final result 引用校验必须按终止状态分层

**Reason**: 当前 final result 分层校验绑定旧 `generated/patched/answered/needs_clarification` 终止状态。

**Migration**: 删除旧终止状态校验；后续新 Response Adapter 和终止 action schema 重新定义结果引用规则。

### Requirement: askClarification 必须稳定收口为 needs_clarification

**Reason**: 旧 `askClarification` 到 `needs_clarification` 的收口是当前 Agent result union 的实现细节。

**Migration**: 后续新 core 重新定义澄清 action，不继承旧 `needs_clarification` 作为必需终止类型。

### Requirement: Agent trace 必须展示资源角色

**Reason**: 旧 trace 资源角色展示绑定旧 Agent trace event、旧 resource role 和旧 runtime trace projection。

**Migration**: 保留资源角色展示经验；后续新 trace contract 重新定义字段、角色和 replay 方式。
