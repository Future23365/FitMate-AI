## REMOVED Requirements

### Requirement: Agent runtime 必须区分可消费资源和诊断资源

**Reason**: consumable/diagnostic 区分绑定旧 Agent runtime、旧 tool result id、旧 final result 引用校验、旧 trace projection 和旧 response writer。运行时 AI/Agent 逻辑删除后，该合同不再存在。

**Migration**: 删除旧 runtime resource role 合同。不得保留 resource role 字段、校验器或 replay fixture 作为当前运行时依赖。

### Requirement: Final result 引用校验必须按终止状态分层

**Reason**: 当前 final result 分层校验绑定旧 `generated/patched/answered/needs_clarification` 终止状态和旧 `AgentExecutionResult` union。

**Migration**: 删除旧 final result 引用校验、终止状态和相关恢复逻辑。不得为页面或测试伪造旧终止结果。

### Requirement: askClarification 必须稳定收口为 needs_clarification

**Reason**: 旧 `askClarification` 到 `needs_clarification` 的收口是旧 Agent tool 和旧 Response Writer 的实现细节。

**Migration**: 删除旧澄清工具、旧 `needs_clarification` 合同和旧澄清 stream 事件。当前运行时不保留 AI 澄清链路。

### Requirement: Agent trace 必须展示资源角色

**Reason**: 旧 trace 资源角色展示绑定旧 Agent trace event、旧 resource role、旧 runtime trace projection 和旧 dependency graph。

**Migration**: 删除旧 Agent trace 生产合同。历史 trace 页面可以保留壳或历史数据展示，但生产运行时不得继续写入旧 Agent resource role 字段。
