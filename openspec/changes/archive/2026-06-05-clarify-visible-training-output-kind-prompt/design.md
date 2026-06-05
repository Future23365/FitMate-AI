## Context

当前生产链路的模型实际输入由两部分组成：`buildAgentActionSystemPrompt()` 生成的 system prompt，以及包含 `run`、`tools`、`observations`、`toolResults` 的 JSON user message。`searchExerciseResources` 已能按 `suitabilities` 返回 `training`、`warmup`、`stretch` 动作事实，`visibleTrainingProposal` validator 也会拒绝缺 section 的 `routine` / `plan`。

失败 trace 证明上一轮 prompt 和 tool observation 已经进入模型输入，但模型仍然没有再次查询 `warmup` / `stretch`。根因不是 tool 不可见，而是模型缺少更前置的输出类型选择指南：它没有稳定地区分“动作推荐”与“一次可执行训练编排”以及“多天计划编排”。

本 change 使用 `agent-prompt-contract-governance` 作为 primary skill，因为主要变更是模型实际可见 prompt、tool manifest / examples 和 judge prompt。使用 `agent-fix-abstraction-gate` 审查抽象层级：代表性表达只能作为模型语义范式和测试样例，不能成为服务端关键词规则。

## Goals / Non-Goals

**Goals:**

- 让模型在默认 prompt 中看到本产品训练输出能力地图。
- 让模型稳定区分 `exercise_selection`、`routine`、`plan`。
- 让目标明显需要 `routine` / `plan` 的请求在候选足够时继续 tool loop，生成完整可见训练结构。
- 让候选不足时输出可恢复缺口说明，而不是让用户自行组合动作。
- 让基础黑盒 judge 能识别 routine / plan 目标被降级成动作列表的失败。

**Non-Goals:**

- 不新增服务端自然语言关键词、正则、同义词表、短句模板或意图分流。
- 不让 `/api/chat`、Agent runtime、tool handler、validator 或 renderer 根据用户原文改写 `action`、`toolName` 或 `payload.kind`。
- 不新增 `generateRoutineDraft`、`generatePlanDraft` 或隐藏训练生成 service。
- 不改变 `searchExerciseResources` 的 input schema、output schema、handler 查询语义或数据库过滤逻辑。
- 不在通用 prompt 中写 F04、F17、F18 这样的测试编号。

## Prompt Drafts For Review

以下是本 change 建议加入的模型可见 prompt 文案。实现时可以按可读性微调句序，但必须保留语义边界。所有示例都是语义范式，不是关键词触发规则。

### 1. 产品训练输出能力地图

```text
你服务的产品是 AI 健身助手，核心训练输出能力包括：普通健身解释、动作事实查询与动作选择、一次可执行训练编排、多天或周期训练计划、以及基于当前 run 可见训练方案事实的调整或派生。选择输出结构时，应先判断用户目标需要哪类训练结果，再基于当前可见 tools、observations 和 toolResults 自主决定 tool_call、final_answer 或 ask_user；不得根据固定短语、关键词或测试样例机械选择。
```

### 2. `payload.kind` 选择指南

```text
visibleTrainingProposal.payload.kind 的选择规则：exercise_selection 只表示一批可选 training 动作事实，适合用户明确只要动作推荐、动作清单、动作库查询、动作替代候选或动作事实说明的目标；它不表示一次可直接照做的训练。routine 表示一次可执行训练编排，适合用户想要一套训练、一次训练、今天练某个目标或部位、某个时长内完成训练、循环训练、居家或无器械单次训练、或希望直接照做一轮训练的目标。plan 表示多天或周期安排，适合用户给出每周频次、周期长度、多天安排、训练日 / 休息日安排、每周几练、连续几周目标，或要求长期训练计划的目标。
```

### 3. 输出类型优先级

```text
如果同一用户目标同时包含单次训练编排信息和多天 / 频次 / 周期信息，应优先考虑 plan；plan 可以复用同一套 warmup / training / stretch 编排并通过 schedule.assignments 表达训练日和休息日。若目标只要求一次训练且关键约束足以解释方案，应优先考虑 routine。只有当用户目标语义确实停留在动作候选、动作清单或动作事实层面时，才使用 exercise_selection。不要因为当前 run 先拿到的事实只支持 training，就把本应是 routine 或 plan 的目标降级为 exercise_selection。
```

### 4. 代表性语义范式

```text
以下表达只作为语义范式，不是固定触发词：用户要“推荐几个动作”“有哪些动作”“动作列表”“替代动作”时，通常是 exercise_selection 或普通文本；用户要“一套训练”“一次训练”“今天练某部位”“某部位 N 分钟训练”“循环训练”“居家无器械 N 分钟训练”时，如果不是只问动作清单，通常需要 routine；用户要“每周几练”“周期计划”“多天安排”“训练日 / 休息日”“几周计划”时，通常需要 plan。模型应按完整上下文和用户目标语义判断，不能把这些示例写成服务端规则。
```

### 5. tool loop 完成度检查

```text
当用户目标语义需要 routine 或 plan，且已经通过 searchExerciseResources 获得 training 动作事实，但 observations、toolResults 或 resource summary 显示缺少 warmup / stretch 时，如果当前可见 tool 可沿用目标、器械、场地、难度或肌群约束查询缺失 section，应继续返回合法 tool_call 获取缺失动作事实。补齐候选后再输出 final_answer.visibleOutputs[] 中的 visibleTrainingProposal；不要用正文动作列表、exercise_selection 或“如果你需要完整计划我可以继续”作为成功终态。
```

### 6. 候选不足的可恢复收口

```text
如果缺失 section 查询返回 0 条、diagnostics 显示 no_candidates、约束冲突、tool 不可用、或关键目标约束仍不足，才使用 ask_user 或不带 visibleOutputs 的 final_answer 说明具体缺口和可恢复下一步。可恢复下一步应围绕放宽器械、场地、难度、目标部位、训练形式、时长、频次或继续澄清；不得让用户自行把未完成的 training 动作列表组合成 routine 或 plan。
```

### 7. `searchExerciseResources` examples 建议

```text
示例说明：用户目标已经需要 routine 或 plan，且当前 run 已有 training 动作事实但缺少热身和拉伸时，沿用当前目标的真实 facet、器械、场地或难度约束，查询 warmup 和 stretch 候选。

示例 input:
{
  "muscles": ["胸部"],
  "equipment": "no_equipment",
  "level": "beginner",
  "suitabilities": ["warmup", "stretch"],
  "sort": "name_asc",
  "published": true
}
```

### 8. 基础黑盒 judge prompt 建议

```text
当文档期望生成 routine、单次训练、训练编排或三段式训练时，如果最终只输出动作推荐、visibleTrainingProposal 摘要中的 kind=exercise_selection、正文动作列表、让用户自行组合，或只建议用户下一轮再生成完整训练，必须返回 passed=false 且 status=failed。

当文档期望生成 plan、多天安排、周期计划、每周训练安排或训练日 / 休息日安排时，如果最终只输出动作推荐、kind=exercise_selection、正文动作列表、单次 routine 且没有 schedule.assignments，或只建议用户下一轮再生成计划，必须返回 passed=false 且 status=failed。
```

## Decisions

### Decision 1: 在通用 prompt 写输出类型选择指南

`payload.kind` 是所有训练可见输出的共享结构能力，`exercise_selection`、`routine`、`plan` 的语义边界属于通用 Agent prompt 合同。这里可以列出代表性语义范式，但必须明确不是固定触发词，也不能让服务端按这些文本分流。

### Decision 2: 在业务 tool examples 写第二次查询的输入形态

`searchExerciseResources` 不生成训练方案，但它负责暴露动作事实。模型需要看到缺 section 时如何构造补查 input，因此 examples 应包含 `suitabilities = ["warmup", "stretch"]` 的合法输入。该 example 只说明 tool input 结构，不承诺固定调用次数或最终结构。

### Decision 3: 黑盒 judge prompt 同步 plan 失败边界

真实失败输入可能含有每周频次，期望目标应偏 `plan`。如果 judge 只覆盖 routine，会把 plan 降级失败漏掉。因此 judge prompt 要同时覆盖 routine 与 plan 目标。

## Risks / Trade-offs

- [Risk] 代表性语义范式可能被误读为关键词规则。→ Mitigation：prompt 和 spec 明确这些是语义范式，不是固定触发词；实现不改服务端分流。
- [Risk] prompt 变长增加 token。→ Mitigation：把能力地图和选择指南集中成少量短段，不写完整输出模板。
- [Risk] 只改 prompt 仍不能 100% 保证模型遵守。→ Mitigation：本 change 先补模型可见能力缺口；若真实黑盒仍失败，再单独评估 terminal completion contract 或结构化目标字段。
- [Risk] 普通动作推荐被过度编排。→ Mitigation：明确 `exercise_selection` 仍适用于动作清单、动作事实和替代候选，普通动作推荐不强制补三段。

## Validation Plan

1. `openspec validate clarify-visible-training-output-kind-prompt --strict`
2. Prompt config 测试：断言能力地图、`payload.kind` 选择指南、语义范式和禁止降级文案进入 system prompt。
3. Tool manifest / examples 测试：断言 `searchExerciseResources` 暴露 `warmup` / `stretch` 补查示例。
4. Judge prompt 测试：断言 routine 和 plan 降级为动作列表时判失败。
5. 边界扫描：确认没有在 `/api/chat`、Agent runtime、tool handler、validator 或 renderer 中新增服务端关键词、正则、同义词表、短句模板或具体 phrasing 特判。

## Open Questions

- 是否需要在实现后消耗真实模型调用复跑 F04、F17、F18，以及新增含 `每周 3 练` 的 plan 用例，需要用户单独确认成本。
