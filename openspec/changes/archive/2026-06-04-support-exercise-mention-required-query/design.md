## Context

当前生产 Agent 可见的动作事实能力主要是 `searchExerciseResources`。它适合按结构化筛选条件查一组发布态动作，但 input 只有单个 `q`，没有“一组用户点名动作”的受控解析入口。最新排查中，用户历史请求包含“俯卧撑、深蹲和平板支撑”，模型实际只调用 `searchExerciseResources(q: "俯卧撑")`，另外两个点名动作没有进入数据库查询和后续 `visibleTrainingProposal` 事实链路。

这个问题不应通过服务端读取用户原文拆词修复。语义理解仍由模型负责；服务端只接收模型结构化传入的 `mentions`，并做确定性的数据库动作事实查询。

任务分类为：新增业务 tool + 现有业务 tool 合同调整。允许触碰新 tool bundle、`searchExerciseResources` input schema / handler / projection / tests、`ToolRegistry` 注册、模型可见 manifest / examples / schema summary 和相关 OpenSpec / 黑盒回归；禁止触碰 orchestrator 主循环、`PlannerPort`、Executor 主流程、Policy Guard、Resource Contract Validator、Response Renderer、`/api/chat` 语义分流，以及任何服务端关键词、正则、同义词表或短句模板路由。

## Goals / Non-Goals

**Goals:**

- 给 Planner 一个明确的点名动作解析能力：模型传入 `mentions`，服务端返回每个 mention 在数据库中的命中、歧义或未命中。
- 让 `searchExerciseResources` 支持 `requiredExerciseIds`，把已解析的指定动作优先纳入现有 `groups.<section>.exercises` 列表。
- 保持 `searchExerciseResources` 输出主结构稳定，不新增 `requiredMatches`、`supplementalMatches` 或其他让模型选择的新并行字段。
- 通过 `diagnostics` 表达指定动作无法纳入列表或与筛选条件不完全一致的原因。
- 用 tool-level tests 和生产聊天回归覆盖“包含俯卧撑、深蹲和平板支撑”这类多点名场景。

**Non-Goals:**

- 不在本 change 中解耦 `visibleTrainingProposal` validator 与具体 tool result 的来源关系。
- 不新增 routine / plan 生成 tool，不恢复旧 `searchExercises` candidate-set builder。
- 不让新 tool 生成训练卡片、保存 artifact、写用户记忆或直接输出用户事件。
- 不要求服务端从用户完整自然语言里自动抽取动作名。
- 不改变 `AgentAction`、`final_answer.visibleOutputs[]` 或前端卡片展示合同。

## Decisions

### 1. 新 tool 命名为 `resolveExerciseResourceMentions`

采用 `resolveExerciseResourceMentions`，因为它表达的是“把模型识别出的动作 mention 解析为数据库 Exercise resource”。它不叫 `searchExerciseMentions`，避免和列表搜索混淆；也不叫 `resolveUserExerciseText`，避免暗示服务端会读取完整用户原文做语义理解。

输入采用结构化数组：

```ts
mentions: [
  { text: "俯卧撑", sectionHint: "training" },
  { text: "深蹲", sectionHint: "training" },
  { text: "平板支撑", sectionHint: "training" }
]
```

`text` 只能来自模型对用户表达的结构化提取。handler 只做数据库字段匹配、排序和摘要，不做服务端意图判断。

输出按 mention 对齐返回：

```ts
results: [
  { text: "俯卧撑", status: "matched", matches: [...] },
  { text: "深蹲", status: "matched", matches: [...] },
  { text: "平板支撑", status: "matched", matches: [...] }
]
```

状态只表达数据库事实：`matched`、`ambiguous`、`not_found`。`matches` 只包含有限动作摘要字段，不返回完整 Exercise 记录。

### 2. `searchExerciseResources` 只扩展 input，不改变 output 主结构

`searchExerciseResources` 新增：

```ts
requiredExerciseIds?: string[]
```

handler 需要在正常筛选结果之外读取这些 id 对应的发布态动作，并在 section 合法时合并到现有 `groups.<section>.exercises` 前部。返回仍是：

```ts
groups: {
  training: {
    totalMatches,
    returnedCount,
    truncated,
    exercises
  }
}
```

不新增：

```ts
requiredMatches
supplementalMatches
selectedRequiredExercises
```

原因是这些字段会把“列表查询”变成“候选编排上下文”，增加模型选择负担。模型只需要看到一个可用动作列表；必要说明进入 `diagnostics`。

### 3. 冲突只进入 `diagnostics`

当 `requiredExerciseIds` 中某个动作不存在、未发布、被 `excludeExerciseIds` 排除、不能用于目标 section，或与当前筛选条件不完全匹配时，tool 不应静默吞掉。它应在现有 `diagnostics` 中返回稳定 code，例如：

```ts
required_exercise_not_found
required_exercise_unpublished
required_exercise_section_conflict
required_exercise_excluded
required_exercise_filter_mismatch
```

其中 `required_exercise_filter_mismatch` 不一定阻止动作进入列表；它用于告诉模型该动作与某些筛选字段存在张力，模型可选择保留用户点名动作、放宽条件重查或向用户解释。

### 4. 模型可见流程保持两步

模型在用户点名多个动作时应优先：

1. 调用 `resolveExerciseResourceMentions` 解析每个点名动作。
2. 将 matched / 选定的 `exerciseId` 传入 `searchExerciseResources.requiredExerciseIds`。
3. 用 `searchExerciseResources` 返回的现有 `groups.*.exercises` 组合最终 `visibleTrainingProposal`。

服务端不根据用户原文强制这个顺序；顺序来自模型可见 manifest、examples 和回归测试约束。

### 5. `requiredExerciseIds` 不是最终输出授权机制

本 change 不解决 `visibleTrainingProposal` validator 来源耦合问题，也不把 `requiredExerciseIds` 设计成最终卡片授权。它只保证 `searchExerciseResources` 能返回包含指定动作的动作列表事实。最终 `visibleTrainingProposal` 是否接受某个 `exerciseId`，仍遵守当前实现已有的终态校验边界；后续 validator 解耦可由单独 change 处理。

## Risks / Trade-offs

- [Risk] 模型仍然跳过 `resolveExerciseResourceMentions`，只用单个 `q` 查询。→ Mitigation：更新新 tool 和 `searchExerciseResources` 的 examples，并补生产聊天 replay / 黑盒回归，覆盖多点名场景必须先解析多个 mentions。
- [Risk] `requiredExerciseIds` 与筛选条件不一致时模型不知道是否使用。→ Mitigation：不新增并行返回字段，只在 `diagnostics` 中说明冲突，主列表仍保持可用动作摘要。
- [Risk] 扩展 `searchExerciseResources` 让它逐渐承担编排职责。→ Mitigation：明确禁止生成 routine / plan / candidateSetId / 训练卡片；只返回动作列表。
- [Risk] 点名动作模糊匹配出现多个候选。→ Mitigation：新 tool 用 `ambiguous` 状态和有限候选摘要表达歧义，模型可选择再调用 `searchExerciseResources` 或向用户澄清。
- [Risk] 旧的 `visibleTrainingProposal` 来源耦合继续存在。→ Mitigation：本 change 不隐藏该问题，只把动作查询能力补齐；最终校验解耦由独立 change 处理，避免混改。
