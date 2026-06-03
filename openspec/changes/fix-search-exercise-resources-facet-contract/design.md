## Context

`searchExerciseResources` 是生产文本聊天当前可见的只读动作资源查询 tool。它的输入字段被 repository 当作数据库精确 facet 执行，例如 `homeRequirement` 会精确匹配 `Exercise.homeRequirement` 或 `Exercise.homeRequirementZh`。

本次 trace 中，模型传入 `homeRequirement: "home_friendly"`。这个值来自 tool example，但当前本地动作库真实 facet 是 `none`、`floor`、`support`、`small_equipment`、`gym_equipment`、`partner`、`outdoor` 等，导致查询被精确过滤清零。模型按可见合同传参是合理的，问题在模型可见合同不真实。

任务分类：

- 主类型：Agent tool bug 修复。
- 模型可见合同类型：单个业务 tool 的 schema 描述、manifest 说明和 examples。
- core contract 变更：不在范围内。
- production 接入变更：不在范围内。

允许触碰模块：

- `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- `tests/agent-tools/search-exercise-resources.test.ts`
- `tests/agent-core/tool-registry-manifest.test.ts`
- `docs/agent-tool-design.md`
- 项目演变和方案变更文档。

禁止触碰模块：

- Agent core Runtime 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`Resource Contract Validator` 和 `Response Renderer`。
- `/api/chat` route 或 chat production 主链路。
- repository 查询语义、Prisma Schema、数据库迁移、routine / plan / patch 生成、保存 artifact、用户记忆。
- 任何服务端基于用户原文、关键词、正则、同义词或旧 facet 别名改写 LLM 语义或工具入参的逻辑。

## Goals / Non-Goals

**Goals:**

- 删除 `searchExerciseResources` 模型可见 examples 中不存在的 `homeRequirement` 示例值。
- 在精确 facet 字段说明中列出当前可执行的真实 facet，尤其是 `homeRequirement`、`equipment` 和 `level`。
- 让 manifest/schema summary 测试证明模型可见合同包含真实 facet 说明。
- 保持当前工具只读、精确查询、`satisfied=false` 空结果合同不变。

**Non-Goals:**

- 不新增 unknown facet repair 机制。
- 不新增服务端 alias、同义词表或语义归一化。
- 不把 `searchExerciseResources` 改成 routine / plan 候选集合 builder。
- 不新增分页、统计、详情读取、保存或训练生成能力。

## Decisions

### Decision 1: 修合同，不修模型

把 `home_friendly` 从 examples 中移除，替换为当前数据库真实值，例如 `none` 或中文 `无器械`。这承认模型是按可见合同执行，不把问题归咎于模型理解。

备选方案：在服务端把 `home_friendly` 自动改成 `none`。该方案会引入服务端语义映射，并可能继续扩大成同义词表，放弃。

### Decision 2: 只在模型可见说明中列真实 facet

`homeRequirement`、`equipment`、`level` 等字段仍保持字符串 schema，因为数据库 facet 可能随动作库变化；本次只在 schema 描述、manifest 和 examples 中列出当前真实可执行值。

备选方案：把字段改成 `z.enum()`。该方案会把数据库 facet 固化进编译期 schema，后续动作库扩展会要求同步改代码；当前变更只修可见合同，暂不采用。

### Decision 3: 不新增 unknown facet repair

本次不把未知 facet 变成新的 repair 机制，只防止模型继续被错误 example 诱导。未来如果要做 unknown facet 结构化反馈，应作为独立 change 设计，并明确它只能反馈“参数值不可执行”，不能替模型选择语义。

## Risks / Trade-offs

- [Risk] 真实 facet 未来变化后说明再次过期。→ Mitigation: 测试锁定当前 manifest 文案；后续动作库 facet 变更时应同步更新 tool 合同。
- [Risk] 只列说明但 schema 仍是 string，模型仍可能传不存在的值。→ Mitigation: 本次修复先去掉确定误导；未知 facet repair 作为后续独立设计，不在本次混入。
- [Risk] 列出过多 facet 增加 prompt 体积。→ Mitigation: 只列关键精确 facet 的当前值，不把完整动作库统计塞入 prompt。
