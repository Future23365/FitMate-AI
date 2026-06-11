## MODIFIED Requirements

### Requirement: 新增业务 tool 必须默认只扩展 tool bundle
系统 SHALL 将新增业务 Agent tool 的默认路径限定为新增或修改 LangChain tool wrapper、生产 tool catalog 注册、模型可见 tool description / schema、服务端领域 service 接线和 contract tests，不得默认修改 LangChain runtime 主流程或 `/api/chat` 生产路由。

#### Scenario: 新增业务 tool
- **WHEN** 后续 change 新增真实业务 Agent tool
- **THEN** 实现 MUST 优先只新增或修改 LangChain tool wrapper、input schema、output / summary schema、policy metadata、handler、model-visible summary、user projection、trace summary、production tool catalog 注册和 tool contract 测试
- **AND** 实现 MUST NOT 默认修改 LangChain runtime 主流程、model factory、production response adapter 主流程或 `/api/chat` 主链路
- **AND** 实现 MUST NOT 在服务端增加关键词意图分流、自然语言模板分流或 runtime 内具体业务 phrasing 分支

#### Scenario: 新 tool 需要 runtime 变更
- **WHEN** 新增 tool 无法在现有 LangChain tool wrapper contract 下工作
- **THEN** 后续 change design MUST 说明该需求是单个 tool 特例、多个无关 tool 的通用需求，还是安全、权限、resource、trace、stream 或 structured output 协议问题
- **AND** 单个 tool 特例 MUST 优先通过调整 tool wrapper contract 解决
- **AND** 多个无关 tool 的通用需求 MUST 抽象为 LangChain runtime 通用扩展点并补 contract tests
- **AND** 涉及安全、权限、resource、trace 或 stream 协议的需求 MUST 回到 core contract 统一设计，不能开业务特例

## ADDED Requirements

### Requirement: Agent tool 治理必须禁止重引入旧 Agent Core
系统 SHALL 要求后续 Agent tool / runtime / production 接入变更不得重新引入旧 `AgentAction`、旧 `PlannerPort`、旧 `ToolRegistry`、旧 `runAgentRuntime()` 或旧 Response Renderer。

#### Scenario: 后续 Agent tool change 开始
- **WHEN** 开发者或 Codex 准备新增或修改 Agent tool
- **THEN** 实现前 MUST 检查目标是否扩展 LangChain tool wrapper
- **AND** 实现前 MUST 明确不会修改旧 `agent-core` 或恢复旧自研 AgentAction loop
- **AND** 如果必须触碰生产 runtime 主流程，OpenSpec design MUST 说明通用扩展点、允许触碰模块、禁止触碰模块和验证计划

#### Scenario: 架构扫描发现旧 core 引用
- **WHEN** 后续 Agent tool change 完成
- **THEN** 自动化扫描 MUST 证明 production `/api/chat` 和 LangChain runtime 没有导入旧 `agent-core`、旧 `agent-planners`、旧 `ToolRegistry` 或旧 `AgentAction`
- **AND** 若发现旧引用，change MUST 在提交前修正或明确标记为不允许合入的阻塞风险

### Requirement: LangChain tool 变更必须检查模型可见描述语言
系统 SHALL 要求新增或修改 LangChain tool 时检查所有进入 DeepSeek native tools 的描述性自然语言，确保默认使用中文并保留英文技术标识。

#### Scenario: 新增或修改 LangChain tool description
- **WHEN** 后续 change 新增或修改 LangChain tool 的 description、schema description、examples 或 model-visible summary
- **THEN** OpenSpec tasks MUST 包含模型可见描述语言检查
- **AND** 实现 MUST 验证描述性自然语言默认使用中文
- **AND** 实现 MUST NOT 翻译 toolName、input/output 字段名、enum、resource type、provider 字段或结构化值

### Requirement: LangChain tool 测试必须覆盖 wrapper 执行边界
系统 SHALL 为新增或修改的 LangChain tool 提供 tool-level tests，直接覆盖 wrapper，而不是只测试 model prompt 或 catalog 暴露。

#### Scenario: 测试业务 tool wrapper
- **WHEN** 后续 change 新增或修改 LangChain business tool wrapper
- **THEN** 测试 MUST 覆盖成功路径、schema 拒绝、权限隔离、领域边界、失败归一化、model-visible summary、user projection 和 trace summary
- **AND** 涉及写入或高风险能力时 MUST 覆盖 policy / confirmation 拒绝路径
- **AND** 测试 MUST 使用接近 AITest 真实健身场景的输入

## REMOVED Requirements

### Requirement: 自动验证必须覆盖 Agent tool 架构边界
**Reason**: 旧要求中的 architecture scan 针对 `agent-core`、旧 ToolRegistry 和旧 handler 边界。迁移后需要扫描 LangChain runtime、tool wrappers 和 production tool catalog。

**Migration**: 使用本 change 新增的旧 core 缺席扫描、LangChain tool wrapper tests 和 production catalog tests 替代。
