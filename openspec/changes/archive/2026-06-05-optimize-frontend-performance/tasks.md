## 1. 性能基线与统计工具

- [x] 1.1 新增或固化前端构建产物统计流程，能从 `.next` manifest 汇总关键路由入口 JavaScript raw/gzip 大小和 chunk 清单。
- [x] 1.2 记录实现前基线，至少覆盖 `/`、`/composer`、`/exercises`、`/plans`、`/training`、`/settings`、`/dev/ai-traces`。
- [x] 1.3 记录 `/api/exercises` 列表响应体积和当前列表图片请求体积或图片资源大小基线。

## 2. 首页聊天首包拆分

- [x] 2.1 将 Markdown 渲染组件从首页首屏同步依赖中拆出，改为仅在需要渲染 assistant Markdown 内容时加载。
- [x] 2.2 将 `WorkoutPlanDraftCard`、`WorkoutRoutineDraftCard`、`ExerciseRecommendationCard` 改为按 artifact 出现时加载，并提供稳定 loading 状态。
- [x] 2.3 在收到 `artifact_generating` 或等价状态时预加载对应卡片模块，降低用户等待卡片出现的延迟。
- [x] 2.4 拆分后验证首页空状态、快捷提问、输入框、流式消息、建议回复和产物卡片功能保持一致。

## 3. 动作编排与训练执行按需加载

- [x] 3.1 将动作编排页中的 `ExercisePreviewSheet` 改为交互后按需加载，并保留动作库主操作的首屏可用性。
- [x] 3.2 将训练执行页动作详情 Sheet 改为按需加载，确保当前训练步骤、计时、暂停和完成流程不受影响。
- [x] 3.3 梳理训练执行页语音设置、语音自检和浏览器支持诊断面板，拆出非首屏重逻辑或交互后模块。
- [x] 3.4 为按需加载面板提供稳定 loading、错误和关闭状态，避免面板加载期间阻塞主流程。

## 4. 客户端 schema 与类型边界瘦身

- [x] 4.1 审核客户端入口中所有 `zod` 或共享 schema 运行时 import，区分类型导入、服务端校验和前端必要 guard。
- [x] 4.2 将首页推荐意图解析改为轻量 guard 或按需校验，避免首页首屏同步加载完整 workout plan schema。
- [x] 4.3 将训练计划/训练编排转换中的复杂 schema 校验移动到执行边界或动态加载模块，保留导入、保存和转换失败时的明确错误。
- [x] 4.4 增加或调整测试，覆盖旧历史 payload、无效 artifact、导入失败和保存前校验边界。

## 5. 动作图片优化

- [x] 5.1 验证当前本地动作图片 Route 与 Next image optimizer 的兼容性，决定使用 Next 优化还是生成缩略图/多尺寸派生资源。
- [x] 5.2 若使用 Next image optimizer，调整 `next.config.ts` 的图片配置，确保本地动作图片 URL 可优化且安全边界不放宽。
- [x] 5.3 若使用缩略图/多尺寸资源，新增派生脚本、manifest 结构和 resolver 支持，让列表、小卡片、详情页使用合适尺寸。（不适用：本次选择 Next image optimizer）
- [x] 5.4 保持本地图片读取 Route 的路径安全校验、内容类型、缓存头、缺失图回退和多步骤顺序。
- [x] 5.5 增加图片 resolver 或资源策略测试，覆盖列表尺寸、详情尺寸、缺失图片、路径攻击和占位图回退。

## 6. 动作列表摘要 API

- [x] 6.1 设计并新增 `ExerciseListItem` 或等价摘要类型，明确列表卡片、筛选、分页和简要预览需要的字段。
- [x] 6.2 调整 `/api/exercises` 返回摘要 items，避免返回 embedding、完整说明长数组、完整来源字段和仅详情页需要的重字段。
- [x] 6.3 调整前端动作库列表和右侧详情数据流：列表用摘要，选中动作按 id 拉取完整详情并缓存。
- [x] 6.4 确保动作库搜索、筛选、分页、排序、相关动作、动作编排选择入口和加载/错误/空状态行为不变。
- [x] 6.5 增加 API 和前端相关测试，覆盖摘要响应字段、详情按需读取、重复选择缓存和异常详情加载。

## 7. 主应用 shell 副作用隔离

- [x] 7.1 评估并实施 route group layout 拆分，保持 URL 不变，将主应用 shell 与 `/training`、`/dev/ai-traces` 等独立页面隔离。
- [x] 7.2 若 route group 拆分风险过高，先实施侧栏历史读取和导航副作用延迟挂载，确保独立页面不触发无用请求。（不适用：已实施 route group 拆分）
- [x] 7.3 验证主应用路由仍保留侧栏、聊天历史、新建对话、设置入口和路由过渡体验。
- [x] 7.4 验证 `/training` 和 `/dev/ai-traces` 不加载或执行主应用侧栏历史读取逻辑。

## 8. 文档、验证与收尾

- [x] 8.1 运行 `npm run typecheck`。
- [x] 8.2 运行 `npm test` 或与本 change 相关的自动化测试。
- [x] 8.3 运行 `npm run build`；若沙箱内 Turbopack 权限失败，按权限规则申请在沙箱外运行并记录原因。
- [x] 8.4 运行性能统计流程，记录优化前后 route entry JS raw/gzip、动作列表响应体积和图片资源体积变化。
- [x] 8.5 如实现涉及图片目录、构建配置、环境变量、路由结构或协作方式变化，更新 README 或相关项目文档。
- [x] 8.6 如实现涉及核心链路优化或架构调整，在 `docs/方案变更历史/` 新增方案变更记录，并按需追加 `docs/项目演变历程.md`。
- [x] 8.7 运行 `openspec validate optimize-frontend-performance --strict`，确认 change 文档和规格可归档。
