## ADDED Requirements

### Requirement: 当前 Agent 核心层必须删除
系统 SHALL 删除当前作为生产 `/api/chat` 执行基础的 Agent 核心层，包括旧 runtime、旧 contracts、旧 context builder、旧 tool registry、旧 Agent tools、旧 response writer 和旧 final result projection。

#### Scenario: 生产聊天路径扫描旧核心层
- **WHEN** 实现本 change 后扫描生产 `/api/chat`、聊天服务和服务端流式响应路径
- **THEN** 生产路径 MUST NOT 导入或调用 `runAgentOrchestrator()`
- **AND** 生产路径 MUST NOT 依赖旧 `AgentExecutionResult`
- **AND** 生产路径 MUST NOT 依赖旧 Agent response writer 或旧 tool registry

#### Scenario: 旧 Agent core 文件被移除
- **WHEN** 实现本 change 后检查 `lib/server/agent-orchestrator/**`
- **THEN** 旧 runtime、旧 contracts、旧 tools、旧 response writer 和旧 trace projection MUST 被删除
- **AND** 若目录仍存在，它 MUST 只包含后续新 core 明确创建的文件

### Requirement: 删除范围必须排除底层领域服务
系统 SHALL 保留底层健身领域服务和数据访问服务，不得把删除旧 Agent core 扩大为删除动作库、训练校验、artifact 持久化、policy/confirmation、user memory 或数据库模型。

#### Scenario: 领域服务仍可被导入
- **WHEN** 自动化测试导入动作检索、训练校验、conversation artifact、policy/confirmation 和 user memory 服务
- **THEN** 这些服务 MUST 继续存在
- **AND** 这些服务 MUST NOT 依赖旧 Agent core 才能运行

#### Scenario: Agent 包装层被删除
- **WHEN** 领域服务曾经通过旧 Agent tool 外壳暴露
- **THEN** 实现 MUST 删除旧 Agent tool 外壳
- **AND** 实现 MUST 保留外壳下方可复用的领域服务

### Requirement: `/api/chat` 不得接回旧 Agent core
系统 SHALL 保留 `/api/chat` 的请求校验、认证、hydration、NDJSON 协议和 trace id 边界，但不得用旧 Agent core、旧 intent-first 路径、standalone readonly loop 或旧 trigger parser 继续支撑业务。

#### Scenario: 新 core 尚未接入
- **WHEN** 用户调用 `/api/chat` 且新 Agent core 尚未实现
- **THEN** 系统 MAY 返回明确的可恢复服务不可用结果
- **AND** 系统 MUST NOT 调用旧 Agent core 生成回答、卡片或 artifact 事件

#### Scenario: 生产路径存在旧导入
- **WHEN** 架构扫描发现 `/api/chat` 生产路径导入旧 Agent core、旧 readonly loop、旧 trigger parser 或旧 intent-first 模块
- **THEN** 验收 MUST 失败

### Requirement: 旧 Agent tools 必须整体删除
系统 SHALL 删除当前旧 Agent tools，而不是在旧 tool 外壳上继续叠加新 manifest、schema 或业务修补逻辑。后续新 tools MUST 按单一职责重新定义。

#### Scenario: 旧 tool name 不再作为生产合同
- **WHEN** 实现本 change 后扫描生产代码和当前 OpenSpec 主规格
- **THEN** 旧 tool name MUST NOT 作为生产执行合同存在
- **AND** 旧 tool name MAY 只作为历史 trace、测试 fixture 或迁移说明文本出现

#### Scenario: 新工具等待后续 change
- **WHEN** 后续 change 开始实现新 Agent tools
- **THEN** 新工具 MUST 重新声明 input schema、output schema、resource contract、policy contract 和 response adapter contract
- **AND** 新工具 MUST NOT 继承旧 Agent tool 外壳的业务耦合

### Requirement: 旧测试必须转为删除验证或新 core 验收语料
系统 SHALL 删除依赖旧 Agent core 行为的测试断言，或将其改为旧核心层缺席断言。黑盒 LLM 场景文本 MAY 保留为后续新 core 的验收语料，但不得继续要求旧 final result、旧 tool result id 或旧 response writer 字段。

#### Scenario: 旧行为测试被扫描
- **WHEN** 测试断言旧 `AgentExecutionResult`、旧 `generated/patched` 收口、旧 tool result id 或旧 response writer 字段
- **THEN** 这些断言 MUST 被删除或替换为新 core 后续验收
- **AND** 当前 change 的验收 MUST 聚焦旧核心层不可被生产路径导入

#### Scenario: 黑盒场景被保留
- **WHEN** 黑盒 LLM 场景文本用于后续新 core 设计
- **THEN** 场景 MAY 保留用户问题、期望业务结果和 trace 经验
- **AND** 场景 MUST NOT 要求旧 Agent core 的内部事件形态

### Requirement: Trace/debug 不得依赖旧 Agent event
系统 SHALL 移除生产 trace/debug 对旧 Agent runtime event、旧 `agent_execution_result` 结构和旧 activity mapper 的依赖。后续新 core 的 trace contract MUST 重新定义。

#### Scenario: 旧 trace event 缺席
- **WHEN** 实现本 change 后检查 trace/debug 数据生产路径
- **THEN** 生产路径 MUST NOT 继续要求旧 `agent_execution_result`、旧 loop state 或旧 tool dependency graph 字段
- **AND** trace/debug MAY 保留历史记录展示兼容，但不得作为生产执行依赖

#### Scenario: 新 trace contract 尚未建立
- **WHEN** 新 Agent core 尚未实现
- **THEN** trace/debug MUST 能表达“新 core 未接入”或“聊天 AI 暂不可用”的状态
- **AND** trace/debug MUST NOT 伪造旧 Agent event
