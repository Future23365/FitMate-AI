# frontend-performance-optimization Specification

## Purpose
TBD - created by archiving change optimize-frontend-performance. Update Purpose after archive.
## Requirements
### Requirement: Route performance baselines
系统 MUST 提供可重复的前端性能基线统计方式，用于记录关键 App Router 页面入口 JavaScript 的 raw 大小、gzip 大小和对应 chunk 清单。

#### Scenario: Build artifact baseline is generated
- **WHEN** 开发者完成生产构建并运行性能统计流程
- **THEN** 系统输出 `/`、`/composer`、`/exercises`、`/plans`、`/training`、`/settings` 和 `/dev/ai-traces` 的入口 JavaScript raw/gzip 大小
- **AND** 输出包含每个路由关联的 chunk 文件名，便于定位包体来源

#### Scenario: Optimization result is comparable
- **WHEN** 开发者完成某一阶段性能优化
- **THEN** 系统可以用同一统计流程生成优化后结果
- **AND** 开发者可以对比优化前后同一路由的 raw/gzip 大小变化

### Requirement: Route-internal lazy loading
系统 MUST 对同一路由内低频且非首屏必需的重组件执行按需加载，并保持首屏核心交互可用。

#### Scenario: Chat page defers non-initial artifacts
- **WHEN** 用户首次打开首页且尚未产生 AI 回复产物卡片
- **THEN** 首页首屏不预先同步加载训练计划卡、训练编排卡、动作推荐卡和 Markdown 渲染重依赖
- **AND** 输入框、快捷提问、侧栏训练概览和基础消息流仍可立即使用

#### Scenario: Artifact cards load when needed
- **WHEN** 聊天流返回 plan、routine 或 exercise recommendation artifact
- **THEN** 对应产物卡片模块按需加载并展示稳定 loading 状态
- **AND** 加载完成后展示的卡片功能与优化前保持一致

#### Scenario: Workout interaction panels load on demand
- **WHEN** 用户未打开动作详情 Sheet、语音设置或语音自检诊断面板
- **THEN** 动作编排页和训练执行页不预先同步加载这些交互后面板的完整代码
- **AND** 用户打开面板时系统展示稳定 loading 状态并完成按需加载

### Requirement: Client schema footprint control
系统 MUST 避免客户端首屏因为少量运行时判断加载完整服务端 Zod schema；服务端和写入前校验 MUST 保持不变。

#### Scenario: Chat initial bundle avoids full plan schema
- **WHEN** 用户首次打开首页
- **THEN** 首页首屏入口不因解析推荐意图或类型导入同步加载完整 workout plan Zod schema
- **AND** 服务端仍对模型输出、API 输入和持久化数据执行结构化校验

#### Scenario: Complex validation runs at execution boundary
- **WHEN** 用户导入、保存或转换训练计划和训练编排草稿
- **THEN** 系统在执行边界使用确定性校验保护数据结构
- **AND** 校验失败时返回明确错误，不写入无效训练数据

### Requirement: Optimized exercise images
系统 MUST 为动作图片提供可验证的优化路径，列表和小卡片展示不得长期依赖原始大图直传。

#### Scenario: Exercise list uses optimized image variant
- **WHEN** 动作库列表展示动作卡片图片
- **THEN** 系统请求适合列表尺寸的优化图片或缩略图
- **AND** 不因 `images.unoptimized: true` 让列表卡片默认传输原始图片

#### Scenario: Detail views preserve image fidelity
- **WHEN** 用户打开动作详情、训练执行详情或多步骤图片轮播
- **THEN** 系统可以请求适合详情区域的较大图片
- **AND** 多步骤图片顺序、缺失图片回退和占位图逻辑保持正确

#### Scenario: Image safety boundary is preserved
- **WHEN** 图片请求使用本地动作图片 Route 或派生资源路径
- **THEN** 系统仍拒绝路径穿越、绝对路径、非图片扩展名和配置目录外文件
- **AND** 合法公共动作图片响应带有合适的内容类型和缓存头

### Requirement: Exercise list summary API
系统 MUST 为动作列表提供轻量摘要响应，完整动作详情 MUST 按需读取。

#### Scenario: List response omits heavy detail fields
- **WHEN** 前端请求 `/api/exercises` 用于动作库列表、分页或筛选展示
- **THEN** 响应 items 只包含列表卡片和简要预览需要的字段
- **AND** 响应不包含 embedding、完整说明长数组、完整来源字段或其他仅详情页需要的重字段

#### Scenario: Selected exercise loads full detail
- **WHEN** 用户选择一个动作并需要查看完整动作详情
- **THEN** 前端按 id 读取完整 `Exercise` 详情
- **AND** 详情加载期间展示稳定 loading 状态
- **AND** 已读取的详情在当前页面会话中可复用，避免重复请求同一动作

#### Scenario: Existing list workflows remain available
- **WHEN** 用户使用动作库搜索、筛选、分页、排序、查看相关动作或从编排页选择动作
- **THEN** 这些流程的用户可见行为与优化前保持一致
- **AND** 前端类型清晰区分列表摘要数据和完整动作详情数据

### Requirement: App shell side-effect isolation
系统 MUST 隔离主应用 shell 与独立页面，避免不展示侧栏的页面加载无用侧栏逻辑和聊天历史读取副作用。

#### Scenario: Standalone routes do not load sidebar history
- **WHEN** 用户访问 `/training` 或 `/dev/ai-traces`
- **THEN** 页面不触发主应用侧栏的聊天历史读取请求
- **AND** 页面不挂载只服务于主应用导航的 hover、focus、rail mode 和移动菜单副作用

#### Scenario: Main app routes keep navigation behavior
- **WHEN** 用户访问 `/`、`/plans`、`/composer`、`/exercises` 或 `/settings`
- **THEN** 主应用侧栏、聊天历史导航、新建对话入口和设置入口仍按现有交互工作
- **AND** route group 或 layout 调整不改变这些页面的 URL

### Requirement: Performance verification
系统 MUST 在实现完成后通过自动化检查和性能基线证明优化有效，且不得牺牲现有核心功能。

#### Scenario: Required checks pass
- **WHEN** 前端性能优化实现完成
- **THEN** 开发者运行 `npm run typecheck`
- **AND** 运行 `npm test` 或与改动范围相关的自动化测试
- **AND** 运行 `npm run build` 或记录无法运行的具体原因

#### Scenario: Performance deltas are recorded
- **WHEN** 优化实现完成并通过构建
- **THEN** 开发者记录关键路由入口 JavaScript raw/gzip 大小变化
- **AND** 记录动作列表接口响应体积或字段减少情况
- **AND** 记录动作图片列表展示的请求体积或资源变体变化

#### Scenario: Core behavior is preserved
- **WHEN** 性能优化合入
- **THEN** 聊天发送与流式回复、AI 产物卡片展示、动作库筛选分页、动作详情、动作编排、训练执行和本地匿名认证流程保持可用
- **AND** 优化不得通过删除用户可见功能来达成包体下降

