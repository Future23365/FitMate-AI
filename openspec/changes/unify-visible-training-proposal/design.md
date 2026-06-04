## Context

当前讨论目标不是先接动作卡片，而是先把训练推荐流程的结构化合同跑通。现状风险在于：动作可能由模型在 `final_answer` 正文里自然语言列出，同时服务端另从 tool result、卡片 payload 或后续 artifact 保存跨轮事实。只要这两份内容不完全同源，用户实际看到的动作和下一轮模型读取到的事实就可能不一致。

本 change 涉及 Agent 终态输出合同、`searchExerciseResources` 只读查询 tool、模型可见 prompt / schema summary、Response Renderer 和跨轮事实桥。任务分类为 core contract 变更 + 已有业务 tool 合同扩展 + prompt/model input 合同变更。实现阶段必须先确认当前模型实际可见输入来自哪些 builder、manifest、schema summary、observation 和 compressed tool result，再修改对应入口。

## Goals / Non-Goals

**Goals:**
- 用 `visibleTrainingProposal` 表达本轮 AI 实际推送给用户的训练方案，并让渲染和跨轮事实桥保存同一份结构。
- 用 `exerciseItems` 作为唯一动作事实源，覆盖动作推荐、三段式编排和计划中的训练日安排。
- 让推荐动作、编排和计划成为同一结构的逐步增强，而不是三个互相复制的业务块。
- 扩展 `searchExerciseResources`，支持按 `suitabilities` 查询 `warmup` / `stretch` 候选，并按用途分组投影给模型。
- 修改 prompt / model-visible contract，引导模型根据用户自然语言目标判断需要动作、编排还是计划，但不写关键词式分流规则。
- 保持服务端职责为结构校验、ID 校验、权限、grounding、渲染和事实保存，不让服务端做语义编排。

**Non-Goals:**
- 不在本 change 中接入最终视觉卡片 UI；本 change 只定义卡片可消费的结构化事件和事实合同。
- 不新增多个动作推荐、编排、计划专用 tool；`searchExerciseResources` 仍是只读动作事实查询 tool。
- 不要求模型一次生成多套每天不同的完整编排；计划只把当前这套编排放到指定训练日。
- 不把热身、拉伸的选择交给服务端规则；服务端只提供候选和校验，模型负责最终选择和排序。
- 不新增关键词、正则、同义词表或短句模板来判断用户意图。
- 不沿用旧的“动作推荐 / routine / plan 三个独立事实块”作为本轮可见训练方案事实源。

## Decisions

### 1. 使用 `visibleTrainingProposal` 作为唯一可见训练方案字段

`final_answer` 增加 `visibleTrainingProposal`，表示“本轮用户实际会看到、下一轮应可引用的训练方案”。字段名直接表达可见训练方案的作用，避免用 `exerciseIds`、`routine`、`plan` 这类只覆盖局部含义的名字误导模型。

备选方案是继续保留 `exerciseRecommendation`、`routineProposal`、`planProposal` 三个并列字段。该方案会让同一批核心动作在不同字段之间重复，并且用户说“把这一套编排一下”时需要跨字段复制和合并，长期更容易出现动作丢失或不一致。

### 2. `exerciseItems` 同时承载动作、分段和处方

`visibleTrainingProposal.exerciseItems` 是唯一动作事实源。每个动作项包含：

```ts
{
  exerciseId: string,
  section: "training" | "warmup" | "stretch",
  order: number,
  prescription?: {
    mode: "reps" | "duration",
    sets: number,
    target: number,
    restSeconds?: number
  }
}
```

只推荐动作时不填 `prescription`；生成编排时在同一个动作项上补 `prescription`。这样避免把动作 id 和“怎么做”拆进两份结构，减少模型输出不一致和服务端合并风险。

备选方案是 `exerciseIds` 只存 id，另建 `prescriptions` 或 `sections` 字段。该方案看起来更扁平，但会制造按 index 或 id 二次 join 的一致性问题，尤其在模型重排、删减或补热身动作时更容易错位。

### 3. 计划只增加 `schedule`，不生成多套每日编排

计划层只在 `visibleTrainingProposal` 上增加：

```ts
{
  schedule: {
    cycleLengthDays: number,
    assignments: [
      { dayIndex: number, type: "training" | "rest" }
    ]
  }
}
```

`schedule` 表达这套编排在哪些天训练、哪些天休息。模型不得在一个计划里一次性生成每天不同的多套完整 `exerciseItems`。这样既符合“动作组成编排，编排放进多天计划”的关系，也降低模型一次输出大量重复结构导致的漂移。

备选方案是每天都内嵌一套完整编排。该方案可表达复杂周期，但当前会让模型一次生成多套处方，成本高、错误面大，也会让跨轮事实桥难以判断“这一套动作”指的是哪一套。

### 4. 先查 `training`，再围绕主训练查 `warmup` / `stretch`

热身和拉伸依赖已经确定的核心动作。用户直接要编排时，模型先调用 `searchExerciseResources` 确定 `training` 动作，再基于这批动作和用户目标调用一次 `searchExerciseResources` 查询 `suitabilities: ["warmup", "stretch"]`。

如果用户上一轮已经拿到动作，后续说“编排一下”，模型应复用事实桥里的 `training` 动作，只查询热身和拉伸。用户只要动作时，只查 `training`。

备选方案是一次同时查询 `training`、`warmup`、`stretch`。该方案在模型尚未确定主训练时就选热身/拉伸，相关性会变弱；例如主训练最终是深蹲和弓步，热身应偏髋、膝、踝激活，拉伸也应围绕下肢。

### 5. `searchExerciseResources` 保持只读查询，不变成隐藏编排器

`searchExerciseResources` 新增或调整 `suitabilities` 输入，支持多值筛选；输出可以按 `warmup`、`stretch` 分组投影候选 id 和必要摘要。tool 不决定最终编排，不生成处方，不保存事实，也不根据用户原文判断要不要编排。

服务端可以基于结构化输入和动作库字段做确定性过滤、存在性校验、分页、分组和 trace 诊断。模型负责理解用户自然语言、选择查询参数、从候选中挑选动作、确定 section、顺序、处方和 schedule。

### 6. Prompt 写成语义判断指南，不写关键词路由

prompt / model-visible contract 必须用中文说明：
- 当用户只需要一批可选动作时，输出训练动作推荐。
- 当用户需要一次可执行训练流程时，输出包含热身、主训练、拉伸和处方的编排。
- 当用户需要多天安排时，在已有或新生成的编排上增加训练日 / 休息日安排。

这些说明应表达目标和结构差异，而不是写成“用户说某个固定词就必须进入某类流程”。`toolName`、字段名、枚举值和 schema id 保持英文原样。

### 7. 允许触碰模块与禁止触碰模块

允许触碰：
- `AgentAction` / `final_answer` schema、schema summary、Action Validator 和 final grounding 中与 `visibleTrainingProposal` 直接相关的结构校验。
- `searchExerciseResources` tool bundle、input/output schema、manifest、model observation、user projection 和 trace projection。
- prompt config、tool manifest、examples、repair feedback、context package、observations 和 compressed tool results。
- Response Renderer 中从 `visibleTrainingProposal` 渲染用户可见事件的逻辑。
- 跨轮事实桥中保存和投影 `visibleTrainingProposal` 的逻辑。
- 与上述合同直接相关的 tests。

禁止触碰：
- 不为本需求新增 `/api/chat` 关键词路由、业务分支或隐藏 tool 执行。
- 不绕过 `ToolRegistry`、`ResourceStore`、`Policy Guard`、`Resource Contract Validator` 或 Response Renderer。
- 不修改 `PlannerPort` 或 agent runtime 主循环来特判动作、编排或计划语义。
- 不让服务端用用户原文关键词、正则、同义词表或规则评分决定用户要动作、编排还是计划。
- 不把 `searchExerciseResources` 扩展成生成处方、生成计划或保存事实的 tool。

## Risks / Trade-offs

- [Risk] 模型正文和 `visibleTrainingProposal` 写出不同动作 → Mitigation：Response Renderer 只从 `visibleTrainingProposal` 渲染训练事实，prompt 要求正文只解释，不复制完整动作事实；final grounding 拒绝正文承诺但结构缺失的训练推送。
- [Risk] 模型生成编排时丢掉上一轮 `training` 动作 → Mitigation：ContextPackage / fact bridge 投影最近 `visibleTrainingProposal` 的 `training` items，并在 prompt 中要求“基于上一轮动作编排”时保留这些动作，除非用户明确要求替换。
- [Risk] 模型凭空编造 `exerciseId` → Mitigation：服务端校验所有 `exerciseId` 必须来自本轮 satisfied tool result 或可访问的跨轮事实桥，并存在于数据库。
- [Risk] 热身或拉伸被塞进 `training` → Mitigation：schema 限定 section enum，tool result 按 `suitabilities` 分组投影，测试覆盖 section 错位和编排补齐场景；服务端不做语义纠错，只做结构与来源校验。
- [Risk] `schedule` 演变成每天一套完整编排 → Mitigation：schema 只允许 `schedule.assignments` 引用当前方案的训练 / 休息日，不允许 daily nested exercise items。
- [Risk] prompt 写成僵硬关键词分流 → Mitigation：prompt 测试检查模型可见说明不得包含固定关键词路由示例，文案以目标差异和输出结构差异描述。
- [Risk] 旧 routine / plan artifact 合同与新可见方案字段并存导致概念冲突 → Mitigation：本 change 以 `visibleTrainingProposal` 作为聊天推送事实源；旧 artifact 可作为保存后的实体或历史读取对象，但不得替代本轮可见训练方案字段。

## Migration Plan

1. 先增加 `visibleTrainingProposal` schema、prompt/model-visible contract 和校验测试，不改变生产默认行为。
2. 扩展 `searchExerciseResources` 的 `suitabilities` 输入和分组输出，补齐 tool-level contract tests。
3. 接入 Response Renderer，使训练推送事件从 `visibleTrainingProposal` 渲染。
4. 接入跨轮事实桥保存和投影，使下一轮能读取上一轮可见训练方案。
5. 最后接入前端卡片消费结构化事件；在卡片未接入前，仍以 renderer 输出的结构化事实为准。

回滚策略：如果上线后训练推送链路出现合同失败，可临时关闭训练推送类 `visibleTrainingProposal` 渲染入口，让模型退回普通文本回答；不得回滚到正文动作列表作为跨轮事实源。

## Open Questions

- 现有 `exerciseId` 是否已经完全等同于动作英文主键；实现前需要用数据库 schema 和动作查询代码确认。
- `prescription.restSeconds` 是否需要拆成 `setRestSeconds` / `transitionRestSeconds`，还是先保持单一休息字段；实现阶段应以当前训练执行模型为准。
- `schedule.assignments.type` 是否只需要 `training` / `rest`，还是需要 `mobility` 等轻量恢复日；本 change 先不扩大枚举。
