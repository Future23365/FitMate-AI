## Context

动作编排页右侧动作库目前负责搜索、筛选和把动作加入当前编排。现有实现中：

- `features/workouts/components/action-composer-page.tsx` 使用 `libraryCategory`、`libraryMuscle`、`libraryEquipment`、`libraryLevel` 等状态拼接 `/api/exercises` 查询参数。
- 横向筛选区域当前展示 `libraryFacets.categories`，用户点击后改变 `category`。
- `selectedSection` 已经存在，用于决定 `addExercise()` 默认把动作加入 `warmup`、`training` 或 `stretch`。
- 独立动作库页已经使用 `homeRequirement` 和 `facets.homeRequirements` 实现居家条件筛选。
- `lib/shared/exercises/query-schema.ts` 和后端动作库服务已经支持 `homeRequirement` 查询参数。

因此这次变更不需要调整后端 API 或数据结构，重点是重新组织动作编排页右侧动作库的筛选层级。

## Goals / Non-Goals

**Goals:**

- 横向入口只表达编排阶段：热身、训练、拉伸。
- 动作分类改为下拉框，和肌群、器械、难度保持一致。
- 增加居家条件下拉筛选，并接入现有 `homeRequirement` 查询参数。
- 清空筛选时同时清空分类、肌群、器械、难度、居家条件和搜索关键词。
- 保持“从右侧动作库添加动作时使用当前选中阶段”的现有行为。

**Non-Goals:**

- 不新增动作库 API 参数、数据库字段或 Prisma 迁移。
- 不改变动作详情抽屉、动作保存、训练循环配置或时间线生成逻辑。
- 不把阶段选择同步成动作库过滤条件；阶段只决定新增动作的 section。
- 不改独立 `/exercises` 动作库页面。

## Decisions

### 1. 横向区域改为阶段选择，而不是继续承载分类筛选

动作编排页的右侧动作库和主编排区协作，用户真正需要先决定的是“这个动作加入哪个阶段”。因此横向区域应复用 `workoutSectionConfigs` 渲染热身、训练、拉伸三个入口，并写入现有 `selectedSection`。

取舍：保留分类横向筛选改动更小，但会继续让右侧面板同时表达“过滤动作”和“加入阶段”两种语义。把横向区域交给阶段选择后，用户添加动作时的目标位置更明确。

### 2. 分类和居家条件统一为下拉筛选

分类从横向 chip 移到 `LibraryFilterSelect`，和肌群、器械、难度形成同一类过滤控件。居家条件新增同类下拉框，读取 `libraryFacets.homeRequirements` 并设置 `homeRequirement` 查询参数。

取舍：分类下拉会少一些一键点击的视觉曝光，但右侧面板宽度只有 300px，继续用横向 chip 会挤占阶段入口空间，也会让筛选层级混乱。

### 3. 不新增服务端能力

`homeRequirement` 已经是共享查询 schema 和动作库服务的稳定过滤维度，动作编排页只需要新增客户端状态、URLSearchParams 拼接和 effect dependency。

取舍：如果为动作编排页单独设计接口，会增加重复 API 表面；复用 `/api/exercises` 能保持动作库筛选能力一致。

### 4. 清空筛选保持完整重置

`hasLibraryFilters` 和 `resetLibraryFilters()` 需要纳入 `homeRequirement`，避免用户看见筛选结果但无法一次清空。

取舍：只清空新增字段会让按钮语义不一致；统一重置更符合当前“清空筛选”按钮。

## Risks / Trade-offs

- [Risk] 右侧面板宽度有限，新增分类和居家条件后下拉框可能显得密集。→ Mitigation：沿用两列小型下拉布局，必要时把筛选区保持为 2 列网格并控制 label 文案长度。
- [Risk] 用户可能误以为热身、训练、拉伸横向入口会过滤动作。→ Mitigation：按钮文案使用“添加到热身/训练/拉伸”或等价表达，明确这是加入位置而不是动作过滤。
- [Risk] 新增 `homeRequirement` 状态后遗漏 effect dependency 会导致筛选不触发刷新。→ Mitigation：实现时同步更新 URLSearchParams、`hasLibraryFilters`、`resetLibraryFilters` 和动作库加载 effect dependencies，并运行 typecheck/test。
