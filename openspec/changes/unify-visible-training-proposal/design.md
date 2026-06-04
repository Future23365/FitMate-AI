## Context

当前讨论目标不是先接动作卡片，而是先把训练推荐流程的结构化合同跑通。现状风险在于：动作可能由模型在 `final_answer` 正文里自然语言列出，同时服务端另从 `tool_result`、卡片 payload、旧事实桥或后续 artifact 保存跨轮事实。只要这些内容不完全同源，用户实际看到的动作和下一轮模型读取到的事实就可能不一致。

本 change 涉及 Agent 终态输出合同、`searchExerciseResources` 只读查询 tool、模型可见 prompt / schema summary、Response Renderer 和跨轮事实桥。任务分类为 core contract 变更 + 已有业务 tool 合同扩展 + prompt/model input 合同变更。实现阶段必须先确认当前模型实际可见输入来自哪些 builder、manifest、schema summary、observation 和 compressed tool result，再修改对应入口。

这次调整还明确一个架构边界：`visibleTrainingProposal` 是健身业务 payload，不应直接成为 `agent-core` 顶层业务字段。`agent-core` 只新增通用 `visibleOutputs[]` 扩展点；训练方案通过 `outputType = "visibleTrainingProposal"` 注册 validator / renderer / fact bridge。

## Goals / Non-Goals

**Goals:**
- 用 `final_answer.visibleOutputs[]` 表达用户可见结构化输出，避免把健身业务字段硬编码进 `agent-core`。
- 用 `outputType = "visibleTrainingProposal"` 表达本轮 AI 实际推送给用户的训练方案，并让渲染和跨轮事实桥保存同一份 payload。
- 用 `kind` 明确区分 `exercise_recommendation`、`routine`、`plan` 三种结构形态，服务端只校验模型已声明的结构合同，不替模型判断用户意图。
- 用 `exerciseItems` 作为唯一动作事实源，覆盖动作推荐、三段式编排和计划中的训练日安排。
- 扩展 `searchExerciseResources`，支持按 `suitabilities` 查询 `warmup` / `stretch` 候选，并按用途分组投影给模型。
- 修改 prompt / model-visible contract，引导模型根据用户自然语言目标判断需要动作、编排还是计划，但不写关键词式分流规则。
- 删除旧动作推荐事实桥主路径和旧命名，不保留兼容读取，不让旧 payload 继续进入模型上下文或新事实桥。
- 保持服务端职责为结构校验、ID 校验、权限、grounding、渲染和事实保存，不让服务端做语义编排。

**Non-Goals:**
- 不在本 change 中接入最终视觉卡片 UI；本 change 只定义卡片可消费的结构化事件和事实合同。
- 不新增多个动作推荐、编排、计划专用 tool；`searchExerciseResources` 仍是只读动作事实查询 tool。
- 不要求模型一次生成多套每天不同的完整编排；计划只把当前这套编排放到指定训练日。
- 不把热身、拉伸的选择交给服务端规则；服务端只提供候选和校验，模型负责最终选择和排序。
- 不新增关键词、正则、同义词表或短句模板来判断用户意图。
- 不沿用旧的“动作推荐 / routine / plan 三个独立事实块”作为本轮可见训练方案事实源。
- 不为旧 `exercise_recommendation_displayed`、`exercise_recommendation_fact`、`readRecentExerciseRecommendationFact`、`recentExerciseRecommendationFacts` 或 `displayedExerciseIds` 提供兼容读取、别名、迁移适配或 prompt 兜底。

## Decisions

### 1. 使用通用 `visibleOutputs[]`，而不是把 `visibleTrainingProposal` 写进 core 顶层

`final_answer` 增加通用 `visibleOutputs[]`，表示“本轮用户实际会看到、下一轮应可引用的结构化输出”。每个元素使用 envelope：

```ts
{
  outputType: "visibleTrainingProposal",
  schemaVersion: "1",
  payload: VisibleTrainingProposal
}
```

`agent-core` 只校验 envelope 的通用结构、数组大小、字段类型和 terminal grounding，不理解 `visibleTrainingProposal` 的健身业务含义。训练方案 payload 由业务注册的 terminal output validator 校验，由业务 renderer 渲染，由业务 fact bridge 保存。

备选方案是直接在 `FinalAnswerActionSchema` 加 `visibleTrainingProposal` 顶层字段。该方案改动较直观，但会把健身业务字段写入通用 `agent-core`，后续每个业务可见 payload 都容易变成 core 特例。

### 2. `visibleTrainingProposal.kind` 明确结构形态

`VisibleTrainingProposal` payload 必须包含：

```ts
{
  kind: "exercise_recommendation" | "routine" | "plan",
  exerciseItems: VisibleTrainingExerciseItem[],
  schedule?: VisibleTrainingSchedule
}
```

服务端按模型输出的 `kind` 做确定性结构校验：
- `exercise_recommendation`：只允许 `training` 动作，不要求 `prescription`，不允许 `schedule`。
- `routine`：必须包含 `warmup`、`training`、`stretch`，所有动作项必须有 `prescription`。
- `plan`：必须满足完整 `routine` 结构，并额外包含合法 `schedule`。

这不是服务端判断用户意图；服务端只校验模型声明的结构是否自洽。模型如果把用户目标判断错，服务端不得用关键词改写 kind，只能在结构不合法时进入 repair、澄清或失败收口。

### 3. `exerciseItems` 同时承载动作、分段和处方

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
    setRestSeconds: number,
    transitionRestSeconds: number
  }
}
```

只推荐动作时不填 `prescription`；生成编排或计划时在同一个动作项上补 `prescription`。处方字段对齐现有训练草稿和持久化模型中的执行参数，不新增 `restSeconds` 作为主合同字段。

备选方案是 `exerciseIds` 只存 id，另建 `prescriptions` 或 `sections` 字段。该方案看起来更扁平，但会制造按 index 或 id 二次 join 的一致性问题，尤其在模型重排、删减或补热身动作时更容易错位。

### 4. 计划只增加确定性 `schedule`，不生成多套每日编排

计划层只在 `visibleTrainingProposal` 上增加：

```ts
{
  schedule: {
    cycleLengthDays: number,
    assignments: [
      { cycleDayIndex: number, type: "training" | "rest" }
    ]
  }
}
```

`cycleDayIndex` 从 1 开始，`assignments` 必须覆盖 `1..cycleLengthDays` 且不能重复。`schedule` 只表达这套编排在哪些周期日训练、哪些周期日休息。模型不得在一个计划里一次性生成每天不同的多套完整 `exerciseItems`。

备选方案是每天都内嵌一套完整编排。该方案可表达复杂周期，但当前会让模型一次生成多套处方，成本高、错误面大，也会让跨轮事实桥难以判断“这一套动作”指的是哪一套。

### 5. 模型可见候选统一使用 `exerciseId`

当前动作库数据库主键字段是 `Exercise.id`，但 `visibleTrainingProposal` 输出合同使用 `exerciseId`。为减少模型映射错误，`searchExerciseResources` 的模型可见 observation、分组候选、examples 和 schema summary 中，候选 id 字段必须统一暴露为 `exerciseId`。内部 handler / repository 可以继续使用数据库 `id`，但不得让模型在同一合同中同时看到 `id` 和 `exerciseId` 两套可复制字段。

备选方案是保留 observation 中的 `id`，让 prompt 说明“把 id 复制到 exerciseId”。该方案依赖模型做字段映射，容易造成字段名错误或漏填，尤其在 repair 后更不稳定。

### 6. 先确定 `training`，再围绕主训练查 `warmup` / `stretch`

热身和拉伸依赖已经确定的核心动作。用户直接要编排时，模型先通过 `searchExerciseResources` 建立 `training` 主训练候选证据，再基于这批动作和用户目标查询 `suitabilities: ["warmup", "stretch"]`。

如果用户上一轮已经拿到训练方案，后续说“编排一下”，模型应复用事实桥里的 `training` 动作，只查询热身和拉伸。用户只要动作时，只需要 `training` 候选证据，不应额外查询 `warmup` / `stretch`。

这里约束的是证据顺序和事实来源，不把所有真实运行锁死成固定工具调用次数。回归测试可以用 replay planner 覆盖典型 1 次 / 2 次调用路径，但 spec 不应要求服务端用硬编码次数判断业务正确性。

### 7. `searchExerciseResources` 保持只读查询，不变成隐藏编排器

`searchExerciseResources` 新增或调整 `suitabilities` 输入，支持多值筛选；输出按 `warmup`、`stretch` 分组投影候选 `exerciseId` 和必要摘要。tool 不决定最终编排，不生成处方，不保存事实，也不根据用户原文判断要不要编排。

服务端可以基于结构化输入和动作库字段做确定性过滤、存在性校验、分页、分组和 trace 诊断。模型负责理解用户自然语言、选择查询参数、从候选中挑选动作、确定 section、顺序、处方和 schedule。

### 8. 旧事实桥 delete-only，不保留兼容路径

本 change 不迁移旧动作推荐事实桥，而是删除旧主路径。实现必须移除旧事实桥代码、生产 registry 注册、prompt / manifest / schema summary / examples / observations / compressed tool results / repair feedback / tests 中的旧命名。

删除范围包括但不限于：
- `exercise_recommendation_displayed`
- `exercise_recommendation_fact`
- `readRecentExerciseRecommendationFact`
- `recentExerciseRecommendationFacts`
- `displayedExerciseIds`
- `displayedExercises`

新主路径使用：
- `visible_training_proposal_displayed`
- `visible_training_proposal_fact`
- `readRecentVisibleTrainingProposal`
- `recentVisibleTrainingProposals`

如数据库中存在旧 kind 的历史行，本 change 不提供读取兼容，不把旧 payload 转换成新 payload，也不把旧事实投影给模型。需要清理历史数据时，应作为独立数据清理任务处理；当前实现只需保证新链路不读取、不保存、不暴露旧事实。

### 9. Prompt 写成语义判断指南，不写关键词路由

prompt / model-visible contract 必须用中文说明：
- 当用户只需要一批可选动作时，输出 `kind = "exercise_recommendation"`。
- 当用户需要一次可执行训练流程时，输出 `kind = "routine"`，并在主训练动作基础上补充热身、拉伸和处方。
- 当用户需要多天安排时，输出 `kind = "plan"`，并在已有或新生成的编排上增加训练日 / 休息日安排。

这些说明应表达目标和结构差异，而不是写成“用户说某个固定词就必须进入某类流程”。`toolName`、字段名、枚举值和 schema id 保持英文原样。

### 10. 允许触碰模块与禁止触碰模块

允许触碰：
- `AgentAction` / `final_answer.visibleOutputs[]` 通用 schema、schema summary、Action Validator 和 final grounding 中与通用 visible output envelope 直接相关的结构校验。
- terminal output validator / renderer registry 中 `visibleTrainingProposal` 的业务 validator、renderer 和 repair feedback。
- `searchExerciseResources` tool bundle、input/output schema、manifest、model observation、user projection 和 trace projection。
- prompt config、tool manifest、examples、repair feedback、context package、observations 和 compressed tool results。
- 跨轮事实桥中保存和投影 `visibleTrainingProposal` 的逻辑。
- 删除旧动作推荐事实桥代码、旧 read tool 注册、旧模型可见说明和旧测试。
- 与上述合同直接相关的 tests。

禁止触碰：
- 不为本需求新增 `/api/chat` 关键词路由、业务分支或隐藏 tool 执行。
- 不绕过 `ToolRegistry`、`ResourceStore`、`Policy Guard`、`Resource Contract Validator` 或 Response Renderer。
- 不修改 `PlannerPort` 或 agent runtime 主循环来特判动作、编排或计划语义。
- 不让服务端用用户原文关键词、正则、同义词表或规则评分决定用户要动作、编排还是计划。
- 不把 `searchExerciseResources` 扩展成生成处方、生成计划或保存事实的 tool。
- 不把 `visibleTrainingProposal` 作为 `agent-core` 顶层业务字段硬编码。
- 不继续保留旧动作推荐事实桥兼容读取、旧字段别名或旧 prompt 兜底。
- 不从 `searchExerciseResources` 的 `tool_result`、候选分组或用户可见工具投影中直接保存 `visibleTrainingProposal`；这些结果只是候选证据，不是最终推送给用户的训练方案。

## Risks / Trade-offs

- [Risk] 训练业务 payload 污染 `agent-core` → Mitigation：core 只新增 `visibleOutputs[]` envelope，`visibleTrainingProposal` 经业务 validator / renderer registry 处理；architecture-boundary 测试检查 core 中没有业务 outputType 特判。
- [Risk] 模型正文和 `visibleTrainingProposal` 写出不同动作 → Mitigation：Response Renderer 只从已校验的 `visibleOutputs[]` 渲染训练事实，prompt 要求正文只解释，不复制完整动作事实；terminal output validation 拒绝正文承诺但结构缺失的训练推送。
- [Risk] 继续把 `searchExerciseResources` 返回候选保存成跨轮事实 → Mitigation：事实桥保存入口只接受已校验、已进入用户可见 response 的 `visibleTrainingProposal` payload；不得从 `tool_result`、handler output、model observation 或 tool user projection 抽取最终方案事实。
- [Risk] tool 候选数量大于最终选择，导致下一轮把未被用户实际采纳的候选当成“这套方案” → Mitigation：事实桥 payload 只保存 `visibleTrainingProposal.exerciseItems` 中的最终动作、section、order、prescription 和 schedule，不保存未进入最终方案的候选动作作为可复用训练方案。
- [Risk] `warmup` / `stretch` 查询分组被误认为最终补齐结果 → Mitigation：`searchExerciseResources` 的分组 output 只能作为模型选择候选；最终热身和拉伸必须由模型写入 `visibleTrainingProposal.exerciseItems` 后再经服务端结构、来源和数据库存在性校验。
- [Risk] 旧事实桥残留让实现继续按“动作推荐刷新”理解上下文 → Mitigation：delete-only，移除旧 kind / resourceType / read tool / metadata / prompt / tests，旧事实不兼容读取、不进入模型上下文。
- [Risk] 模型生成编排时丢掉上一轮 `training` 动作 → Mitigation：新 fact bridge 投影最近 `visibleTrainingProposal` 的 `training` items，并在 prompt 中要求“基于上一轮动作编排”时保留这些动作，除非用户明确要求替换。
- [Risk] 模型凭空编造 `exerciseId` → Mitigation：服务端校验所有 `exerciseId` 必须来自本轮 satisfied tool result 或可访问的 `visible_training_proposal_fact`，并存在于数据库。
- [Risk] 模型输出 `id` 而不是 `exerciseId` → Mitigation：模型可见候选、examples、schema summary 和 repair feedback 统一只暴露 `exerciseId`，不让模型复制 `id` 字段。
- [Risk] 热身或拉伸被塞进 `training` → Mitigation：schema 限定 section enum，tool result 按 `suitabilities` 分组投影，terminal output validator 校验动作 section 与候选 / 数据库 `allowedSections` 边界；服务端不做语义纠错，只做结构与来源校验。
- [Risk] `schedule` 演变成每天一套完整编排 → Mitigation：schema 只允许 `schedule.assignments` 表达训练 / 休息周期日，不允许 daily nested exercise items。
- [Risk] prompt 写成僵硬关键词分流 → Mitigation：prompt 测试检查模型可见说明不得包含固定关键词路由示例，文案以目标差异和输出结构差异描述。

## Migration Plan

1. 先增加 `final_answer.visibleOutputs[]` 通用 envelope、`visibleTrainingProposal` payload schema、prompt/model-visible contract 和校验测试，不改变生产默认行为。
2. 增加 terminal output validator / renderer registry，使 `outputType = "visibleTrainingProposal"` 可以由业务 validator 校验、业务 renderer 渲染，`agent-core` 不写健身业务分支。
3. 扩展 `searchExerciseResources` 的 `suitabilities` 输入和分组输出，将模型可见候选字段统一为 `exerciseId`，补齐 tool-level contract tests。
4. 删除旧动作推荐事实桥主路径、旧 read tool 注册、旧 metadata 投影和旧模型可见说明；新建 `visible_training_proposal_fact` 保存和读取链路。
5. 接入 Response Renderer，使训练推送结构化事件从已校验 `visibleOutputs[]` 渲染。
6. 接入跨轮事实桥保存和投影，使下一轮能读取上一轮可见训练方案。
7. 最后接入前端卡片消费结构化事件；在卡片未接入前，仍以 renderer 输出的结构化事实为准。

回滚策略：如果上线后训练推送链路出现合同失败，可临时关闭 `outputType = "visibleTrainingProposal"` 的业务 renderer / fact bridge 注册，让模型退回普通文本回答；不得回滚到正文动作列表或旧 `exercise_recommendation_*` 事实桥作为跨轮事实源。

## Open Questions

- 现有 `exerciseId` 是否已经完全等同于动作英文主键；实现前需要用数据库 schema 和动作查询代码确认，并把模型可见候选字段统一为 `exerciseId`。
- `visible_output` NDJSON 事件的最终 type 名称是否直接使用 `visible_output`，还是复用现有前端事件协议中的等价结构化事件；无论命名如何，payload 必须来自已校验 `visibleOutputs[]`。
