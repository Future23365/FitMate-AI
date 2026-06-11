## Context

`searchExerciseResources` 当前是生产 LangChain Agent Runtime 中的只读动作库事实查询 tool。它按结构化输入筛选发布态 `Exercise`，并把结果投影为 `groups.<section>.exercises[]` 供模型生成普通回答或提交 `visibleTrainingProposal` 前使用。

当前多肌群查询存在两个执行层问题：

- `muscles` 是 OR 查询，结果按固定排序截取前 `maxReturnedPerSection` 条，容易集中在少数肌群，不能稳定支撑“全身”这类多肌群覆盖需求。
- 当某个请求肌群在当前过滤条件下没有候选时，模型只能从返回动作中推断，无法区分“确实 0 条”和“被截断挤出返回列表”，容易再次调用同一查询 tool 进行确认。

本 change 来自具体 trace，但修复对象不是用户短句，也不是服务端自然语言分流；问题类型归类为单个业务 tool 的查询结果组织与模型可见事实摘要不足。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 在多肌群输入下尽量均衡返回各请求肌群的候选动作。
- 在 `groups.<section>` 下用简单字段表达当前过滤条件下匹配数量为 0 的请求肌群。
- 保持 tool 的只读动作事实查询职责，不让它生成 routine、plan、处方、保存结果或最终训练结构。
- 保持模型可见输出简洁，避免新增复杂覆盖报表。
- 保持数据库查询下推，避免回退到全表读取后内存过滤。

**Non-Goals:**

- 不新增新的业务 tool。
- 不修改 LangChain runtime 主循环、tool wrapper 通用执行、DeepSeek provider payload、`/api/chat` 主链路或 production response adapter 主流程。
- 不新增服务端关键词、正则、同义词表、短句模板或“用户说全身时”的自然语言分流。
- 不让 `searchExerciseResources` 判断用户目标是否完成；用户目标完成度仍由模型最终回答和服务端终态 validator 共同约束。
- 不改变 `query.totalMatches` 的含义；它仍表示整体 OR 查询命中数量，不改为各肌群 count 求和。

## Decisions

### 1. 在 `groups.<section>` 增加 `zeroMatchMuscles`

`zeroMatchMuscles` 表示该 section 在当前过滤条件下，哪些请求肌群的独立匹配数量为 0。例如 `suitabilities=["training"]`、`level="初级"`、`equipment="no_equipment"`、`muscles=["胸部","背部","肩部"]` 时，`groups.training.zeroMatchMuscles=["肩部"]` 只表示 `training + 初级 + no_equipment + 肩部` 当前没有候选。

选择该字段而不是 `missingMuscles`，是为了避免模型误解为动作库永久缺失该肌群或用户目标失败。

### 2. 独立肌群 count 不能从最终返回列表倒推

服务端必须对每个请求肌群在当前 section 和其他过滤条件下进行独立 count 或等价可验证统计。只有 count 为 0 的请求肌群才能进入 `zeroMatchMuscles`。

最终 `exercises[]` 没有出现某个肌群不代表该肌群为 0，因为它可能只是被排序或数量上限挤出。因此禁止从最终返回列表反推 `zeroMatchMuscles`。

### 3. 多肌群查询使用均衡候选选择

当输入包含多个 `muscles` 时，handler / repository 应按请求肌群构造候选池并进行 round-robin 或等价分桶选择，使 `groups.<section>.exercises[]` 尽量覆盖每个非 0 命中的请求肌群。

均衡选择必须服从既有 hard filter policy、`requiredExerciseIds` 正向锚点、`excludeExerciseIds` 负向约束、发布态过滤、section 边界和服务端 `maxReturnedPerSection`。如果候选数量不足，返回可用候选并通过 `returnedCount`、`truncated` 和 `zeroMatchMuscles` 表达事实。

### 4. 输出结构保持简单

不新增 `coverageByMuscle`、`missingMuscles`、`uncoveredMuscles` 或大型分析报表。模型仍主要消费 `groups.<section>.exercises[]`，只额外看到 `zeroMatchMuscles` 这一组短数组。

如果需要说明候选不足或全 section 无候选，继续复用现有 `diagnostics`。`zeroMatchMuscles` 只表达“按请求肌群拆分后的 0 命中事实”，不承担下一步策略建议。

### 5. 模型可见说明局部更新

需要同步更新 `searchExerciseResources` 的 tool description、schema description 或 model-visible summary，说明：

- `muscles` 多值查询会尽量均衡返回各请求肌群的动作候选。
- `zeroMatchMuscles` 是当前 section、当前过滤条件下的 0 命中请求肌群。
- `zeroMatchMuscles` 不表示数据库永久缺失、不表示用户目标失败，也不要求固定继续调用某个 tool。

这些说明属于单个业务 tool 模型可见说明，不写入通用 Agent prompt。

## Risks / Trade-offs

- [Risk] 多肌群独立 count 可能增加数据库查询次数。
  Mitigation: 仅在 `muscles.length > 1` 时启用；实现时保持 select/count 下推，并使用集中配置或硬上限控制每 section 返回规模。

- [Risk] 同一动作可能匹配多个肌群，导致均衡抽样重复。
  Mitigation: 按 `exerciseId` 去重，并在去重后继续 round-robin 补齐候选。

- [Risk] `zeroMatchMuscles` 被模型误读成全库缺失或计划失败。
  Mitigation: 字段说明和 model-visible summary 必须明确它只表示当前 section 与当前过滤条件下的 0 命中事实。

- [Risk] `requiredExerciseIds` 与均衡抽样发生优先级冲突。
  Mitigation: `requiredExerciseIds` 仍是正向锚点，优先纳入对应 groups；均衡抽样用于填充剩余候选，不覆盖 required diagnostics。

- [Risk] 为单个 tool 修改 runtime 或 route。
  Mitigation: 本 change 明确禁止修改 LangChain runtime 主循环、provider payload、`/api/chat` 主链路和 response adapter 主流程。
