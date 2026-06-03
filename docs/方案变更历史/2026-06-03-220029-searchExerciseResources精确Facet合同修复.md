# searchExerciseResources 精确 Facet 合同修复

记录时间：2026-06-03 22:00:29 CST

## 当前真实问题

最新 trace 中，用户要求“新手、在家、无器械、20 分钟、不跳跃的全身训练”时，模型调用 `searchExerciseResources` 并传入 `homeRequirement: "home_friendly"`。这个值来自 tool 的模型可见 example，但当前动作库真实 `homeRequirement` facet 中不存在该值。

查询链路本身执行成功，但 repository 会把 `homeRequirement` 当作精确数据库 facet 过滤。结果是 `training + beginner + body only` 原本还有候选，一加 `home_friendly` 就被筛成 0，模型下一轮只能基于 `satisfied=false` 的空结果解释“没有找到完全符合条件的动作”。

## 调整思路

本次不把问题归因为模型语义错误，也不新增服务端纠偏。模型按自己看到的 tool 合同传参是合理的，真正不合理的是合同里的 example 和字段说明没有对齐当前数据库真实 facet。

因此修复收敛到两点：

- 删除 `home_friendly` 等不存在的模型可见示例值，改用 `none` / `无器械` 等真实 facet。
- 为 `homeRequirement`、`equipment`、`level` 这类精确 facet 字段补充当前可执行值摘要，让模型知道这些字段不是自由语义字符串。

## 关键改动

- `searchExerciseResources` 的 schema 描述和 `whenToUse` 增加当前真实 `level`、`equipment`、`homeRequirement` facet 摘要。
- tool examples 改用 `homeRequirement: "none"`，并保留 `equipment: "body only"` 表达自重动作。
- `docs/agent-tool-design.md` 同步精确 facet 可用值，并把旧示例 `bodyweight`、`no_equipment`、`resistance_band` 改为真实值。
- 测试新增 manifest 断言，确保 Planner 可见合同包含真实 facet，并且不再暴露 `home_friendly` 或 `no_equipment`。

## 设计边界

- 不新增 `home_friendly -> none` 或 `no_equipment -> none` 的服务端映射。
- 不用关键词、正则、同义词表或用户原文判断模型语义。
- 不修改 repository 查询语义、Agent runtime、`/api/chat`、Policy、Resource 或 Response Renderer。
- 不新增 unknown facet repair；如果以后要做，只能作为“参数值不可执行”的确定性合同反馈单独设计。
