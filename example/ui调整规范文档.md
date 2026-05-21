# FitAI AI 健身 Web 设计规范

> 目标：让 Codex 按照当前高级健康科技风格，对 AI 健身 Web 进行统一视觉调整。
>
> 风格关键词：**Premium AI Fitness SaaS / 高级 AI 健身训练平台 / Clean Wellness Tech / AI Coach Dashboard**。

---

## 1. 设计目标

这个项目不是传统健身 App 的黑红硬核风，也不是普通后台管理系统。

最终视觉应该像一个：

> **可信赖、专业、清爽、有轻微运动张力的 AI 私教工作台。**

核心原则：

1. 背景浅，卡片白，边框清楚。
2. 动作卡片圆角克制，建议 `12px`。
3. 蓝色只用于关键操作、选中态、AI 状态。
4. 训练摘要、当前训练、进行中页面可以使用深色模块增强运动感。
5. 动效轻量，不要炫技。
6. 不要所有组件都大圆角，否则会显得太软、太医疗 SaaS。

---

## 2. 视觉风格定位

### 2.1 风格名称

```text
Premium AI Fitness SaaS
Clean Wellness Tech
AI Coach Dashboard
Light Performance Fitness
```

### 2.2 气质要求

| 方向 | 说明 |
|---|---|
| 高级 | 留白充足、层级清晰、颜色克制 |
| 专业 | 卡片、数据、训练参数要像严肃工具 |
| 健康科技感 | 浅灰蓝背景、蓝色主色、轻微 AI 光感 |
| 运动表现感 | 适当加入深色卡片、训练强度、肌群数据 |
| 可执行 | AI 推荐内容必须能直接加入计划或开始训练 |

### 2.3 避免方向

不要做成：

- 黑红硬核健身房风
- 霓虹赛博朋克风
- 过度玻璃拟态
- 普通后台管理系统
- 过圆、过软、过医疗感的健康 SaaS

---

## 3. 色彩规范

### 3.1 Design Tokens

```css
:root {
  --color-ink: #111827;
  --color-muted: #667085;
  --color-line: #D7DDE5;
  --color-canvas: #F6F8FB;
  --color-panel: #FFFFFF;
  --color-panel-soft: #EEF2F6;

  --color-primary: #2459E6;
  --color-primary-deep: #163FAF;
  --color-primary-soft: #E6ECFF;

  --color-cyan-soft: #DFF6FF;
  --color-success-soft: #ECFDF3;
  --color-success-text: #047857;
  --color-warning-soft: #FFF7E6;
  --color-warning-text: #B45309;
  --color-danger: #E5484D;
}
```

### 3.2 主色使用

| Token | 用途 |
|---|---|
| `primary` | 主按钮、当前导航、关键标签、进度条 |
| `primary-deep` | 主按钮 hover |
| `primary-soft` | 选中态背景、AI 标签背景、轻量提示 |

使用规则：

- 蓝色不要大面积铺满。
- 主色应该只引导用户完成关键操作。
- 页面里 80% 以上区域应该保持白、浅灰、深灰文字。

### 3.3 中性色使用

| Token | 用途 |
|---|---|
| `ink` | 主标题、深色摘要卡背景 |
| `muted` | 副标题、说明、弱信息 |
| `line` | 边框、分割线 |
| `canvas` | 页面背景 |
| `panel` | 白色卡片、抽屉、侧栏 |
| `panel-soft` | 输入框、参数块、chip 背景 |

---

## 4. 页面背景规范

页面背景不要纯白，使用浅灰蓝底，并加入非常轻微的蓝青光晕。

```css
.app-bg {
  background:
    radial-gradient(circle at top right, rgba(36, 89, 230, 0.12), transparent 30%),
    radial-gradient(circle at 20% 0%, rgba(20, 184, 166, 0.10), transparent 28%),
    #F6F8FB;
}
```

规则：

- 光晕只用于页面背景。
- 卡片内部不要使用复杂渐变。
- 不要使用高饱和大面积渐变。

---

## 5. 字体规范

### 5.1 字体栈

```css
font-family:
  'Plus Jakarta Sans',
  'Inter',
  'PingFang SC',
  'Microsoft YaHei',
  system-ui,
  sans-serif;
```

### 5.2 字号和字重

| 场景 | 字号 | 字重 | 行高 |
|---|---:|---:|---:|
| 页面大标题 | 28-32px | 800 | 1.15 |
| 区块标题 | 20-24px | 700-800 | 1.25 |
| 卡片标题 | 16-18px | 700-800 | 1.3 |
| 正文 | 14-16px | 400-500 | 1.5 |
| 辅助信息 | 12-13px | 500-700 | 1.4 |
| 标签文字 | 11-12px | 700-800 | 1.2 |

标题建议：

```css
.heading {
  letter-spacing: -0.01em;
}

.page-title {
  letter-spacing: -0.03em;
}
```

---

## 6. 圆角规范

圆角是本风格的重点。

### 6.1 圆角 Token

```css
:root {
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-pill: 999px;
}
```

### 6.2 使用规则

| 组件 | 圆角 |
|---|---:|
| 动作主卡片 | 12px |
| 动作卡片图片 | 8px |
| 输入框 | 12px |
| 普通按钮 | 12px |
| 图标按钮 | 12px |
| 小标签 / chip | 8px 或 pill |
| 大摘要卡 / Hero 卡 | 20px |
| 侧边栏状态卡 | 16px |
| 用户头像 | 12px |
| FAB | 16px 或 20px |

关键原则：

> 业务卡片要利落，大容器可以更圆。

动作卡片不要使用 `2rem`、`3rem` 这种大圆角。

---

## 7. 阴影规范

阴影要轻，不要有漂浮感。

```css
:root {
  --shadow-card:
    0 1px 2px rgba(16, 24, 40, 0.06),
    0 8px 24px rgba(16, 24, 40, 0.06);

  --shadow-lift:
    0 16px 40px rgba(16, 24, 40, 0.10);

  --shadow-nav:
    0 1px 0 rgba(16, 24, 40, 0.08);
}
```

| 场景 | 阴影 |
|---|---|
| 默认卡片 | `shadow-card` |
| hover 卡片 | `shadow-lift` |
| 顶部导航 | `shadow-nav` 或只用底部边框 |
| 抽屉 | 可以更强，但不要过黑 |
| FAB | `shadow-lift` |

避免：

```css
box-shadow: 0 20px 60px rgba(0,0,0,.25);
```

---

## 8. 布局规范

### 8.1 基础布局

```text
Sidebar: 256px
Header: 64px
Main max-width: 1180px
Page padding: 32px
Grid gap: 20px
```

### 8.2 页面结构

推荐页面结构：

```text
AppShell
  Sidebar
  Header
  Main
    PageSummary / WorkoutSummary
    MuscleFocus / AI Insight
    ExerciseGrid
    ExerciseDrawer
```

主内容不要直接进入动作列表。先放训练摘要，让用户知道当前正在编辑什么计划。

---

## 9. 核心组件规范

## 9.1 动作卡片 ExerciseCard

动作卡片是核心组件，必须统一。

### 结构

```text
ExerciseCard
  Image
  TypeTag
  Title
  TargetMuscle
  Params
  Action / DragHandle
```

### 样式

```css
.exercise-card {
  background: #FFFFFF;
  border: 1px solid #D7DDE5;
  border-radius: 12px;
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 0.06),
    0 8px 24px rgba(16, 24, 40, 0.06);
  transition: transform .3s ease, box-shadow .3s ease;
}

.exercise-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(16, 24, 40, 0.10);
}
```

### 图片

```css
.exercise-image {
  height: 160px;
  border-radius: 8px;
  object-fit: cover;
  overflow: hidden;
}
```

图片 hover：

```css
.exercise-image img {
  transition: transform .5s ease;
}

.exercise-card:hover .exercise-image img {
  transform: scale(1.05);
}
```

### 信息块

训练参数建议用浅灰块，不要使用表格线。

```css
.exercise-param {
  background: #EEF2F6;
  border-radius: 8px;
  padding: 12px;
}
```

---

## 9.2 横向动作卡 ExerciseCompactCard

用于热身、有氧、恢复动作。

```text
左侧 96x96 图片
右侧动作名称、说明、标签
右上角拖拽或更多操作
```

样式：

```css
.exercise-compact-card {
  background: #FFFFFF;
  border: 1px solid #D7DDE5;
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow-card);
}
```

图片：

```css
width: 96px;
height: 96px;
border-radius: 8px;
object-fit: cover;
```

---

## 9.3 训练摘要卡 WorkoutSummaryCard

用于页面顶部，展示当前训练计划。

推荐内容：

- AI Generated 标签
- 训练名称
- 预计时长
- 动作数量
- 简短说明
- 保存草稿 / 添加动作按钮

样式：

```css
.workout-summary-card {
  background: #FFFFFF;
  border: 1px solid #D7DDE5;
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-card);
}
```

---

## 9.4 深色训练状态卡 MuscleFocusCard

用于增加运动表现感。

```css
.muscle-focus-card {
  background: #111827;
  color: #FFFFFF;
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-card);
}
```

内容建议：

```text
Workout Focus
胸部 72%
三头 21%
核心 7%
AI 建议：主训练动作之间休息 90 秒
```

深色卡只用于摘要、训练中、关键数据，不要大面积泛用。

---

## 9.5 阶段分割器 WorkoutPhaseDivider

用于分隔热身、正式训练、放松阶段。

```text
──────── Warm Up · 2 Actions ────────
```

样式：

```css
.phase-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #667085;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.phase-divider::before,
.phase-divider::after {
  content: '';
  height: 1px;
  flex: 1;
  background: #D7DDE5;
}
```

---

## 10. 按钮规范

### 10.1 主按钮

用于核心动作：添加动作、开始训练、完成选择、生成计划。

```css
.button-primary {
  background: #2459E6;
  color: #FFFFFF;
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 700;
  box-shadow: var(--shadow-card);
  transition: background .2s ease, box-shadow .2s ease, transform .2s ease;
}

.button-primary:hover {
  background: #163FAF;
  box-shadow: var(--shadow-lift);
}
```

### 10.2 次按钮

```css
.button-secondary {
  background: #FFFFFF;
  color: #111827;
  border: 1px solid #D7DDE5;
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 700;
}

.button-secondary:hover {
  background: #EEF2F6;
}
```

### 10.3 图标按钮

当前风格更适合圆角方形按钮，而不是所有按钮都用圆形。

```css
.icon-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #FFFFFF;
  border: 1px solid #D7DDE5;
  color: #667085;
}

.icon-button:hover {
  color: #2459E6;
  box-shadow: var(--shadow-card);
}
```

---

## 11. 标签 / Chip 规范

### 11.1 主标签

用于 AI Generated、Compound、Isolation、Cable、Mobility 等。

```css
.chip-primary {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #E6ECFF;
  color: #2459E6;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
```

### 11.2 参数标签

用于组数、次数、休息时间。

```css
.chip-muted {
  display: inline-flex;
  align-items: center;
  border-radius: 8px;
  background: #EEF2F6;
  color: #667085;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
}
```

### 11.3 强度标签

| 强度 | 背景 | 文字 |
|---|---|---|
| 低强度 | `#ECFDF3` | `#047857` |
| 中强度 | `#FFF7E6` | `#B45309` |
| 高强度 | `#FEE2E2` | `#B91C1C` |

---

## 12. 输入框规范

```css
.input {
  height: 44px;
  background: #FFFFFF;
  border: 1px solid #D7DDE5;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
}

.input:focus {
  border-color: #2459E6;
  box-shadow: 0 0 0 4px rgba(36, 89, 230, 0.10);
}
```

AI 聊天输入框可以更高：

```css
.ai-chat-input {
  min-height: 56px;
  border-radius: 16px;
}
```

---

## 13. 导航规范

### 13.1 Sidebar

```css
.sidebar {
  width: 256px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(16px);
  border-right: 1px solid #D7DDE5;
}
```

导航项：

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  padding: 12px;
  color: #667085;
  font-size: 14px;
  font-weight: 600;
}

.nav-item:hover {
  background: #EEF2F6;
  color: #2459E6;
}

.nav-item.active {
  background: #E6ECFF;
  color: #2459E6;
}
```

### 13.2 Header

```css
.header {
  height: 64px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(215, 221, 229, 0.8);
}
```

顶部区域建议放：

- 页面标题
- 搜索框
- 通知按钮
- 帮助按钮
- 用户头像

---

## 14. Drawer 抽屉规范

动作库选择建议使用右侧 Drawer。

```css
.drawer {
  width: 460px;
  background: #FFFFFF;
  border-left: 1px solid #D7DDE5;
  box-shadow: 0 24px 80px rgba(16, 24, 40, 0.18);
  transition: transform .34s cubic-bezier(.2, .8, .2, 1);
}
```

打开抽屉时主内容：

```css
.main-content.drawer-open {
  transform: scale(0.985);
  opacity: 0.7;
  filter: blur(1px);
}
```

遮罩：

```css
.overlay {
  background: rgba(17, 24, 39, 0.30);
  backdrop-filter: blur(4px);
}
```

---

## 15. 动效规范

动效原则：

> 有反馈，但不抢戏。

### 15.1 卡片 hover

```css
transition: transform .3s ease, box-shadow .3s ease;
transform: translateY(-4px);
```

### 15.2 图片 hover

```css
transition: transform .5s ease;
transform: scale(1.05);
```

### 15.3 Drawer

```css
transition: transform .34s cubic-bezier(.2, .8, .2, 1);
```

### 15.4 按钮

```css
transition: background .2s ease, box-shadow .2s ease, transform .2s ease;
```

避免：

- 弹跳动画
- 大幅度 scale
- 过长动画
- 页面级复杂动画

---

## 16. 图标规范

建议使用：

```text
Material Symbols Outlined
```

```css
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 500,
    'GRAD' 0,
    'opsz' 24;
}
```

尺寸建议：

| 场景 | 尺寸 |
|---|---:|
| 导航图标 | 24px |
| 卡片操作图标 | 20px |
| 小标签图标 | 14-16px |
| 主按钮图标 | 20px |

不要混用多个图标库。

---

## 17. 图片风格规范

推荐关键词：

```text
bright fitness studio
clean gym environment
premium wellness
modern workout
natural light
soft shadow
blue white palette
professional training
```

避免：

```text
dark bodybuilding gym
red neon fitness
sweaty extreme close-up
low resolution stock photo
overly dramatic muscle shot
```

图片规则：

- 明亮干净。
- 动作姿势清楚。
- 背景不要杂乱。
- 色调统一：白、灰、蓝、少量黑。
- 同一页面内图片风格必须一致。

---

## 18. AI 功能组件规范

AI 是核心能力，不要只做成普通聊天框。

### 18.1 AI 消息卡片

```css
.ai-message {
  background: #FFFFFF;
  border: 1px solid #D7DDE5;
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
```

### 18.2 AI 推荐动作卡

结构：

```text
小图
动作名
推荐原因
目标肌群
一键加入按钮
```

AI 推荐内容应该可操作，而不是纯文本。

### 18.3 AI 标签

可使用：

```text
AI Generated
AI Adjusted
Form Check
Recovery Suggestion
Risk Warning
```

---

## 19. 训练进行中页面建议

训练中页面可以比管理页面更沉浸。

建议结构：

```text
当前动作大卡
第 N / M 组
目标次数 / 计时器
动作图示或视频
AI 动作提示
下一动作预览
完成本组按钮
```

视觉建议：

- 当前动作区域可以使用深色背景 `#111827`。
- 倒计时、组数、次数要大。
- AI 提示使用白色或浅蓝卡片。
- 保持按钮足够大，方便训练时点击。

---

## 21. Tailwind 配置建议

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        muted: '#667085',
        line: '#D7DDE5',
        canvas: '#F6F8FB',
        panel: '#FFFFFF',
        panelSoft: '#EEF2F6',
        primary: '#2459E6',
        primaryDeep: '#163FAF',
        primarySoft: '#E6ECFF',
        cyanSoft: '#DFF6FF',
        limeSoft: '#ECFDF3',
        warningSoft: '#FFF7E6',
        danger: '#E5484D'
      },
      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        pill: '999px'
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.06)',
        lift: '0 16px 40px rgba(16, 24, 40, 0.10)',
        nav: '0 1px 0 rgba(16, 24, 40, 0.08)'
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif']
      }
    }
  }
}
```

---

## 22. 推荐组件拆分

```text
Layout
- AppShell
- AppSidebar
- AppHeader
- PageShell

Training
- WorkoutSummaryCard
- MuscleFocusCard
- ExerciseCard
- ExerciseCompactCard
- ExerciseDrawer
- ExerciseFilterTabs
- WorkoutPhaseDivider
- TrainingSessionPanel

AI
- AiChatPanel
- AiMessageCard
- AiRecommendationCard
- AiInsightCard
- AiPromptInput

Common
- Button
- IconButton
- Chip
- SearchInput
- ProgressBar
- StatCard
- Drawer
- Overlay
```

---

## 23. Codex 改造清单

请按照以下顺序调整项目：

### Step 1：建立设计 Token

- 增加统一颜色 token。
- 增加统一圆角 token。
- 增加统一阴影 token。
- 增加字体栈。

### Step 2：调整全局背景

- 页面背景改为 `#F6F8FB`。
- 增加轻微蓝青径向光晕。
- 保证主体卡片是白色。

### Step 3：统一动作卡片

- 动作卡片圆角改为 `12px`。
- 图片圆角改为 `8px`。
- 卡片边框使用 `#D7DDE5`。
- 默认阴影使用 `shadow-card`。
- hover 使用 `translateY(-4px)` 和 `shadow-lift`。

### Step 4：重构顶部训练摘要区

- 增加白色 `WorkoutSummaryCard`。
- 增加深色 `MuscleFocusCard`。
- 保留 AI Generated、时长、动作数等标签。

### Step 5：统一按钮和输入框

- 主按钮使用蓝色、12px 圆角。
- 次按钮使用白底边框。
- 搜索框使用 12px 圆角、focus 蓝色 ring。

### Step 6：统一 Sidebar 和 Header

- Sidebar 宽度 256px。
- Header 高度 64px。
- 使用半透明白 + blur。
- 当前导航使用 `primarySoft` 背景。

### Step 7：优化 Drawer

- 右侧宽度 460px。
- 抽屉圆角不需要额外增加。
- 打开时主内容轻微缩放、降透明、1px blur。

### Step 8：补齐 AI 组件

- AI 推荐动作不能只显示文本。
- AI 推荐动作应使用结构化卡片。
- 每个推荐动作需要有“一键加入”操作。

---

## 24. 禁忌清单

不要做：

- 动作卡片使用超大圆角。
- 所有按钮都做成胶囊形。
- 大面积高饱和渐变。
- 过重阴影。
- 太多颜色标签。
- 图标库混用。
- 图片风格混乱。
- 黑红硬核风混入当前设计。
- AI 内容只输出长段文字，不提供操作入口。

---

## 25. 最终验收标准

完成后页面应该满足：

1. 第一眼看起来是高级 AI 健身产品，而不是普通后台。
2. 动作卡片更利落，不再过圆。
3. 页面整体仍然清爽、专业、可信赖。
4. AI 推荐、动作编排、训练数据之间的层级清楚。
5. 主按钮、选中态、AI 标签都使用统一蓝色体系。
6. 卡片、按钮、输入框、抽屉的圆角和阴影统一。
7. 训练相关页面有一定运动张力，但不过度硬核。

