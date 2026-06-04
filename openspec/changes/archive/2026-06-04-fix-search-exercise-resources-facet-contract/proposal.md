## Why

最新 trace 显示，模型按 `searchExerciseResources` 的可见示例传入 `homeRequirement: "home_friendly"`，但当前动作库真实 `homeRequirement` facet 中不存在该值，导致本来仍有自重动作的查询被精确筛成 0。这个问题不是模型语义错误，而是 tool 合同和 examples 没有对齐数据库真实 facet。

## What Changes

- 修正 `searchExerciseResources` 的模型可见说明和 examples，删除 `home_friendly` 等当前库中不存在的 facet 示例。
- 为 `homeRequirement`、`equipment`、`level` 等精确 facet 字段补充当前可执行的真实 facet 值说明，避免模型只能按自由字符串猜测。
- 保持 handler、repository、Agent runtime 和 `/api/chat` 主链路语义不变：不新增服务端自然语言纠偏、不做 `home_friendly -> none` 或 `no_equipment -> none` 的服务端语义映射。
- 更新 manifest/schema summary 相关测试，确保模型可见合同能暴露这些真实 facet 说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-facet-contract`: `searchExerciseResources` 的模型可见精确 facet 合同必须对齐当前动作库真实 facet，examples 不得包含不存在的精确筛选值。

## Impact

- 预计影响代码：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
- 预计影响文档：
  - `docs/agent-tool-design.md`
  - `docs/方案变更历史/**`
  - `docs/项目演变历程.md`
- 不涉及 Prisma Schema、数据库迁移、新依赖、Agent core、`/api/chat`、训练生成、保存 artifact、用户记忆或服务端语义归一化。
