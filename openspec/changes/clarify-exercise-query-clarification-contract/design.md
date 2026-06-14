## Context

生产 `/api/chat` 当前使用 `LangChain Agent Runtime + DeepSeek native tool_calls`。`searchExerciseResources` 是只读动作库事实查询 tool，负责按结构化 facet 查询 Exercise 候选事实，再把受控动作候选回填给模型用于普通回答或结构化训练结果收口。

当前动作表已经有主肌群和辅助肌群数组字段：`primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles`、`secondaryMusclesZh`。但 `searchExerciseResources.muscles` 现有查询语义会同时匹配主肌群和辅助肌群。这样在“按目标肌群推荐动作”的场景里，模型会拿到很多“目标肌群参与稳定”的动作，例如主练胸部但辅助腹肌的动作。它们不是错误数据，但不应该和腹肌主练动作处在同一个默认推荐候选口径里。

任务分类：已有业务 tool 执行合同调整 + 单个业务 tool 模型可见合同调整 + 默认 prompt Planner Policy 调整。`agent-tool-change-governance` 用于限定 `searchExerciseResources` 的 schema、handler、repository、projection 和测试边界；`agent-prompt-contract-governance` 用于检查默认 prompt、tool description、schema description 和 tool result summary 的模型可见分层；`agent-fix-abstraction-gate` 用于确认本方案不把具体用户短句、trace 字段组合或业务实例写成通用生产规则。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 能显式表达肌群匹配角色：主练命中或主/辅任意命中。
- 将 `muscles` 的默认匹配口径改为主肌群命中，使目标肌群动作推荐默认返回更可交付的候选池。
- 保留辅助肌群查询能力，用于解释某动作是否带到某肌群、查询参与肌群或覆盖宽泛相关动作。
- 让模型可见 tool description、schema description、summary、projection 和 trace 都能说明当前 `muscleMatchRole`。
- 让默认 prompt 表达稳定策略：目标肌群推荐默认使用主肌群口径；只有宽泛参与语义才使用 `any`。
- 用 tests 和 model-visible contract gate 证明没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。

**Non-Goals:**

- 不新增数据库字段，不把主练肌群压缩成单值字段，不删除 `secondaryMuscles*`。
- 不改变动作数据来源、导入脚本或现有动作数据回填。
- 不把 `searchExerciseResources` 改成推荐排序器、训练生成器、处方生成器或隐藏业务编排器。
- 不修改 LangChain runtime 主循环、provider payload、production response adapter、`/api/chat` 主链路或 finalization tool 通用合同。
- 不让服务端根据用户原文、关键词、正则、同义词、短句模板或具体 phrasing 自动改写 provider `tool_calls` 或 tool input。

## Decisions

### 1. 新增 `muscleMatchRole`，默认 `primary`

`searchExerciseResources` 增加输入字段：

```ts
muscleMatchRole?: "primary" | "any"
```

默认值为 `primary`。当模型只传 `muscles` 时，repository 只匹配 `primaryMuscles` 和 `primaryMusclesZh`。当模型明确传 `muscleMatchRole = "any"` 时，repository 匹配 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh`。

备选方案是直接从查询中删除辅助肌群匹配。该方案会破坏“某动作是否会带到核心”“哪些动作会辅助刺激腹肌”这类合法场景，因此不采用。辅助肌群不是错误事实，只是不应该作为默认推荐口径。

备选方案是新增 `primaryMusclesOnly: true`。该名称是一次 trace 中模型曾尝试使用的字段形态，容易把失败输出反向升格为生产合同。本 change 采用更稳定的抽象名 `muscleMatchRole`，表达资源查询的匹配角色，而不是某个 case 的修复字段。

### 2. Tool 负责结构化匹配语义，不负责推荐排序

`muscleMatchRole` 只决定数据库 hard filter 的肌群字段集合，不决定推荐排序、动作质量分、最终展示数量或结构化训练结果。`candidateGroups[].exercises` 仍然是候选事实，不是最终推荐清单。

默认 `primary` 会让候选池更贴近目标肌群动作推荐，但不会让 tool 判断“已满足用户目标”。最终是否提交 `submitVisibleTrainingProposal`、普通回答或澄清，仍由模型基于当前用户目标、成功 tool result、结构化输出合同和服务端 validator 自主规划。

### 3. 模型可见合同同步到 description、schema 和 summary

模型需要在三个层级看到同一件事：

- schema description：说明 `muscleMatchRole` 的枚举值、默认值和输入来源。
- tool description：说明目标肌群推荐默认使用 `primary`；宽泛参与查询使用 `any`。
- tool result summary / projection / trace：回填 `muscleMatchRole`，让模型知道当前结果已经是主练命中，避免误以为还需要通过扩大 `candidateCountPerSection` 或重复调用同类查询来过滤辅助命中。

这些说明属于业务 tool 局部说明，不写进通用 runtime 或 `/api/chat` 分流逻辑。

### 4. 默认 prompt 写 Planner Policy，不写字段 API 文档

默认 prompt 只写稳定策略：目标肌群动作推荐按主练肌群理解；如果用户目标表达的是肌群参与、带到、辅助刺激或覆盖相关动作，则可使用宽泛参与口径。prompt 不列举 `searchExerciseResources` 的字段细节，也不根据具体用户短句或关键词触发某个字段值。

字段枚举、默认值和输入来源放在 `searchExerciseResources` 的 schema description / tool description 中，符合 `docs/llm-prompt-guidance.md` 的分层：Prompt 定策略，Schema 定形状，Tool 定能力和字段语义，Validator 守边界。

### 5. 不升级为通用 runtime 合同变更

本 change 只修改单个业务 tool 的输入合同、repository filter 和模型可见说明。连续调用上限、provider tool availability、terminal failure finalizer 等 runtime 保护保持不变。若后续需要处理“provider 返回当前 request.tools 之外的 tool call”，应另开 runtime / wrapper 通用合同 change。

## Risks / Trade-offs

- [Risk] 默认 `primary` 会让某些原本依赖辅助肌群匹配的宽泛查询返回更少候选。  
  → Mitigation：保留 `muscleMatchRole = "any"`，并在 tool description / prompt 中说明宽泛参与查询使用该口径。

- [Risk] 模型仍可能在宽泛推荐场景里错误使用 `any`。  
  → Mitigation：用 production catalog 和 runtime prompt 测试覆盖“目标肌群推荐默认 primary”和“参与语义才 any”的模型可见说明。

- [Risk] 只改默认匹配角色不等于完整推荐排序，候选池仍可能不是最佳排序。  
  → Mitigation：本 change 只解决主/辅肌群混查导致的默认候选池污染；推荐排序可以后续另开 change 设计，不在本次 scope 内隐式加入。

- [Risk] OpenSpec 名称仍包含 clarification，但新范围更偏执行合同。  
  → Mitigation：保留目录以复用已有 in-progress change，文档中明确当前范围已经扩展为 `muscleMatchRole` 执行合同调整。

## Migration Plan

1. 更新 OpenSpec delta spec 和 tasks。
2. 更新 `searchExerciseResources` input schema、description、model-visible summary、user projection 和 trace summary。
3. 更新 repository 肌群 filter，使默认 `primary` 只匹配主肌群字段，显式 `any` 匹配主/辅肌群字段。
4. 更新默认 prompt 中目标肌群推荐和宽泛参与查询的 Planner Policy。
5. 更新 tool-level、production catalog、runtime prompt 和 model-visible contract gate 测试。
6. 运行 `openspec validate clarify-exercise-query-clarification-contract --strict`、相关 `npm test` 和 `npm run typecheck`。

回滚策略：如果默认 `primary` 导致重要场景召回不足，可回滚 schema 默认值、repository filter 和模型可见说明；不涉及数据库迁移或数据回填。
