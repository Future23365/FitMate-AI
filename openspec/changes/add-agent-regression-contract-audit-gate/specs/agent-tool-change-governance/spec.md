## ADDED Requirements

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
