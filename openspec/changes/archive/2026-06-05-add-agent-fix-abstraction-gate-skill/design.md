## Context

`AGENTS.md` 已新增“Agent 修复方案抽象层级门禁”，要求 Codex 在给 Agent / prompt / tool 修复方案前区分失败证据、通用合同、业务实例和回归测试。现有 `agent-tool-change-governance` 负责 Agent tool / core / production 变更边界，`agent-prompt-contract-governance` 负责模型实际可见输入合同，但两者都不是专门用于审查“修复方案是否把 case 规则升格为生产规则”的门禁。

因此需要新增一个独立 Skill，作为开始实现 change 或审查 change 时的专门 preflight。

## Goals / Non-Goals

**Goals:**

- 提供一个项目级 Skill，专门审查 Agent 修复方案的抽象层级。
- 在发现违反门禁时强制暂停执行，并要求输出违反条款、证据、问题层级、正确修复层级和继续条件。
- 在未违反时要求输出抽象问题类型、通用合同修复、业务 tool 局部说明、回归测试样例和服务端语义分流检查。
- 保持 Skill 正文中文，技术标识英文原样。

**Non-Goals:**

- 不修改真实 Agent runtime、prompt、tool、API 或生产聊天链路。
- 不替代 `agent-tool-change-governance` 或 `agent-prompt-contract-governance`。
- 不新增自动架构扫描脚本；本次只新增人工/Agent 审查流程。

## Decisions

1. 新增独立 Skill，而不是扩展 `agent-tool-change-governance`。

   原因：现有 Skill 管“能改哪里、不能改哪里”，新门禁管“修复方案放在哪个抽象层级”。如果混在一起，后续审查某个 change 时触发语义不够清晰。

2. Skill 名称使用 `agent-fix-abstraction-gate`。

   原因：名称直接表达“Agent 修复方案”和“抽象层级门禁”，比泛化的 architecture review 更贴近 `AGENTS.md` 当前条款。

3. Skill 输出采用固定“暂停执行 / 可继续”结构。

   原因：门禁类 Skill 的核心价值是阻断错误实现路径；固定结构能让后续 Codex 在发现违规时明确指出违反条款和修复层级，而不是继续给宽泛建议。

4. 本 change 只做 Skill 和文档，不新增脚本。

   原因：本门禁的关键判断依赖 proposal、design、diff、trace 和上下文解释，暂时不适合用简单 grep 全部覆盖。后续如果发现重复风险点稳定，可以再新增脚本扫描服务端关键词分流、core 中具体 `toolName` 分支等确定性问题。

## Risks / Trade-offs

- [Risk] Skill 只能约束 Codex 行为，不能自动阻止所有违规代码进入仓库。→ Mitigation：OpenSpec tasks 要求后续相关 change 包含本 Skill 审查和最终 diff 检查；需要自动化时再补 architecture boundary scan。
- [Risk] 审查输出过宽可能和现有两个治理 Skill 重叠。→ Mitigation：Skill 明确只审抽象层级，不替代 Agent tool 变更治理和 prompt 合同治理。
- [Risk] 只新增 Skill 不会改变当前运行时行为。→ Mitigation：本 change 的目标就是项目级协作门禁；最终总结明确未运行 runtime/typecheck 的原因。
