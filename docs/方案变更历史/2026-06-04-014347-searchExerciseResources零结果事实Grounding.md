# searchExerciseResources 零结果事实 Grounding 修复

时间：2026-06-04 01:43:47 CST

## 当前真实问题

用户问“有没有铅球动作”时，生产聊天链路正确调用了 `searchExerciseResources(q="铅球")`，动作库查询成功返回 `totalMatches = 0`。但工具合同把 0 条结果直接标成 `fulfillment.satisfied = false`，模型随后引用该 tool result 回答“没有找到”时，被 Action Validator 判定为 `terminal_reference_invalid`，repair 后仍重复非法引用，最终返回 `repair_limit_exceeded`。

这个问题不是数据库查询失败，也不是模型理解错了“有没有”。根因是服务端工具合同把“查询事实已完成”和“推荐候选是否足够”绑定在同一个 `satisfied=false` 上，导致“没有找到”这种合法事实回答失去 grounding。

## 调整思路

`searchExerciseResources` 只做只读动作库事实查询。只要结构化查询执行成功并通过 output schema，结果就应是可引用事实；`totalMatches = 0` 只是事实内容，不代表工具失败，也不代表服务端可以替模型判断用户语义。

需要候选的 routine、plan、训练卡片或推荐消费流程，继续由下游按自己的输入合同、resource contract 和领域校验判断候选是否足够。空数组不能被下游当作可用候选，但也不能阻止普通文本回答“当前没有找到”。

## 关键改动

1. `searchExerciseResources` 的 0 条成功查询改为 `fulfillment.satisfied = true`。
2. fulfillment summary 明确区分“查询到 N 个动作”“当前发布态动作库没有匹配结果”“排除已展示动作后没有更多匹配结果”。
3. tool manifest 和模型 observation 增加 0 条事实查询 grounding 说明，并明确该结果不是 routine、plan、训练卡片或候选消费资源。
4. 不新增 `purpose`、`queryIntent`、`existenceCheck` 等语义目的字段，不引入服务端关键词、正则、同义词表或用户原文分流。
5. 保持 Action Validator 通用规则不变：failed 或 `satisfied=false` 的 tool result 仍不能支撑成功 `final_answer`。

## 为什么不是最小补丁

最小补丁可以在 validator 中给 `searchExerciseResources` 开特例，或者让服务端看到“有没有”时绕过 `usedToolResultIds`。这两种都会把自然语言语义判断重新拉回服务端，破坏 Agent tool 合同边界。

本次选择修业务 tool 合同：让事实查询如实表达事实，下游消费自己校验候选。这样既能修复当前 0 条回答报错，也不会把空候选误当成训练生成成功。

## 验证口径

- `searchExerciseResources(q="铅球")` 返回 0 条时，runtime 可以用 `final_answer.usedToolResultIds` 合法收口。
- 排除已展示动作后没有更多结果时，仍返回可引用事实，并不回填已排除动作。
- failed 或 `satisfied=false` 的 tool result 继续不能支撑成功 `final_answer`。
- manifest / observation 保留中文模型可见说明，并禁止语义目的字段进入 input schema。
