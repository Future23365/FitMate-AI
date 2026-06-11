## Why

LangChain 迁移暴露出一个流程缺口：现有 Agent tool / prompt / 抽象层级治理能约束“当前要改什么”，但没有在大重构后系统性回查历史已修复问题是否被重新引入。需要补一个只在大迁移、大重构或用户明确怀疑历史回归时触发的历史回归审计门禁，并配套自动化模型可见合同测试，避免同类字段或同类流程提示换名后再次进入模型输入。

## What Changes

- 新增 `agent-regression-contract-audit` 能力，定义一个 Codex secondary audit Skill 的触发边界、审计步骤和输出格式。
- 新增 `agent-model-visible-contract-gate` 能力，定义模型可见 summary / prompt / tool description / schema description / repair feedback / trace summary 的通用自动化门禁。
- 修改 `agent-tool-change-governance`，要求 Agent 主链迁移、framework migration、LangChain runtime 替换、跨模块 tool/runtime 大重构时必须执行历史回归审计；普通单个 tool 改动不自动触发。
- 修改 `agent-prompt-contract-governance`，要求大范围 prompt / model input / output contract 重组时执行历史回归审计；普通局部 prompt 或 tool description 小改继续走现有 prompt 合同治理。
- 修改 `testing-workflow`，要求高风险 Agent / model-visible contract 变更在验收中包含白名单 schema、production tool catalog 枚举和模型可见文本 linter，而不是只做固定字段黑名单扫描。

## Capabilities

### New Capabilities

- `agent-regression-contract-audit`: 只在 Agent 大迁移、大重构、核心链路替换或明确怀疑旧问题回归时使用的历史回归审计能力，负责查旧 OpenSpec / 旧演进记录并输出覆盖与漏项。
- `agent-model-visible-contract-gate`: 面向模型实际可见输入的自动化合同门禁，覆盖白名单结构、生产 tool catalog 枚举、文本规则 linter 和禁止项补充扫描。

### Modified Capabilities

- `agent-tool-change-governance`: 为 Agent tool / runtime 大重构增加历史回归审计触发要求，并明确普通单 tool 修改不因此扩大流程。
- `agent-prompt-contract-governance`: 为大范围 prompt / model input / output contract 重组增加历史回归审计触发要求，并明确不替代现有 prompt 合同治理。
- `testing-workflow`: 为 Agent 模型可见合同高风险变更增加通用自动化门禁验收要求。

## Impact

- 后续实现会新增一个本地 Codex Skill，例如 `.codex/skills/agent-regression-contract-audit/SKILL.md`。
- 后续实现会新增或调整 Agent model-visible contract 的测试/扫描工具，用于验证 summary schema、production tool catalog、prompt/tool/schema/repair/trace 文本。
- 不改变生产 `/api/chat` 行为、不修改业务 tool handler、不修改数据库或前端页面。
- 不把本次 warmup trace 的具体用户短句、具体字段组合或业务 tool 调用顺序写成生产通用规则；这些内容只能作为历史证据或回归测试样例。
