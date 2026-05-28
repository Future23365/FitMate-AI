## Context

当前动作编排页右侧动作库由 `ActionComposerPage` 维护筛选状态，并请求 `/api/exercises` 获取动作列表和 facets。现有实现已经新增 `libraryWorkoutSection`，默认值是 `training`，请求时总是携带 `workoutSection=training|warmup|stretch`。

接口当前处理方式是：`exerciseListQuerySchema` 只允许 `warmup`、`training`、`stretch` 三个 `workoutSection` 值；`listExercises()` 从动作记录中筛选，先用 `inferExerciseWorkoutSection()` 把动作推断成单一阶段，再排序和分页；`app/api/exercises/route.ts` 仍用 `getExerciseFacets()` 返回全量 facets。

这个模型的问题是：`Exercise` 表和当前动作数据并没有结构化的热身、训练、拉伸阶段字段。服务器只能根据 `category`、`categoryZh`、`nameEn`、`nameZh`、`goalTags`、`riskTags`、`level` 等已有元数据判断“适不适合某个用途”，不能严肃地断言“这个动作属于某个阶段”。

更合理的模型是：

```text
动作事实字段
category / muscles / equipment / level / riskTags / goalTags
        │
        ▼
服务端派生 suitability
warmup / training / stretch 可以同时为 true
        │
        ▼
动作编排页右侧筛选
全部 / 适合热身 / 适合主训练 / 适合拉伸
        │
        ▼
用户点击添加
仍然添加到中间编排区当前选中的 section
```

本次变更不新增数据库字段，而是先把右侧动作库定义成“用途适配筛选”，避免把启发式派生伪装成事实分类。

## Goals / Non-Goals

**Goals:**

- 动作库顶部入口支持“全部、适合热身、适合主训练、适合拉伸”，默认展示“全部”。
- “全部”只表示不按用途限制，接口请求不携带 `suitability`，避免把 `all` 当成新的服务端枚举值。
- 用 `suitability=warmup|training|stretch` 替代 `workoutSection` 表达右侧动作库的用途筛选。
- 服务端为动作派生非互斥的用途适配结果，一个动作可以同时适合热身、主训练或拉伸。
- 下方分类、肌群、器械、难度、居家条件选项只展示当前用途范围内可用的值。
- 切换用途后，自动清除与新用途不兼容的下方筛选值，避免 UI 保留互相冲突的选择。
- 保持右侧用途筛选只影响“找动作”，不直接改变中间编排区“添加到哪个阶段”。

**Non-Goals:**

- 不新增 `Exercise.workoutSection`、`Exercise.usageTags` 或类似字段，不做 Prisma 迁移。
- 不改动作保存、训练循环、训练执行、AI routine 生成或聊天卡片逻辑。
- 不改独立 `/exercises` 页面，除非它复用的共享类型需要同步。

## Decisions

### 1. UI 用途筛选状态使用 `all | warmup | training | stretch`

`ActionComposerPage` 增加或调整右侧筛选状态，例如 `librarySuitabilityFilter`，取值为 `"all"`、`"warmup"`、`"training"` 或 `"stretch"`。顶部入口渲染为四个按钮：“全部、适合热身、适合主训练、适合拉伸”。默认值使用 `"all"`。

取舍：继续显示“热身、训练、拉伸”更短，但会和中间编排区的真实 `section` 混淆。“适合热身”等文案能明确这是候选动作用途筛选，不是保存后的训练段。

### 2. 接口使用 `suitability`，不接受 `suitability=all`

`exerciseListQuerySchema` 新增或替换为 `suitability` 查询参数，只允许 `warmup`、`training`、`stretch`。客户端选择“全部”时不设置 `suitability`。`workoutSection` 不应继续作为右侧动作库用途筛选的主要参数；如果实现时需要过渡，应避免在新 UI 中继续依赖它。

取舍：保留 `workoutSection` 命名改动更小，但名称已经表达了“动作属于某阶段”。`suitability` 更贴近当前事实基础，也为后续新增结构化 `usageTags` 留出空间。

### 3. 服务端派生非互斥 suitability

新增服务端用途派生函数，返回类似：

```ts
type ExerciseSuitability = {
  warmup: boolean;
  training: boolean;
  stretch: boolean;
};
```

派生原则：

- `stretch`：动作分类、名称或目标标签命中拉伸、伸展、放松、stretch、stretching、mobility 等信号时为 true。
- `warmup`：动作具备动态、激活、低到中等强度有氧或低风险活动度信号时为 true，例如热身、激活、动态、warmup、activation、cardio、开合跳、步行、跑步机步行等。
- `training`：动作不是纯拉伸，或具备力量训练、有氧训练、增强式训练、力量举、奥林匹克举重、大力士训练等主训练信号时为 true。
- 高风险或高负荷信号不必完全排除 `training`，但不应轻易标记为 `warmup`。

一个动作可以同时适合多个用途。例如“世界最伟大拉伸”可以同时适合热身和拉伸；“开合跳”可以同时适合热身和主训练；纯静态拉伸通常只适合拉伸。

取舍：互斥分类的实现更简单，但会把多用途动作硬切到一个桶里，导致用户在适合热身或适合拉伸下找不到合理动作。非互斥 suitability 更符合健身语义。

### 4. facets 按当前 suitability 范围返回

`/api/exercises` 返回的 facets 需要和当前用途筛选同步。实现上可以让 `getExerciseFacets()` 接受只包含 `suitability` 的 scope 参数，先按用途范围筛出动作，再收集分类、肌群、器械、难度、居家条件等 facets。

facets 不应再叠加当前下方辅助筛选，否则用户选择某个分类后可能看不到其他可切换选项；它只受顶部用途范围影响。列表结果则继续叠加所有筛选条件。

取舍：客户端从当前返回列表计算 facets 会受分页影响，选项不完整。服务端按用途范围计算 facets 能保证选项完整，也能让“下方筛选不冲突”的规则稳定。

### 5. 切换用途时清理失效的下方筛选

当 `librarySuitabilityFilter` 改变且新 facets 返回后，客户端检查 `libraryCategory`、`libraryMuscle`、`libraryEquipment`、`libraryLevel`、`libraryHomeRequirement` 是否仍在对应 facets 中。不存在则清空该字段。搜索词不清空，因为文本搜索可以跨用途继续表达用户意图。

取舍：直接清空全部下方筛选最简单，但会让用户从“适合主训练”切到“适合拉伸”时丢失仍然有效的器械或难度条件。只清失效值更符合“不冲突”的要求，也保留用户有效选择。

### 6. 中间编排区 section 仍是保存事实

右侧 `suitability` 只影响动作查找。用户点击添加时，动作仍然进入中间编排区当前选中的 `section`，保存时仍写入 `WorkoutRoutineItem.section`。这能支持“把适合拉伸的动作添加到热身段”这类人工决策，也避免右侧筛选隐式改写编排状态。

取舍：让右侧筛选直接决定落点看起来更省一步，但会制造隐式状态联动。当前页面已经有明确的“添加到热身/训练/拉伸”控制，落点应继续由它负责。

## Risks / Trade-offs

- [Risk] 文本启发式仍可能把部分动作错误标记为适合某用途。→ Mitigation：集中派生规则并补测试，后续数据集成熟后再迁移到结构化 `usageTags` 或人工标注字段。
- [Risk] 非互斥 suitability 会让三个用途列表有重叠，用户可能觉得数量重复。→ Mitigation：UI 文案使用“适合”，让重叠成为预期；必要时在详情或调试中展示命中原因。
- [Risk] 阶段切换后异步 facets 返回较慢，短时间内下方筛选可能显示旧选项。→ Mitigation：用途切换时进入加载态，列表请求和 facets 使用同一次 API 响应，清理逻辑基于最新响应执行。
- [Risk] 自动清除失效筛选可能让用户没意识到某个条件被移除。→ Mitigation：清理后可复用现有 `saveStatus` 或轻量状态文案提示“已清除与当前用途不匹配的筛选”。
- [Risk] 已完成但未归档的 `adjust-composer-library-filters` 和本 change 都涉及右侧动作库筛选。→ Mitigation：本 change 只在旧能力之上修正语义并补“全部”和同步规则；实现时应先确认旧 change 的代码已是当前基线，不重复改已完成内容。
