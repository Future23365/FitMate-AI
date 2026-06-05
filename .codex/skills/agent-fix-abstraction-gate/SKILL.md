---
name: agent-fix-abstraction-gate
description: 审查 AITest 中 Agent / prompt / tool 相关 OpenSpec change 或修复方案是否违反抽象层级门禁。仅在用户明确要求审查某个 change、审查 Agent 修复方案、检查是否存在 case-specific 生产规则，或准备实现/继续实现一个 Agent / prompt / tool 相关 OpenSpec change 且该 change 可能把具体 trace、用户原话、toolName、字段组合、phrasing 或业务实例升格为通用规则时使用。普通 trace 根因排查、普通 prompt 文案调整、非 Agent change 不自动触发。
---

# Agent 修复方案抽象层级门禁

## 使用目标

用这个 Skill 在审查 change 或实现 Agent / prompt / tool 相关 change 前，先审“修复方案放在哪个抽象层级”。重点防止把某个 trace、用户原话、tool result、模型输出形态或业务实例，错误升格成通用 prompt、runtime 或服务端生产规则。

这个 Skill 不替代 `agent-tool-change-governance` 或 `agent-prompt-contract-governance`：前者负责 Agent tool / core / production 能改哪里，后者负责模型实际可见输入；本 Skill 只负责判断修复方案抽象层级是否正确。

## 触发条件

仅在以下情况使用本 Skill：

- 用户要求“审查某个 change”、“开始做这个 change 前先审查”、“看这个 Agent 修复方案有没有违反抽象层级门禁”。
- 准备实现或继续实现 Agent / prompt / tool 相关 OpenSpec change，且该 change 的方案来自具体 trace、用户原话、tool result、模型输出失败、repair 失败或 final grounding 失败。
- 方案可能把具体用户短句、具体 `toolName`、字段组合、业务资源名、phrasing、`recent` / `current` / `latest` / `fromCard` / `forThisFlow` 这类当前 case 默认值写进通用 prompt、runtime、服务端生产规则或 core 分支。
- 已有 diff、proposal、design 或 tasks 中出现服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支，或为单个业务 case 修改 Agent core。
- 普通 trace 根因排查不自动触发；只有当排查已经进入修复方案审查或 Agent/prompt/tool change 实现前门禁时才使用。

## 必读上下文

开始审查前按需读取：

1. `AGENTS.md` 中 `Agent 修复方案抽象层级门禁` 和 `AI / Agent 边界：模型能力优先，服务端只管契约`。
2. `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节。
3. 如果有 OpenSpec change，读取该 change 的 `proposal.md`、`design.md`、`tasks.md` 和相关 `spec.md`。
4. 如果已有实现，读取当前 diff。
5. 对于 trace 修复，外部导出证据仅在用户提供、刚导出或明确确认对应当前问题时使用。覆盖写的导出文件可能已经替换，不能默认当作当前 change 证据。

## 抽象层级分类

审查时先把证据和方案拆成四层：

- 失败证据：只能描述本次 case 发生了什么，例如用户原话、trace、tool result、模型错误输出。
- 通用合同：只能使用稳定抽象，例如引用对象、可见资源、tool result、resource role、grounding、repair、clarification、schema、policy、projection。
- 业务实例：`visibleTrainingProposal`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 等具体业务名只能作为 tool manifest、observation projection、resource contract 或测试样例出现。
- 回归测试：可以包含用户原话和具体 tool 输出，但测试样例不得反向决定生产规则。

## 禁止方案

以下形态必须判定为违反门禁，除非用户明确要求 quick patch 并接受风险：

- “当用户说 X 时……”
- “当 `toolName = Y` 且字段 `Z = 某值` 时，模型必须……”
- “针对这次 trace 的短句 / 资源 / 字段组合增加一条行为规则。”
- 服务端根据用户自然语言、关键词、正则、同义词、短句模板、历史摘要或具体 phrasing 改写 `action`、`toolName`、调用顺序、引用目标、调整目标或最终回答策略。
- 把具体业务实例名写成通用 Agent prompt 触发条件，而不是放在该 tool 的 manifest、schema description、observation、resource contract 或测试里。
- 为单个业务 tool 修改 orchestrator 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`Resource Contract Validator`、`Response Renderer` 或 `/api/chat` 主链路。
- 在 Agent core 中新增具体业务 `toolName` 分支，或让 tool handler 绕过 confirmation、permission、resource registration、projection 或 final grounding。

## 正确修复层级

如果问题确实来自模型能力不足或上下文不足，优先选择这些修复层级：

- 通用合同修复：补引用对象、可见 resource、grounding、repair、clarification、tool result 满足状态等稳定规则，不使用具体用户短句作为触发条件。
- 业务 tool 局部说明：在对应 tool 的 `description`、`whenToUse`、`whenNotToUse`、schema description、examples 或 observation 中说明该 tool 暴露什么事实、不能支撑什么事实。
- resource contract / projection：补 resource type、role、summary、consumable / diagnostic 边界、redaction 和 final answer 可消费性。
- LLM repair / clarification：当结构冲突、字段缺失、引用不可用或结果不可执行时，进入 repair、澄清或拒绝，不把 intent 改写成另一个 action。
- 回归测试：用原始失败 case 和至少一个等价语义变体证明修复覆盖问题类别，而不是只覆盖当前 trace。

## 违规输出格式

发现违反门禁时必须暂停执行，并按这个结构回复：

```txt
结论：暂停执行

违反条款：
- <引用 AGENTS.md 或 docs/agent-tool-orchestrator-design.md 中的规则>

证据：
- <文件/行号、OpenSpec 条目、diff 或 trace 证据>

问题层级：
- 当前方案把 <失败证据/业务实例/测试样例> 错误升格成了 <通用 prompt/runtime/服务端生产规则>。

正确修复层级：
- 通用合同修复：
- 业务 tool 局部说明：
- observation / resource contract：
- 回归测试：

继续条件：
- <需要先改 proposal/design/tasks/实现方案/测试计划的具体事项>
```

## 通过输出格式

未发现违反门禁时，也必须按顺序给出审查结果：

```txt
结论：可继续

1. 抽象问题类型：
2. 通用合同修复：
3. 业务 tool 局部说明：
4. 回归测试样例：
5. 服务端语义分流检查：未新增关键词规则、自然语言模板路由、phrasing 特判或具体 toolName 语义分支。
```

## OpenSpec 与验证

如果审查对象是非文案类 Agent / prompt / tool change，`tasks.md` 必须包含：

- 使用本 Skill 完成抽象层级门禁审查。
- `openspec validate <change> --strict`。
- 与改动范围相关的 prompt / manifest / schema / observation / resource contract / final grounding / tool-level 单测或 architecture boundary 检查。
- 若方案涉及具体业务名，说明该业务名属于 tool manifest、observation projection、resource contract 或回归测试，而不是通用语义规则。
- 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。

如果本次只新增或更新本 Skill，不修改真实 Agent runtime、prompt、tool、TypeScript 或生产链路，说明未运行 runtime/typecheck 的原因。
