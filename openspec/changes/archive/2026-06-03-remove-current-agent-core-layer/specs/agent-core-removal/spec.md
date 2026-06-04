## ADDED Requirements

### Requirement: 运行时 AI/Agent 逻辑必须整体删除
系统 SHALL 删除生产代码中的旧 AI/Agent 执行逻辑，包括旧 Agent core、旧 tools、旧 Prompt、旧模型调用、旧 tool calling、旧 Response Writer、旧 AI trace 生产、旧 activity mapper、旧资源恢复和旧业务投影。

#### Scenario: 生产代码扫描运行时 AI/Agent 引用
- **WHEN** 实现本 change 后扫描生产代码
- **THEN** 生产代码 MUST NOT 导入或调用 `runAgentOrchestrator()`
- **AND** 生产代码 MUST NOT 依赖 `AgentExecutionResult`
- **AND** 生产代码 MUST NOT 依赖 `AgentToolRegistry`
- **AND** 生产代码 MUST NOT 生产或消费旧 `agent_execution_result`、`agent_tool_decision`、`agent_response_writer`、旧 dependency graph 或旧 `legacyPathSkip` 作为运行时合同
- **AND** 生产代码 MUST NOT 调用旧模型 provider、旧 Prompt module 或旧 Agent decision provider

#### Scenario: 旧 Agent core 文件被移除
- **WHEN** 实现本 change 后检查 `lib/server/agent-orchestrator/**`
- **THEN** 旧 runtime、旧 contracts、旧 context builder、旧 tools、旧 registry、旧 response writer 和旧 trace projection MUST 被删除
- **AND** 若目录仍存在，它 MUST NOT 包含旧 AI/Agent 运行时代码

### Requirement: `/api/chat` 不得保留 AI 执行能力
系统 SHALL 删除 `/api/chat` 的 AI 执行能力。聊天接口不得继续生成 AI 回复、执行 tool calling、生成 artifact、更新 AI summary、生产旧 Agent NDJSON 事件或写入旧 AI trace。

#### Scenario: 调用聊天接口
- **WHEN** 用户或页面调用现有聊天入口
- **THEN** 系统 MUST NOT 调用模型生成回答
- **AND** 系统 MUST NOT 调用旧 Agent core、旧 intent-first 路径、旧 readonly loop、旧 trigger parser 或旧 Response Writer
- **AND** 系统 MUST NOT 返回伪造的 `AgentExecutionResult`、tool result、dependency graph、legacy skip 或旧 Agent 可恢复错误

#### Scenario: 接口需要保留非 AI 响应
- **WHEN** 实现为了页面壳保留 route 或请求校验
- **THEN** 响应 MUST 是普通非 AI 的不可用或禁用状态
- **AND** 响应 MUST NOT 使用旧 Agent stream、旧模型结果、旧 artifact 事件或旧 trace final decision

### Requirement: 页面壳必须保留但断开旧 AI 调用
系统 SHALL 保留现有页面和组件壳，但页面不得继续依赖旧 AI 接口、旧 Agent stream、旧 trace 生产或旧核心链路事件。

#### Scenario: 聊天页面保留
- **WHEN** 用户打开聊天相关页面
- **THEN** 页面结构、布局和非 AI 本地状态 MAY 保留
- **AND** 页面 MUST NOT 触发旧 AI 接口函数、旧 stream parser、旧 Agent event handler 或隐藏模型调用

#### Scenario: Dev trace 页面保留
- **WHEN** 开发者打开 trace/debug 相关页面
- **THEN** 页面 MAY 保留历史数据展示或静态壳
- **AND** 页面 MUST NOT 要求生产运行时继续写入旧 Agent event、旧 loop state、旧 dependency graph 或旧 response writer 字段

### Requirement: 保留范围必须限制为文档和公共非 AI 能力
系统 SHALL 保留历史文档和真正公共、非 AI、无旧 Agent 业务逻辑的领域模块。除文档外，任何包含旧 AI/Agent 业务包装、旧 tool 语义、旧执行合同或旧投影逻辑的代码 MUST 被删除或拆出纯公共能力后删除耦合部分。

#### Scenario: 公共领域服务仍可独立导入
- **WHEN** 自动化测试导入动作库、训练校验、conversation artifact、policy/confirmation、user memory 或数据库访问服务
- **THEN** 这些服务 MAY 继续存在
- **AND** 这些服务 MUST NOT 依赖旧 AI/Agent 运行时才能运行
- **AND** 这些服务 MUST NOT 暴露旧 Agent tool wrapper、旧 `AgentExecutionResult` 或旧 tool result 合同

#### Scenario: 模块包含旧业务逻辑
- **WHEN** 某个模块同时包含公共能力和旧 AI/Agent 业务逻辑
- **THEN** 实现 MUST 删除旧 AI/Agent 部分
- **AND** 若公共能力无法清晰拆出，实现 SHOULD 删除整个非公共模块

#### Scenario: 历史文档被扫描
- **WHEN** 扫描 `docs/**`、OpenSpec archive 或方案历史
- **THEN** 历史文档 MAY 继续包含旧 Agent 描述
- **AND** 这些历史描述 MUST NOT 被视为运行时兼容要求

### Requirement: 旧核心链路测试和 fixture 必须删除
系统 SHALL 删除依赖旧 AI/Agent 核心链路的测试、fixture、manual LLM runner 和黑盒断言。旧测试不得改造成兼容测试，也不得作为当前运行时资产保留。

#### Scenario: 旧测试被扫描
- **WHEN** 测试或 fixture 断言旧 `AgentExecutionResult`、旧 `generated/patched` 收口、旧 tool result id、旧 response writer 字段、旧 dependency graph、旧 `agent_execution_result` 或旧 trace event
- **THEN** 这些测试或 fixture MUST 被删除
- **AND** 当前 change 的验收 MUST 聚焦旧 AI/Agent 运行时缺席和公共非 AI 服务可导入

#### Scenario: Manual LLM 黑盒目录被扫描
- **WHEN** 扫描 manual LLM runner、assertions、fixtures 或报告逻辑
- **THEN** 依赖旧 Agent/LLM 执行的代码 MUST 被删除
- **AND** 仅作为文档保存的历史说明 MAY 保留在文档目录中

### Requirement: 不得保留兼容层或伪造旧事件
系统 SHALL 禁止通过兼容 adapter、fallback、mock runtime 或伪造事件保留旧 AI/Agent 行为。

#### Scenario: 旧调用方仍存在
- **WHEN** 实现发现页面、测试或服务仍调用旧 AI/Agent 接口
- **THEN** 实现 MUST 删除或断开调用方
- **AND** 实现 MUST NOT 新增兼容 adapter 返回伪造的旧 Agent 结果

#### Scenario: 其他 open changes 仍引用旧 core
- **WHEN** 其他 open changes 的文档仍引用旧 `lib/server/agent-orchestrator/**` 或旧 Agent 合同
- **THEN** 本 change MUST NOT 为它们保留运行时代码
- **AND** 这些 changes 的去留由人工另行决定
