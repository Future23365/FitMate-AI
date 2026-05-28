## Context

聊天流里会出现三类动作卡片：单独动作推荐、单次动作编排和长期计划草稿。它们都能打开 `ExercisePreviewSheet`，但当前入口实现不一致：推荐卡片整卡点击，编排卡片标题旁常显 `info`，计划卡片整行点击且 hover 展示“查看教学”。

两列动作卡片空间有限，文字按钮会挤压动作名、标签和训练参数。因此本次统一采用右上角 icon-only 详情按钮，并把详情触发从整卡点击收敛到该按钮。

## Goals / Non-Goals

**Goals:**

- 三类聊天动作卡片使用同一种详情入口位置和视觉语义。
- 详情入口在卡片右上角，默认低干扰，hover/focus 时突出显示。
- 用户只有点击详情按钮才打开 `ExercisePreviewSheet`。
- 安全提醒继续使用 warning 样式，与详情入口的 info 样式分离。

**Non-Goals:**

- 不改 AI 推荐、计划生成、动作编排或保存逻辑。
- 不改 `ExercisePreviewSheet` 的内容结构和数据加载契约。
- 不引入新的 UI 组件库或图标体系。
- 不调整聊天卡片整体布局密度之外的视觉风格。

## Decisions

### 1. 右上角 icon-only button 作为唯一详情入口

采用 32px 左右的 `info` icon button，放在每个动作卡片右上角。卡片内容区域预留右侧内边距，避免长动作名覆盖按钮。

取舍：相比底部文字按钮，右上角 icon-only 更适合两列紧凑卡片，不会占用动作参数和标签空间；相比整卡点击，触发语义更明确。

### 2. hover/focus 强化，不依赖 hover 才可访问

按钮默认保持可见但低对比，卡片 hover 或按钮 focus-visible 时提高背景、边框和图标颜色。这样符合“hover 展示”的视觉诉求，同时键盘和触屏用户仍能看到入口。

取舍：完全隐藏到 hover 才出现会降低可访问性，也会让移动端没有 hover 时入口不可发现。

### 3. 先抽小型共享按钮组件，不抽完整动作卡片

本次只抽 `ExerciseDetailIconButton` 这类小组件，统一位置、尺寸、hover/focus 和 `aria-label`。暂不抽完整动作卡片，因为三类卡片的内容结构、操作按钮和指标布局仍有差异。

取舍：完整抽象动作卡片会带来较大重构范围；共享按钮能解决当前一致性问题，同时保持改动范围可控。

### 4. 保持安全提醒独立

`safetyNotes` 的 warning block 不调整为详情入口，也不复用 info button。详情表示“查看教学/动作详情”，warning 表示“风险或筛选提醒”，两者视觉语义必须分离。

## Risks / Trade-offs

- [Risk] icon-only 按钮含义不如文字按钮直观 → Mitigation: 使用标准 `info` 图标，并提供 `aria-label="查看动作详情"` 与 `title="查看动作详情"`。
- [Risk] 右上角按钮覆盖长动作名 → Mitigation: 卡片内容区域增加右侧预留空间，标题保持 truncate。
- [Risk] 推荐卡片移除整卡点击后用户初次不习惯 → Mitigation: hover/focus 强化按钮，并保持按钮位置在三类卡片中完全一致。
