## Context

动作编排页右侧动作库目前负责搜索、筛选和把动作加入当前编排。现有实现中：

- `features/workouts/components/action-composer-page.tsx` 使用 `libraryCategory`、`libraryMuscle`、`libraryEquipment`、`libraryLevel` 等状态拼接 `/api/exercises` 查询参数。
- 横向筛选区域当前展示 `libraryFacets.categories`，用户点击后改变 `category`。
- `selectedSection` 已经存在，用于决定 `addExercise()` 默认把动作加入 `warmup`、`training` 或 `stretch`。
- 右侧动作库需要新增独立的阶段筛选状态，避免把“筛选动作类型”和“添加到哪个编排阶段”混为一谈。
- 独立动作库页已经使用 `homeRequirement` 和 `facets.homeRequirements` 实现居家条件筛选。
- `lib/shared/exercises/query-schema.ts` 和后端动作库服务已经支持 `homeRequirement` 查询参数。

因此这次变更需要在现有动作库查询 API 上增加轻量的 `workoutSection` 查询参数，并重新组织动作编排页右侧动作库的筛选层级。

## Goals / Non-Goals

**Goals:**

- 横向入口筛选动作阶段：热身、训练、拉伸。
- 动作分类改为下拉框，和肌群、器械、难度保持一致。
- 增加居家条件下拉筛选，并接入现有 `homeRequirement` 查询参数。
- 清空筛选时同时清空分类、肌群、器械、难度、居家条件和搜索关键词。
- 从右侧动作库添加动作时仍使用中间编排区当前选中的添加阶段，不由右侧筛选直接决定。

**Non-Goals:**

- 不新增数据库字段或 Prisma 迁移。
- 不改变动作详情抽屉、动作保存、训练循环配置或时间线生成逻辑。
- 不改独立 `/exercises` 动作库页面。

## Decisions

### 1. 横向区域改为阶段筛选，而不是继续承载分类筛选

动作编排页的右侧动作库用于找动作，用户在这里真正需要的是先筛出热身、训练或拉伸动作。因此横向区域应渲染热身、训练、拉伸三个筛选项，并写入独立的 `libraryWorkoutSection` 状态。

取舍：复用 `selectedSection` 改动更小，但会把右侧筛选误解释成“添加到某阶段”。独立筛选状态可以让右侧只负责找动作，中间编排区继续负责动作落点。

### 2. 分类和居家条件统一为下拉筛选

分类从横向 chip 移到 `LibraryFilterSelect`，和肌群、器械、难度形成同一类过滤控件。居家条件新增同类下拉框，读取 `libraryFacets.homeRequirements` 并设置 `homeRequirement` 查询参数。

取舍：分类下拉会少一些一键点击的视觉曝光，但右侧面板宽度只有 300px，继续用横向 chip 会挤占阶段入口空间，也会让筛选层级混乱。

### 3. 新增 `workoutSection` 查询参数并在服务端过滤后分页

如果只在客户端过滤 `/api/exercises` 返回的当前页，热身或拉伸结果会被分页截断，右侧数量也不可信。因此新增 `workoutSection` 查询参数，在 `listExercises()` 中先按阶段过滤，再排序和分页。

阶段推断不依赖新字段：拉伸优先识别 `category/categoryZh/name/goalTags` 中的拉伸、伸展、放松、stretching、mobility；热身识别热身、激活、动态、有氧、cardio、开合跳、跑步、跳绳等；其他动作归为训练。

取舍：新增查询参数比客户端过滤多改一层服务代码，但能保证分页和 total 正确，也避免右侧筛选在不同排序页上表现不稳定。

### 4. 清空筛选保持完整重置

`hasLibraryFilters` 和 `resetLibraryFilters()` 需要纳入 `homeRequirement`，避免用户看见筛选结果但无法一次清空。阶段筛选是右侧动作库的主分段，默认保持当前分段，不由清空筛选按钮重置。

取舍：只清空新增字段会让按钮语义不一致；统一重置更符合当前“清空筛选”按钮。

## Risks / Trade-offs

- [Risk] 右侧面板宽度有限，新增分类和居家条件后下拉框可能显得密集。→ Mitigation：沿用两列小型下拉布局，必要时把筛选区保持为 2 列网格并控制 label 文案长度。
- [Risk] 阶段推断基于现有文本和标签，个别动作可能被归类不准。→ Mitigation：优先使用明确分类和 goal tags，默认归入训练，后续如果数据集增加结构化阶段字段再替换推断逻辑。
- [Risk] 新增 `homeRequirement` 或 `workoutSection` 状态后遗漏 effect dependency 会导致筛选不触发刷新。→ Mitigation：实现时同步更新 URLSearchParams、`hasLibraryFilters`、`resetLibraryFilters` 和动作库加载 effect dependencies，并运行 typecheck/test。
