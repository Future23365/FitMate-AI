## Context

最新 trace 中，用户问“有没有铅球动作”后，Planner 第 1 轮调用 `searchExerciseResources({ q: "铅球", published: true, sort: "name_asc" })`。工具查询成功，返回 `totalMatches = 0`、`returnedCount = 0`、`exercises = []`，但 `toFulfillment` 因为 `totalMatches === 0` 将结果标记为 `satisfied = false`。Planner 随后两次输出合理自然语言回答并引用该 tool result，Action Validator 按当前 grounding 规则拒绝 `final_answer` 引用 unsatisfied result，最终以 `repair_limit_exceeded` 返回错误。

这个问题的关键不是“0 条是否正确”，而是当前工具合同把“查询事实已完成”和“推荐候选是否满足”混在同一个 `satisfied` 标记里。对于只读动作库事实查询，0 条是有效事实；对于下游训练生成或候选消费，0 条可能是不足。二者不能由 `searchExerciseResources` 直接根据 `totalMatches` 一刀切判断。

本 change 的任务分类是 Agent tool bug 修复，同时涉及单个业务 tool 的模型可见说明。允许触碰 `searchExerciseResources` tool bundle、tool-level tests、生产聊天回归测试、manifest / contract 测试和相关 OpenSpec / 演进文档。禁止触碰 orchestrator 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、`Response Renderer`、`/api/chat` 主链路，也禁止新增服务端关键词、正则、同义词或自然语言语义分流。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 的 0 条合法查询结果成为可引用事实，能够支撑“没有找到符合条件动作”的普通 `final_answer`。
- 保持服务端只返回确定性查询事实，不根据用户原文判断“存在性查询 / 推荐查询 / 可用性查询”。
- 保持 `Action Validator` 的成功 grounding 安全规则：`final_answer` 仍只能引用 `ok=true && fulfillment.satisfied=true` 的 tool result 或合法 consumable resource。
- 明确 `searchExerciseResources` 不产出训练候选资源；需要候选的下游能力必须自行校验候选数量和适用性。
- 补齐模型可见说明和回归测试，覆盖“有没有铅球动作”这类 0 条事实查询收口。

**Non-Goals:**

- 不新增 `purpose`、`queryIntent`、`candidateUse` 等让服务端承接自然语言语义判断的输入字段。
- 不按用户原文关键词判断“有没有”“推荐”“可用”等意图。
- 不放宽通用 grounding validator。
- 不新增或修改 routine / plan 生成工具。
- 不改数据库 schema、权限、生产 `/api/chat` 主链路或 Response Renderer。

## Decisions

### 1. `searchExerciseResources` 成功查询统一 `satisfied=true`

`searchExerciseResources` 的 handler 已经返回 `status: "succeeded"`、查询口径、命中数和动作摘要。只要 handler 成功执行并通过 output schema，`toFulfillment` 就应表达“事实查询已完成”，包含 `totalMatches = 0`。summary 根据 `totalMatches` 和 `excludedCount` 描述事实：查到 N 个、未找到匹配动作、排除已展示动作后没有更多动作。

取舍：保留 `satisfied=false` 看起来能阻止空推荐，但它实际把存在性事实也打成不可引用。正确边界是让下游候选消费方判断候选是否足够，而不是只读查询 tool 提前替语义任务下结论。

### 2. 不新增语义目的字段

本 change 不在 input schema 中新增 `purpose`、`queryType` 或类似字段。即使这些字段由模型输出，也容易让服务端重新承担“用户到底是在问有没有还是要推荐”的语义判断。模型已经能基于 `totalMatches` 和 `exercises` 决定自然语言回答；服务端只需提供事实。

取舍：新增目的字段可以更细，但会把 tool 合同推向语义分类器。当前问题可以通过事实查询和下游候选校验拆分解决，不需要新增语义入口。

### 3. 下游候选不足不在本 tool 内判断

`searchExerciseResources` 仍不产出 `candidate_set` resource、routine / plan draft、训练卡片或保存事件。任何后续生成工具如果需要动作候选，必须消费显式候选或资源并校验数量、section、权限和适用性。空数组不能被下游当作可用候选。

取舍：这避免把只读查询 tool 做成隐藏业务编排器，也避免服务端用 `totalMatches` 代替模型或下游领域校验。

### 4. 模型可见说明同步收紧

tool manifest、`whenToUse` / `whenNotToUse`、observation 的 grounding 文案应明确：0 条是可引用查询事实，模型可以基于它回答“没有找到”；但它不是训练候选集合，也不能被当作 routine / plan / 推荐卡片消费证据。

取舍：只改实现不改模型可见合同会留下 repair 风险；只改 prompt 不改 `toFulfillment` 不能通过 validator。因此实现和模型可见说明必须一起改。

## Risks / Trade-offs

- [Risk] 0 条结果被模型用于“推荐成功”的回答。→ Mitigation: tool manifest 明确该 tool 不产出训练候选资源，相关测试覆盖下游空候选不能被当作候选满足；同时保持生成类消费方自己的候选校验。
- [Risk] 放松 `toFulfillment` 被误解为放松通用 grounding。→ Mitigation: 不改 Action Validator，并保留 final answer 引用 failed / unsatisfied tool result 的测试。
- [Risk] 模型仍在 0 条时给出臆造替代动作。→ Mitigation: observation 只提供空 `exercises` 和查询摘要；测试覆盖投影不泄漏未返回候选，后续可用黑盒评估回答质量。
- [Risk] 历史 spec 曾写过具体筛选 0 条应 `satisfied=false`。→ Mitigation: 本 change 明确更新当前合同：只读事实查询的 0 条不是失败；候选消费不足由下游校验承接。
