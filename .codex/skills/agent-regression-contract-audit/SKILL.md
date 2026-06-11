---
name: agent-regression-contract-audit
description: 审计 AITest 中 Agent 主链迁移、framework migration、LangChain runtime 替换、跨模块 Agent 大重构或用户明确怀疑历史回归时，旧 OpenSpec change 和项目演进记录中已收口的 Agent/model-visible 合同是否被重新引入。作为 secondary audit 使用，不替代 agent-tool-change-governance、agent-prompt-contract-governance 或 agent-fix-abstraction-gate；普通单个 tool/prompt 小修不自动触发。
---

# Agent 历史回归合同审计

## 使用目标

本 Skill 用于 Agent 大迁移、大重构或明确历史回归调查时，回查已经归档的 OpenSpec change、项目演进记录和相关治理 spec，确认历史上已禁止、移除、收口或重命名的 Agent/model-visible 合同没有被重新引入。

它只做 secondary audit：

- `agent-tool-change-governance` 仍负责 Agent tool、LangChain runtime、production tool catalog、wrapper、response adapter 和 `/api/chat` 执行边界。
- `agent-prompt-contract-governance` 仍负责 prompt、model input、tool description、schema description、examples、repair feedback 和模型实际可见输入。
- `agent-fix-abstraction-gate` 仍负责从具体 trace / 用户原话 / tool result 出发的修复方案抽象层级门禁。
- 本 Skill 不放宽任何 primary skill 的禁止模块、禁止语义分流或抽象层级要求。

## 触发条件

仅在以下情况使用本 Skill：

- Agent 主链迁移、framework migration 或 LangChain runtime 替换。
- 跨模块 Agent 大重构，例如同时重组 runtime、tool wrapper、production tool catalog、response adapter、finalization、prompt 或 model-visible contract。
- 大范围重写 Agent prompt、model input、output contract、tool description、schema description、tool result summary、repair feedback、trace summary 或 finalization tool description。
- 恢复历史行为、回滚历史决策，或用户明确要求“查旧 change”“以前不是改过吗”“又加回来了”“对比归档 change”。
- 当前 change 明确怀疑旧 Agent/tool/prompt 合同问题回归。

## 非触发条件

以下任务不因涉及 Agent 而自动触发本 Skill：

- 普通单个 LangChain tool description 小修。
- 单个 schema description、examples description 或 repair feedback 文案小修。
- 单个 model-visible summary、tool result summary 或 trace summary 的局部修正。
- 单个 handler、policy metadata、projection 或 validator 小范围 bug 修复。
- 普通 trace 根因排查，尚未进入大重构、历史回归调查或修复方案审查。

这些任务仍应按需使用 `agent-tool-change-governance`、`agent-prompt-contract-governance` 或 `agent-fix-abstraction-gate`。

## 审计输入

执行审计时优先读取：

1. 当前 OpenSpec change 的 `proposal.md`、`design.md`、`tasks.md` 和 `specs/**/spec.md`。
2. `openspec/changes/archive/**/proposal.md`。
3. `openspec/changes/archive/**/design.md`。
4. `openspec/changes/archive/**/tasks.md`。
5. `openspec/changes/archive/**/specs/**/spec.md`。
6. `docs/项目演变历程.md`。
7. 必要时读取 `docs/方案变更历史/**`。
8. 相关治理 spec 或 Skill，例如 Agent tool、prompt、抽象层级、testing workflow 和 model-visible contract gate。

如果需要依赖记忆或未验证历史印象，必须明确标为“未验证记忆”，并优先用归档 OpenSpec、演进文档或当前代码证据复核。

## 审计步骤

1. 明确当前 change 类型：Agent 主链迁移、framework migration、runtime 重构、tool catalog 重组、prompt/model-visible 大重组、历史行为恢复或用户指定回归审计。
2. 先用相关 primary skill 确认当前可改边界；本 Skill 只做历史回归补充审计。
3. 在归档 change 和演进文档中查找相关旧 change，优先检索当前触碰的资源、toolName、字段、prompt 层、workflow、validator、trace、projection 和 finalization 边界。
4. 提取历史禁止项和合同边界，例如旧字段、过时协议字段、固定 workflow 提示、服务端指导模型下一步、业务目标满足度、case-specific 生产规则、旧 action 枚举或旧 runtime 行为。
5. 对照当前 proposal / design / specs / tasks / tests / diff，标记已覆盖项、漏项和需要补充的位置。
6. 若历史证据包含用户原话、具体 `toolName`、字段组合、trace 条件或 phrasing，必须标记为历史证据或回归测试样例，不得写成通用 prompt、runtime、服务端路由或 wrapper 触发规则。
7. 对高风险 Agent/model-visible contract 变更，确认 `tasks.md` 包含 Agent model-visible contract gate：白名单 summary schema、production tool catalog contract tests、模型可见文本 linter 和历史禁止项补充扫描。

## 输出格式

审计输出必须包含以下部分，不能只写“已审查”：

```txt
结论：<可继续 / 需要补充后继续 / 暂停执行>

相关旧 change：
- <change id 或文档路径>：<与当前 change 的关系>

历史禁止项 / 合同边界：
- <禁止项或边界>：<证据来源>

当前覆盖项：
- <当前 proposal / design / specs / tasks / tests 已覆盖什么>

漏项：
- <尚未覆盖或覆盖不足的事项；没有则写“未发现”>

需要补充的动作：
- proposal：
- design：
- specs：
- tasks：
- tests：

抽象层级检查：
- 具体用户原话、业务 toolName、字段组合或 phrasing 仅作为历史证据 / 回归测试样例，不作为通用生产规则。
- 未新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 toolName 语义分支。
```

## 通过标准

可继续实现的最低标准：

- 已读取当前 change 和相关归档证据，或明确说明没有找到相关历史证据。
- 已列出相关旧 change、历史禁止项或合同边界。
- 当前 change 的 proposal / design / specs / tasks / tests 已覆盖历史回归风险，或输出了具体补充动作。
- 没有把历史 trace、用户原话、业务实例、字段组合或 phrasing 升级为通用生产规则。
- 没有用本 Skill 放宽 primary governance skill 的边界。

如果没有找到相关旧 change，应明确说明“没有找到可引用的历史证据”，然后回到当前 Agent tool / prompt / 抽象层级治理继续审查。
