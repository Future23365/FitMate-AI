## Why

动作编排页右侧动作库需要帮助用户找到“适合热身、适合主训练、适合拉伸”的动作，但当前服务器没有结构化字段证明某个动作天然属于热身或拉伸。
如果继续把筛选命名为“热身、训练、拉伸”，会把启发式判断误表达成动作事实，也容易和中间编排区真正的 `section` 概念混淆。

## What Changes

- 将右侧动作库顶部入口调整为“全部、适合热身、适合主训练、适合拉伸”，默认选中“全部”。
- 将接口语义从阶段分类改为用途适配筛选：选择“全部”时不发送用途参数；选择适合热身、适合主训练、适合拉伸时发送 `suitability=warmup|training|stretch`。
- 服务端不新增数据库字段，先基于现有动作元数据派生 `suitability`，并明确该派生结果不是互斥分类，一个动作可以同时适合多个用途。
- 让下方分类、肌群、器械、难度、居家条件选项与当前用途范围同步；切换用途后若已有下方筛选在新用途范围内不可用，系统自动清除该筛选。
- 调整 `/api/exercises` 返回的 facets 作用域，使下方筛选选项来自当前用途范围，而不是全量动作库，避免用户选到会与当前用途冲突的条件。
- 不改变动作添加位置、动作保存结构、训练循环、训练执行时间线或数据库模型。

## Capabilities

### New Capabilities

- `composer-section-filter-sync`: 定义动作编排页右侧动作库的“全部/适合热身/适合主训练/适合拉伸”用途适配筛选、服务端 suitability 派生规则、接口参数语义，以及用途筛选与下方辅助筛选的同步关系。

### Modified Capabilities

- 无。

## Impact

- 主要影响 `features/workouts/components/action-composer-page.tsx` 的右侧动作库筛选状态、顶部入口 UI、筛选同步和请求参数。
- 影响 `lib/shared/exercises/query-schema.ts`、`lib/shared/exercises/types.ts`、`app/api/exercises/route.ts`、`lib/server/exercises/exercise-service.ts` 的 `suitability` 查询语义、facets 返回范围和用途适配派生测试。
- 可能影响与动作库筛选相关的测试文件；不需要 Prisma 迁移，不新增依赖。
