## Why

动作编排页右侧动作库已经有热身、训练、拉伸阶段筛选，但缺少“全部”入口，用户无法快速回到完整动作库视图。
同时阶段筛选与下方分类、肌群、器械、难度、居家条件筛选仍可能叠加出语义冲突，例如选择“热身”后仍保留只属于拉伸阶段的分类，导致空结果但用户难以判断原因。

## What Changes

- 在动作编排页右侧动作库阶段入口中增加“全部”，并将默认阶段筛选改为“全部”。
- 明确阶段筛选语义：选择“全部”时不向 `/api/exercises` 发送 `workoutSection`；选择“热身、训练、拉伸”时继续发送 `warmup`、`training`、`stretch`。
- 明确现有热身、训练、拉伸推断条件，并评估其合理性：当前可作为过渡实现，但应集中为可测试的共享阶段分类函数，避免接口和编排归一化使用不同规则。
- 让下方分类、肌群、器械、难度、居家条件选项与当前阶段筛选同步；切换阶段后若已有下方筛选在新阶段范围内不可用，系统自动清除该筛选。
- 调整 `/api/exercises` 返回的 facets 作用域，使下方筛选选项来自当前阶段范围，而不是全量动作库，避免用户选到会与当前阶段冲突的条件。
- 不改变动作添加位置、动作保存结构、训练循环、训练执行时间线或数据库模型。

## Capabilities

### New Capabilities

- `composer-section-filter-sync`: 定义动作编排页右侧动作库的“全部/热身/训练/拉伸”阶段筛选、阶段推断规则、接口参数语义，以及阶段筛选与下方辅助筛选的同步关系。

### Modified Capabilities

- 无。

## Impact

- 主要影响 `features/workouts/components/action-composer-page.tsx` 的右侧动作库筛选状态、阶段入口 UI、筛选同步和请求参数。
- 影响 `lib/shared/exercises/query-schema.ts`、`lib/shared/exercises/types.ts`、`app/api/exercises/route.ts`、`lib/server/exercises/exercise-service.ts` 的 `workoutSection` 查询语义、facets 返回范围和阶段推断测试。
- 可能影响与动作库阶段筛选相关的测试文件；不需要 Prisma 迁移，不新增依赖。
