# agent-tool-change-governance Specification

## Purpose
TBD - created by archiving change codify-agent-tool-change-governance. Update Purpose after archive.
## Requirements
### Requirement: Agent tool 相关任务必须执行治理 preflight
系统 SHALL 为新增 Agent tool、修复 Agent tool bug、修改 Agent core contract、修改 PlannerPort / Policy Guard / ResourceStore / Response Renderer、以及接入 `/api/chat` 生产链路的任务执行统一治理 preflight。

#### Scenario: 新增或修改 Agent tool 任务开始
- **WHEN** 开发者或 Codex 准备新增 Agent tool、修复 Agent tool bug 或修改 Agent tool 执行链路
- **THEN** 实现前 MUST 读取 `docs/agent-tool-orchestrator-design.md` 中关于后续新增业务 Tool 规则、最容易走偏的地方和最小验收清单的章节
- **AND** 实现前 MUST 检查当前 OpenSpec change 状态和 Git 工作区状态
- **AND** 实现前 MUST 将任务分类为新增业务 tool、Agent tool bug 修复、core contract 变更或 production 接入变更
- **AND** 实现前 MUST 明确本次允许触碰的模块和禁止触碰的模块

#### Scenario: 任务不属于 Agent tool 治理范围
- **WHEN** 任务只是文案修改、普通 UI 样式调整或与 Agent tool / Agent core 无关的小修
- **THEN** 系统 MAY 跳过 Agent tool 治理 preflight
- **AND** 系统 MUST NOT 因此跳过项目已有 OpenSpec、测试、提交和工作区检查规则

### Requirement: 新增业务 tool 必须默认只扩展 tool bundle
系统 SHALL 将新增业务 Agent tool 的默认路径限定为新增 tool bundle、注册 ToolRegistry 和补 contract tests，不得默认修改通用 Agent core 主流程。

#### Scenario: 新增业务 tool
- **WHEN** 后续 change 新增真实业务 Agent tool
- **THEN** 实现 MUST 优先只新增 tool 文件、inputSchema、outputSchema、policy metadata、resourceContract、handler、安全 projection、ToolRegistry 注册和 tool contract 测试
- **AND** 实现 MUST NOT 默认修改 orchestrator 主循环、PlannerPort 接口、Executor 主流程、Policy Guard 主流程、Resource Contract Validator 主流程、Response Renderer 主流程或 `/api/chat` 主链路
- **AND** 实现 MUST NOT 在服务端增加关键词意图分流、自然语言模板分流或 core 内具体业务 toolName 分支

#### Scenario: 新 tool 需要 core 变更
- **WHEN** 新增 tool 无法在现有 tool contract 下工作
- **THEN** 后续 change design MUST 说明该需求是单个 tool 特例、多个无关 tool 的通用需求，还是安全、权限、resource、trace 或 stream 协议问题
- **AND** 单个 tool 特例 MUST 优先通过调整 tool contract 解决
- **AND** 多个无关 tool 的通用需求 MUST 抽象为 core 通用扩展点并补 core contract tests
- **AND** 涉及安全、权限、resource、trace 或 stream 协议的需求 MUST 回到 core contract 统一设计，不能开业务特例

### Requirement: Agent tool bug 修复必须 trace-first 定位根因
系统 SHALL 要求 Agent tool bug 修复先基于 trace、真实 schema、model-visible manifest 和当前代码定位根因，再选择修复层级。

#### Scenario: 分析 Agent tool bug
- **WHEN** 用户要求修复 Agent tool、tool calling、Agent runtime、recommendation / routine tool、resource contract、projection、policy 或 final grounding 相关 bug
- **THEN** 实现前 MUST 读取 `codex_logs/ai_trace_log.js`，除非用户明确说明不需要看日志或该文件不存在
- **AND** 实现前 MUST 检查相关 tool 的真实 Zod schema / JSON Schema、model-visible manifest 或 schema summary、runtime 校验、ResourceStore、Policy Guard、projection 和 trace 记录
- **AND** 根因分类 MUST 区分 LLM 参数错误、模型可见合同缺失、tool 能力不足、resource 未登记或不可消费、policy / confirmation 边界、projection / redaction 泄漏、final grounding 缺陷和生产接入问题

#### Scenario: Bug 修复禁止语义补丁
- **WHEN** Agent tool bug 的表象来自用户自然语言理解、LLM 参数选择或 tool 能力边界不清
- **THEN** 修复 MUST NOT 在服务端通过关键词、正则、短句模板、同义词表或业务 toolName 特判改写 LLM 的高层语义决策
- **AND** 修复 MUST 优先通过 tool contract、模型可见 manifest、Structured Outputs、LLM repair、澄清或领域能力拆分解决

### Requirement: Codex Skill 必须作为 Agent tool 治理入口
系统 SHALL 提供一个 Agent tool 治理 Codex Skill，使后续相关任务自动进入架构文档读取、任务分类、范围声明和验证规划流程。

#### Scenario: Skill 被触发
- **WHEN** 用户请求新增 Agent tool、修复 Agent tool bug、修改 Agent core contract、调整 PlannerPort / Policy Guard / ResourceStore / Response Renderer 或接入 Agent tool 到生产聊天链路
- **THEN** Codex MUST 使用该 Skill
- **AND** Skill MUST 指示 Codex 读取 `docs/agent-tool-orchestrator-design.md` 的关键章节
- **AND** Skill MUST 指示 Codex 输出问题根因或产品需求、设计方向、预计影响模块和取舍
- **AND** Skill MUST 指示 Codex 在实现完成后总结改动、为什么优于最小补丁、如何验证和剩余风险

#### Scenario: Skill 不能替代自动验证
- **WHEN** 后续 change 只新增或更新 Agent tool 治理 Skill
- **THEN** 该 change MUST NOT 被视为治理闭环完成
- **AND** 完整实现 MUST 同时提供架构扫描或 contract tests，用于自动发现违反 Agent tool 架构边界的实现

### Requirement: 自动验证必须覆盖 Agent tool 架构边界
系统 SHALL 为 Agent tool 治理提供可运行的架构扫描或 contract tests，覆盖 core 业务污染、关键词分流、resource / confirmation 绕过和 projection 泄漏。

#### Scenario: 运行架构扫描
- **WHEN** 后续 change 新增业务 Agent tool、修改 Agent core 或修改生产 Agent tool 接入
- **THEN** 验证 MUST 检查 Agent core 中没有具体业务 toolName 分支
- **AND** 验证 MUST 检查 `/api/chat` 或等价生产入口没有新增业务关键词分流
- **AND** 验证 MUST 检查 Agent core 没有导入具体模型 adapter、业务 tool handler 或生产业务服务
- **AND** 验证 MUST 检查新增业务 tool 不通过 handler 直接生成任意 NDJSON 用户事件或绕过 Response Renderer

#### Scenario: 运行 contract tests
- **WHEN** 后续 change 新增或修改业务 Agent tool
- **THEN** 测试 MUST 覆盖 inputSchema、outputSchema、policy metadata、resourceContract、handler 错误归一化、toModelObservation、toUserEvents 或 traceProjection 的安全边界
- **AND** 测试 MUST 证明 write 或 high risk tool 未经 Policy Guard / confirmation 不会执行
- **AND** 测试 MUST 证明 diagnostic resource 不能支撑成功 final answer
- **AND** 测试 MUST 证明完整 tool output 不会默认进入 model、user event 或 trace

### Requirement: OpenSpec tasks 必须包含 Agent tool 验证步骤
系统 SHALL 要求非文案类 Agent tool change 的 `tasks.md` 包含与改动范围对应的测试、架构扫描和 OpenSpec validate 步骤。

#### Scenario: 编写后续 Agent tool change tasks
- **WHEN** 后续 OpenSpec change 涉及 Agent tool、新增业务 tool、Agent core contract、PlannerPort、Policy Guard、ResourceStore、Response Renderer、trace / replay 或 `/api/chat` Agent 生产接入
- **THEN** `tasks.md` MUST 包含相关自动化测试或架构扫描任务
- **AND** `tasks.md` MUST 包含 `openspec validate <change> --strict`
- **AND** 如果修改 TypeScript、React、API、Schema、AI 编排或共享业务逻辑，`tasks.md` MUST 包含 `npm test` 或相关自动化测试，并按需包含 `npm run typecheck`
- **AND** 如果无法运行某项验证，最终实现总结 MUST 说明原因和剩余风险

