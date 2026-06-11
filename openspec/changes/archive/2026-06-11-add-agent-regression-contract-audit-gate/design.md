## Context

当前项目已经有三类 Agent 治理能力：

- `agent-tool-change-governance` 约束 LangChain tool、runtime、production 接入和 wrapper 的可改边界。
- `agent-prompt-contract-governance` 约束 prompt、model input、tool description、schema description、repair feedback 和模型可见合同。
- `agent-fix-abstraction-gate` 约束从具体 trace / 用户原话 / tool result 出发的修复方案，不得升格为 case-specific 生产规则。

这三类治理能覆盖“当前 change 应该怎么改”，但不能自动回答一个不同问题：大重构后，历史上已经修过、归档过、踩过的坑有没有被重新引入。LangChain 迁移后的模型可见合同回归说明，仅依赖人工记忆、固定字段黑名单或普通 prompt/tool preflight 不够。

## Goals / Non-Goals

**Goals:**

- 新增一个只在 Agent 大迁移、大重构、核心链路替换或明确怀疑历史回归时触发的 Codex secondary audit Skill。
- 要求该 Skill 回查 `openspec/changes/archive`、`docs/项目演变历程.md` 和相关治理 spec，提取历史禁止项、旧合同边界和回归风险。
- 新增自动化模型可见合同门禁，能够发现同类字段换名、同类工作流提示换句、同类服务端指导模型行为再次进入模型输入。
- 让后续大重构 change 的 `tasks.md` 明确包含历史回归审计和合同门禁验证。

**Non-Goals:**

- 不替代 `agent-tool-change-governance`、`agent-prompt-contract-governance` 或 `agent-fix-abstraction-gate`。
- 不让普通单个 tool description、schema description、prompt 局部小修自动触发历史回归审计。
- 不在本 change 中修改生产 `/api/chat` 行为、LangChain runtime、业务 tool handler、数据库或前端。
- 不把本次 warmup trace 的用户短句、字段组合或 tool 调用顺序写成通用生产规则。

## Decisions

### Decision 1: 新 Skill 定位为 secondary audit

`agent-regression-contract-audit` 只在大重构、大迁移、核心链路替换、跨模块 Agent 改造、恢复历史行为，或用户明确要求“查旧 change / 以前不是改过吗 / 又加回来了”时触发。它不作为普通 Agent tool / prompt 改动的 primary skill。

原因：现有 primary skills 已经负责当前修改入口。如果新 Skill 覆盖所有 prompt/tool 变更，会让普通小修流程过重，也会把“历史回归审计”和“当前边界治理”混在一起。

### Decision 2: 审计输入以归档 OpenSpec 和演进文档为准

Skill 的审计步骤必须优先查：

- `openspec/changes/archive/**/proposal.md`
- `openspec/changes/archive/**/design.md`
- `openspec/changes/archive/**/specs/**/spec.md`
- `openspec/changes/archive/**/tasks.md`
- `docs/项目演变历程.md`
- 必要时查 `docs/方案变更历史/**`

审计输出不直接复述所有历史内容，而是列出与当前 change 相关的旧 change、旧禁止项、当前覆盖点、漏项和需要补到 proposal / design / specs / tasks / tests 的动作。

### Decision 3: 自动化门禁以白名单 schema 为核心

模型可见 tool summary / repair feedback / trace summary 的测试不能只断言“不包含 `fulfillment`、`satisfied`”。实现应提供严格白名单 schema 或等价结构检查：

- 只允许事实、检索条件、资源覆盖、诊断和 validator 边界类字段。
- 未声明字段默认失败，防止 `deliveryReadiness`、`canProduceRoutine`、`recommendedNextStep` 这类换名后的同类字段绕过固定黑名单。
- 黑名单仍保留为补充扫描，用于快速发现历史明确禁止字段和高风险短语。

### Decision 4: production tool catalog 必须被枚举验证

测试应从生产 LangChain tool catalog 或等价生产注册入口枚举真实 tool，而不是只测单个修复对象。每个 tool 按能力类型提供最小 fixture，覆盖成功、空结果或无候选、schema 拒绝、validator 拒绝、重复输入反馈等代表性状态。

原因：大重构的风险来自新旧入口迁移，不是单个 tool handler 本身。枚举生产 catalog 能发现“新 wrapper / 新 adapter / 新 summary builder”在其他 tool 上的同类回归。

### Decision 5: 模型可见文本 linter 检查实际组装后的输入

文本 linter 应尽量检查实际会进入模型的字符串集合，例如 system prompt、LangChain tool description、JSON Schema description、examples description、repair feedback、tool result summary、finalization tool description、trace summary。源码字符串扫描只能作为辅助。

linter 规则按风险类别组织：

- 服务端指导模型下一步调用哪个 tool 或固定 workflow。
- 将业务目标满足度、最终交付合法性、visible output 边界混入只读事实 tool summary。
- 在通用 prompt / runtime / adapter 中写入具体业务 toolName 语义分支或用户短句触发规则。
- 使用 action 枚举式建议替代中性、可恢复、事实型反馈。

## Risks / Trade-offs

- [Risk] 白名单 schema 过窄会阻碍合法的新 tool summary 字段。  
  Mitigation: 字段扩展必须先更新 spec / schema / tests，并说明该字段属于事实、诊断、resource、validator 或 projection 边界。

- [Risk] 文本 linter 误伤合法说明。  
  Mitigation: linter 以实际模型可见合同类别为单位维护规则，并允许在测试中标注受控例外；例外必须说明该文本属于局部 tool description、schema description、validator diagnostics 或测试 fixture。

- [Risk] 历史审计变成大而空的人工流程。  
  Mitigation: Skill 输出必须包含相关旧 change 清单、旧禁止项、当前覆盖点、漏项和需要补的验收任务，不允许只写“已审查”。

- [Risk] 新 Skill 与现有 Agent governance 重叠。  
  Mitigation: spec 明确它是 secondary audit，只在大重构/大迁移/明确怀疑历史回归时触发；普通单点 tool / prompt 变更继续使用现有治理。
