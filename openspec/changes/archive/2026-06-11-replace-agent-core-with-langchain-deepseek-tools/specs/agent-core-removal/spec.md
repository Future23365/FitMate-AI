## MODIFIED Requirements

### Requirement: 运行时 AI/Agent 逻辑必须整体删除
系统 SHALL 删除生产代码中的旧自研 Agent 执行逻辑，包括当前 `agent-core`、旧 `agent-planners`、旧 `AgentAction`、旧 ToolRegistry、旧 PlannerPort、旧 Executor、旧 ResourceStore 主链、旧 Response Renderer 主链、旧 AI trace 生产绑定、旧 activity mapper、旧 resource repair 和旧业务投影。系统 SHALL 允许新的 LangChain Agent Runtime 作为生产 AI/Agent 主链存在。

#### Scenario: 生产代码扫描旧自研 Agent 引用
- **WHEN** 实现本 change 后扫描生产代码
- **THEN** 生产 `/api/chat` MUST NOT 导入或调用旧 `runAgentRuntime()`
- **AND** 生产代码 MUST NOT 依赖旧 `AgentAction`
- **AND** 生产代码 MUST NOT 依赖旧 `PlannerPort`
- **AND** 生产代码 MUST NOT 依赖旧 `ToolRegistry`
- **AND** 生产代码 MUST NOT 依赖旧 Response Renderer 主链
- **AND** 生产代码 MUST NOT 生产或消费旧 `planner_action`、旧 `duplicate_tool_call`、旧 AgentAction repair feedback 或旧 resource refs 作为运行时合同
- **AND** 生产代码 MAY 使用新的 LangChain Agent Runtime、LangChain tool wrappers 和 DeepSeek native `tool_calls`

#### Scenario: 旧 Agent core 文件被移除
- **WHEN** 实现本 change 后检查 `lib/server/agent-core/**` 和 `lib/server/agent-planners/**`
- **THEN** 旧 runtime、旧 contracts、旧 action validator、旧 tool registry、旧 executor、旧 response renderer、旧 planner adapter、旧 replay planner 和旧 trace projection MUST 被删除
- **AND** 若目录仍存在，它 MUST NOT 包含生产可导入的旧自研 Agent runtime 代码

### Requirement: `/api/chat` 不得保留 AI 执行能力
系统 SHALL 删除 `/api/chat` 的旧自研 AI 执行能力。聊天接口 MUST NOT 继续使用旧 Agent core、旧 intent-first 路径、旧 readonly loop、旧 trigger parser、旧 Response Writer 或旧 Agent NDJSON 事件。聊天接口 MAY 使用新的 LangChain Agent Runtime 生成 AI 回复、执行 LangChain tools、生成通过 validator 的结构化输出、记录新 trace 并返回受控 NDJSON 事件。

#### Scenario: 调用聊天接口
- **WHEN** 用户或页面调用现有聊天入口
- **THEN** 系统 MUST NOT 调用旧 Agent core、旧 intent-first 路径、旧 readonly loop、旧 trigger parser 或旧 Response Writer
- **AND** 系统 MUST NOT 返回伪造的旧 `AgentAction`、旧 tool result、旧 resource ref、旧 dependency graph 或旧 Agent 可恢复错误
- **AND** 系统 MAY 调用 LangChain Agent Runtime
- **AND** 响应 MUST 由新的 production response adapter 投影为 NDJSON 白名单事件

#### Scenario: 接口缺少 LangChain 或 DeepSeek 配置
- **WHEN** `/api/chat` 无法构造生产 LangChain Agent Runtime
- **THEN** 响应 MUST 返回稳定配置错误
- **AND** 响应 MUST NOT 回退旧 self-hosted Agent core
- **AND** 响应 MUST NOT 返回旧 `chat_ai_disabled` 作为正常成功路径

### Requirement: 旧核心链路测试和 fixture 必须删除
系统 SHALL 删除依赖旧自研 Agent core 的测试、fixture、manual runner 和黑盒断言。旧测试不得改造成兼容测试，也不得作为当前运行时资产保留。

#### Scenario: 旧测试被扫描
- **WHEN** 测试或 fixture 断言旧 `AgentAction`、旧 `AgentRunResult`、旧 tool result id、旧 response renderer 字段、旧 resource refs、旧 `planner_action` 或旧 trace event
- **THEN** 这些测试或 fixture MUST 被删除或重写为 LangChain runtime / tool wrapper / response adapter 测试
- **AND** 当前 change 的验收 MUST 覆盖旧 self-hosted Agent core 缺席和新 LangChain runtime 行为

#### Scenario: Manual LLM 黑盒目录被扫描
- **WHEN** 扫描 manual LLM runner、assertions、fixtures 或报告逻辑
- **THEN** 依赖旧 AgentAction / PlannerPort / ToolRegistry 执行的代码 MUST 被删除或迁移到 LangChain `/api/chat` 黑盒执行面
- **AND** 仅作为文档保存的历史说明 MAY 保留在文档目录中

## REMOVED Requirements

### Requirement: 不得保留兼容层或伪造旧事件
**Reason**: 该 requirement 的方向仍然正确，但需要并入新的旧 core 删除和 LangChain response adapter 要求，以避免被误读成禁止新 AI 主链。

**Migration**: 使用本 spec 的修改后 requirement 和 `langchain-agent-runtime` 中旧 core 缺席要求替代。
