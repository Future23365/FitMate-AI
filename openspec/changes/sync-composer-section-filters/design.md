## Context

当前动作编排页右侧动作库由 `ActionComposerPage` 维护筛选状态，并请求 `/api/exercises` 获取动作列表和 facets。现有实现已经新增 `libraryWorkoutSection`，默认值是 `training`，请求时总是携带 `workoutSection=training|warmup|stretch`。

接口当前处理方式是：`exerciseListQuerySchema` 只允许 `warmup`、`training`、`stretch` 三个 `workoutSection` 值；`listExercises()` 从动作记录中筛选，先用 `inferExerciseWorkoutSection()` 推断动作阶段，再排序和分页；`app/api/exercises/route.ts` 仍用 `getExerciseFacets()` 返回全量 facets。

现有阶段推断条件是：

- 拉伸优先：`category`、`categoryZh`、`nameEn`、`nameZh`、`goalTags` 中命中 `拉伸`、`伸展`、`放松`、`stretch`、`stretching`、`mobility`。
- 热身其次：同一组字段中命中 `热身`、`激活`、`动态`、`warmup`、`warm-up`、`activation`、`dynamic`、`有氧`、`cardio`、`开合跳`、`jumping jack`、`跑步`、`running`、`步行`、`walk`、`跳绳`、`rope`、`单车`、`bike`、`treadmill`。
- 其余动作归入训练。

这个规则作为当前数据集的过渡方案基本合理，因为数据库没有结构化 `workoutSection` 字段，服务端分页前过滤也比客户端过滤当前页更可信。但它仍有两个问题：推断基于文本启发式，误分不可完全避免；并且服务端动作库和 `composition.ts` 的编排项归一化使用不同推断函数，规则会漂移。

本次变更不新增数据库字段，而是先把阶段筛选语义、接口返回和 UI 同步做清楚。

## Goals / Non-Goals

**Goals:**

- 动作库阶段入口支持“全部、热身、训练、拉伸”，默认展示“全部”。
- “全部”只表示不按阶段筛选，接口请求不携带 `workoutSection`，避免把 `all` 当成新的业务阶段。
- 热身、训练、拉伸的推断规则集中到共享函数，并由动作库查询、facets 作用域和相关测试复用。
- 下方分类、肌群、器械、难度、居家条件选项只展示当前阶段范围内可用的值。
- 切换阶段后，自动清除与新阶段不兼容的下方筛选值，避免 UI 保留互相冲突的选择。
- 保持右侧阶段筛选只影响“找动作”，不直接改变中间编排区“添加到哪个阶段”。

**Non-Goals:**

- 不新增 `Exercise.workoutSection` 字段，不做 Prisma 迁移。
- 不改动作保存、训练循环、训练执行、AI routine 生成或聊天卡片逻辑。
- 不改独立 `/exercises` 页面，除非它复用的共享类型需要同步。

## Decisions

### 1. UI 阶段状态使用 `all | warmup | training | stretch`

`ActionComposerPage` 增加 `librarySectionFilter`，取值为 `"all"` 或 `WorkoutSection`。阶段入口渲染为四个按钮：“全部、热身、训练、拉伸”。默认值使用 `"all"`。

取舍：把 `all` 加进 `workoutSection` 查询参数看似统一，但会把 UI 概念泄漏到服务端阶段枚举。保持接口参数可选更清晰：没有 `workoutSection` 就是全量动作库。

### 2. 接口不接受 `workoutSection=all`

`exerciseListQuerySchema` 继续只接受 `warmup`、`training`、`stretch`。客户端选择“全部”时不设置 `workoutSection`。这样 API 契约仍保持“传入阶段才过滤”的语义，旧的无阶段请求也自然等价于全部。

取舍：允许 `all` 可以容错前端误传，但会让服务端出现两种表达同一含义的方式。当前项目更重视明确契约，应让客户端状态转换负责去掉参数。

### 3. facets 按当前阶段范围返回

`/api/exercises` 返回的 facets 需要和当前阶段筛选同步。实现上可以让 `getExerciseFacets()` 接受只包含 `workoutSection` 的 scope 参数，先按阶段范围筛出动作，再收集分类、肌群、器械、难度、居家条件等 facets。

facets 不应再叠加当前下方辅助筛选，否则用户选择某个分类后可能看不到其他可切换选项；它只受顶部阶段范围影响。列表结果则继续叠加所有筛选条件。

取舍：另一种做法是在客户端从当前返回列表计算 facets，但分页会导致 facets 不完整。服务端按阶段范围计算 facets 能保证选项完整，也和分页前过滤的接口思路一致。

### 4. 切换阶段时清理失效的下方筛选

当 `librarySectionFilter` 改变且新 facets 返回后，客户端检查 `libraryCategory`、`libraryMuscle`、`libraryEquipment`、`libraryLevel`、`libraryHomeRequirement` 是否仍在对应 facets 中。不存在则清空该字段。搜索词不清空，因为文本搜索可以跨阶段继续表达用户意图。

取舍：直接清空全部下方筛选最简单，但会让用户从“训练”切到“拉伸”时丢失仍然有效的器械或难度条件。只清失效值更符合“不冲突”的要求，也保留用户有效选择。

### 5. 阶段推断函数集中复用

将当前服务端 `inferExerciseWorkoutSection()` 保持在服务端可用的模块中，或抽到共享但不引入客户端不需要的服务端依赖。测试应覆盖拉伸优先、热身其次、训练兜底和英文关键词。

`composition.ts` 的 `inferWorkoutSection()` 可以保留用于已编排项的轻量兜底，但如果实现中发现规则重复明显，应复用同一组关键词常量，避免后续“接口认为是热身，保存归一化认为是训练”的漂移。

取舍：现在直接加数据库字段会更准确，但需要数据迁移、后台标注和录入流程，不适合这次 UI 筛选同步的范围。共享推断规则是当前阶段成本和正确性的平衡点。

## Risks / Trade-offs

- [Risk] 文本启发式仍可能把部分动作分错阶段。→ Mitigation：集中规则并补测试，后续数据集成熟后再迁移到结构化字段。
- [Risk] 阶段切换后异步 facets 返回较慢，短时间内下方筛选可能显示旧选项。→ Mitigation：阶段切换时进入加载态，列表请求和 facets 使用同一次 API 响应，清理逻辑基于最新响应执行。
- [Risk] 自动清除失效筛选可能让用户没意识到某个条件被移除。→ Mitigation：清理后可复用现有 `saveStatus` 或轻量状态文案提示“已清除与当前阶段不匹配的筛选”。
- [Risk] 已完成但未归档的 `adjust-composer-library-filters` 和本 change 都涉及右侧动作库筛选。→ Mitigation：本 change 只在旧能力之上补“全部”和同步规则；实现时应先确认旧 change 的代码已是当前基线，不重复改已完成内容。
