## MODIFIED Requirements

### Requirement: 系统必须提供只读 LLM Tool Registry

系统 SHALL 将现有只读 LLM Tool Registry 升级为统一 `AgentToolRegistry`。Registry SHALL 同时支持读工具、规划工具、校验工具和受控写工具；所有工具仍必须在服务端执行 Schema、权限、摘要和 trace 边界。

#### Scenario: 注册 Agent 工具
- **WHEN** 服务端启动或构建聊天编排工具集合
- **THEN** registry MUST 至少包含 `listRecentArtifacts`、`searchArtifacts`、`getArtifactPayload`、`searchExercises`、`getExerciseById`、`proposeWorkoutPatch`、`validateWorkoutPatch`、`generateRoutineDraft`、`validateRoutineDraft`、`saveConversationArtifactRevision` 和 `askClarification` 或等价工具
- **AND** 每个工具 MUST 声明名称、描述、输入 Schema、输出摘要策略、Trace 摘要策略、执行函数和读写级别
- **AND** 写工具 MUST 声明其前置校验依赖和可写范围

#### Scenario: 工具名称不在 registry 中
- **WHEN** LLM 请求调用未注册工具
- **THEN** 系统 MUST 拒绝执行该工具
- **AND** 系统 MUST 记录可诊断错误
- **AND** 系统 MUST NOT 将未知工具请求转发到任意服务端函数

### Requirement: 写能力不得通过只读 tool loop 暴露给 LLM

系统 SHALL 废弃“只读 tool loop 不能参与写决策”的主链限制。写能力 MAY 通过统一 Agent tool loop 暴露给 LLM，但 MUST 以受控写工具形式执行，并且每次写入都必须经过 Schema、权限、候选集合、Validator、Policy、Confirmation 和 Persistence 边界。

#### Scenario: LLM 请求执行写操作
- **WHEN** LLM 通过 Agent 工具请求创建 draft、应用 Patch、保存 artifact revision、记录训练变更或修改未来安排
- **THEN** 对应写工具 MUST 校验其输入和前置 tool result
- **AND** 写工具 MUST 拒绝越权、候选外、未校验、未确认或超出 scope 的写入
- **AND** 写工具 MUST 返回结构化成功、失败或需要确认结果

#### Scenario: 工具 registry 被测试检查
- **WHEN** 自动化测试枚举 Agent registry
- **THEN** 测试 MUST 断言每个写工具都有 Schema、权限上下文、前置校验声明、trace 摘要和失败路径
- **AND** 测试 MUST 断言不存在任意 SQL、任意函数调用或绕过 Validator/Policy 的写工具

## ADDED Requirements

### Requirement: Agent tool loop 不得因旧只读预算跳过必要查询

系统 SHALL 保留最大步骤、超时和异常回退，但不得因为 token 成本或旧只读工具触发矩阵跳过完成用户请求所必需的事实查询。

#### Scenario: 多轮调整需要读取 artifact
- **WHEN** 用户请求调整已有训练内容
- **THEN** Agent MUST 能调用 recent artifact 和 payload 读取工具
- **AND** 系统 MUST NOT 因旧只读 tool loop 关闭、旧触发矩阵不匹配或 token 裁剪策略跳过必要查询

