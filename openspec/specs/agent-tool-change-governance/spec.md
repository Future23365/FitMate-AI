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

### Requirement: OpenSpec tasks 必须包含 Agent tool 验证步骤
系统 SHALL 要求非文案类 Agent tool change 的 `tasks.md` 包含与改动范围对应的测试、架构扫描和 OpenSpec validate 步骤。

#### Scenario: 编写后续 Agent tool change tasks
- **WHEN** 后续 OpenSpec change 涉及 Agent tool、新增业务 tool、Agent core contract、PlannerPort、Policy Guard、ResourceStore、Response Renderer、trace / replay 或 `/api/chat` Agent 生产接入
- **THEN** `tasks.md` MUST 包含相关自动化测试或架构扫描任务
- **AND** `tasks.md` MUST 包含 `openspec validate <change> --strict`
- **AND** 如果修改 TypeScript、React、API、Schema、AI 编排或共享业务逻辑，`tasks.md` MUST 包含 `npm test` 或相关自动化测试，并按需包含 `npm run typecheck`
- **AND** 如果无法运行某项验证，最终实现总结 MUST 说明原因和剩余风险

### Requirement: Agent tool 变更必须检查模型可见描述语言
系统 SHALL 要求新增或修改 Agent tool 时检查所有进入 Planner manifest 的描述性自然语言，确保默认使用中文并保留英文技术标识。

#### Scenario: 新增或修改 Agent tool manifest
- **WHEN** 后续 change 新增或修改 Agent tool 的 manifest、schema description 或 examples
- **THEN** OpenSpec tasks MUST 包含模型可见描述语言检查
- **AND** 实现 MUST 验证 `description`、`whenToUse`、`whenNotToUse`、`examples.description` 和 JSON Schema `description` 默认使用中文
- **AND** 实现 MUST NOT 翻译 `toolName`、input/output 字段名、enum、resource type 或 Action Validator 需要的结构化值

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

### Requirement: Agent tool 大重构必须执行历史回归审计
系统 SHALL 要求 Agent tool / LangChain runtime / production tool catalog 的大迁移或大重构在实现前执行历史回归审计，防止旧 Agent 或旧 tool 合同中已经修复的问题被重新引入。

#### Scenario: Tool 或 runtime 大重构触发审计
- **WHEN** 后续 change 替换 Agent 主链路、迁移 Agent framework、重组 LangChain runtime、重写 production tool catalog、批量修改 tool wrapper 或批量修改 model-visible summary
- **THEN** 该 change MUST 使用 `agent-regression-contract-audit`
- **AND** 该 change 的 `tasks.md` MUST 包含历史回归审计任务
- **AND** 该 change 的 `tasks.md` MUST 包含 Agent model-visible contract gate 验证任务

#### Scenario: 单个 tool 普通修改不扩大流程
- **WHEN** 后续 change 只新增或修改单个业务 tool、tool schema、handler、policy metadata、model-visible summary、projection 或 trace summary
- **AND** 该 change 不替换核心 runtime、不迁移 framework、不批量修改模型可见合同、不恢复历史行为
- **THEN** 该 change MUST NOT 仅因涉及 Agent tool 而强制执行 `agent-regression-contract-audit`
- **AND** 该 change 仍 MUST 执行既有 Agent tool 治理 preflight 和相关 tool-level tests

#### Scenario: 审计结果不能放宽 tool 治理边界
- **WHEN** 历史回归审计发现旧 change 中存在业务 toolName、用户原话或字段组合
- **THEN** 这些内容 MUST 只进入历史证据、局部 tool 合同或回归测试样例
- **AND** 实现 MUST NOT 在 LangChain runtime、production response adapter、tool wrapper 通用执行或 `/api/chat` route 中新增具体业务 toolName 语义分支

