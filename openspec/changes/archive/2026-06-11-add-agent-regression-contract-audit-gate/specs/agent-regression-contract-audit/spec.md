## ADDED Requirements

### Requirement: Agent 大重构必须提供历史回归审计 Skill
系统 SHALL 提供一个 Codex Skill，用于在 Agent 大迁移、大重构、核心链路替换或明确怀疑历史问题回归时审计旧 OpenSpec change 和项目演进记录，防止历史已修复的问题被重新引入。

#### Scenario: 大重构触发历史回归审计
- **WHEN** 后续 change 替换 Agent 主链路、迁移 Agent framework、重组 LangChain runtime、重写 model-visible contract、重构 production tool catalog 或跨模块改造 Agent tool / prompt / finalization 链路
- **THEN** Codex MUST 使用 `agent-regression-contract-audit` Skill
- **AND** 审计 MUST 在实现前完成
- **AND** 审计结果 MUST 被写入该 change 的 design、tasks 或实现前说明

#### Scenario: 用户明确怀疑历史回归
- **WHEN** 用户明确要求“查旧 change”、“以前不是改过吗”、“又加回来了”、“对比归档 change”或等价历史回归审计
- **THEN** Codex MUST 使用 `agent-regression-contract-audit` Skill
- **AND** Codex MUST 对照相关旧 change 输出已覆盖项、漏项和需要补的文档或测试

#### Scenario: 普通单点修改不触发历史回归审计
- **WHEN** 任务只是单个 tool description、schema description、model-visible summary、repair feedback、prompt 局部文案或单个 handler 的小范围修改
- **THEN** Codex MUST NOT 仅因为该任务涉及 Agent 就自动触发 `agent-regression-contract-audit`
- **AND** 该任务仍 MUST 按需使用 `agent-tool-change-governance`、`agent-prompt-contract-governance` 或 `agent-fix-abstraction-gate`

### Requirement: 历史回归审计必须读取归档 OpenSpec 和演进记录
系统 SHALL 要求历史回归审计以已归档 OpenSpec change、项目演进记录和相关治理 spec 为主要证据，而不是依赖 Codex 记忆或当前直觉。

#### Scenario: 审计归档 change
- **WHEN** Codex 执行 `agent-regression-contract-audit`
- **THEN** Codex MUST 查找 `openspec/changes/archive/**` 中与当前 change 相关的 proposal、design、tasks 和 specs
- **AND** Codex MUST 优先提取历史 change 已经移除、禁止、收口或重命名的模型可见字段、workflow 提示、runtime 行为、validator 边界和测试要求

#### Scenario: 审计项目演进记录
- **WHEN** 归档 OpenSpec 不能完整解释历史问题
- **THEN** Codex MUST 按需查阅 `docs/项目演变历程.md` 和 `docs/方案变更历史/**`
- **AND** Codex MUST 区分可验证文档证据、当前代码证据和未验证记忆

### Requirement: 历史回归审计必须输出可执行漏项清单
系统 SHALL 要求历史回归审计输出结构化结论，用于直接补充 proposal、design、specs、tasks 或自动化测试。

#### Scenario: 输出审计结论
- **WHEN** Codex 完成 `agent-regression-contract-audit`
- **THEN** 输出 MUST 包含相关旧 change 清单
- **AND** 输出 MUST 包含每个旧 change 提供的历史禁止项或合同边界
- **AND** 输出 MUST 包含当前 change 已覆盖项
- **AND** 输出 MUST 包含当前 change 漏项
- **AND** 输出 MUST 包含需要补到 OpenSpec 文档、自动化测试或实现任务中的具体动作

#### Scenario: 没有找到相关旧 change
- **WHEN** Codex 未找到与当前 change 相关的归档 change 或演进记录
- **THEN** 输出 MUST 明确说明没有找到可引用的历史证据
- **AND** 输出 MUST 回到当前 Agent tool / prompt / 抽象层级治理继续审查

### Requirement: 历史回归审计不得替代现有 Agent 治理
系统 SHALL 要求 `agent-regression-contract-audit` 只作为 secondary audit，不替代当前 Agent tool、prompt 或抽象层级治理。

#### Scenario: 同时触发当前治理和历史审计
- **WHEN** 一个 change 同时涉及 Agent tool / LangChain runtime / prompt / model input / model-visible contract，并且属于大重构或历史回归审计触发条件
- **THEN** Codex MUST 先使用相关 primary skill 确认当前可改边界
- **AND** Codex MUST 再使用 `agent-regression-contract-audit` 对照旧 change 查历史回归
- **AND** 审计结果 MUST NOT 放宽 primary skill 中的禁止模块、禁止语义分流或抽象层级门禁

#### Scenario: 历史证据包含业务实例
- **WHEN** 历史 change 或 trace 中包含具体用户原话、业务 toolName、字段组合或 phrasing
- **THEN** 审计 MUST 将这些内容标记为历史证据或回归测试样例
- **AND** 审计 MUST NOT 将这些内容写成通用 prompt、runtime、服务端路由或 tool wrapper 的生产触发规则
