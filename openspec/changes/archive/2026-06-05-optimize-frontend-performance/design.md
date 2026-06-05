## Context

当前构建产物显示路由级拆分已经生效，但路由内部仍有明显优化空间：`/` 首页入口约 raw 675.2 KB、gzip 179.6 KB，`/composer` 约 raw 559.0 KB、gzip 148.3 KB。首页静态加载 Markdown 渲染库、训练计划卡、训练编排卡、动作推荐卡；动作编排和训练执行页静态加载交互后才需要的动作详情面板；客户端还因为少量运行时解析带入完整 Zod schema。

图片侧已经接入本地动作图片服务，但 `next.config.ts` 当前设置 `images.unoptimized: true`，导致 `next/image` 不做尺寸和格式优化。`exercises_picture/` 中动作图片总量约 94.1 MB，列表页可一次展示 12/24/48/96 张图片，因此图片传输和解码成本会直接影响动作库和编排页体验。

数据侧 `/api/exercises` 当前返回完整 `Exercise` 对象，列表首屏却只需要摘要字段。完整说明、embedding、长数组和详情字段在列表接口中提前返回，会增加响应体、序列化和客户端内存成本。

根 layout 全站挂载侧栏、认证 Provider 和路由过渡组件。侧栏虽然在 `/training` 和 `/dev/*` 中返回 `null`，但仍会加载模块并注册历史读取 effect。这让独立页面承担了主应用 shell 的客户端成本。

## Goals / Non-Goals

**Goals:**

- 降低首页和动作编排页首屏 JavaScript 体积，优先减少当前最大入口的同步依赖。
- 将 Markdown、产物卡片、动作详情 Sheet、语音设置诊断等非首屏功能改为按需加载，并提供稳定 loading 状态。
- 避免客户端首屏加载不必要的 Zod schema，保留服务端和写入前的确定性校验。
- 让动作图片走可验证的优化路径，降低列表和详情页的图片传输体积。
- 为 `/api/exercises` 增加列表摘要响应，同时保留详情接口提供完整动作数据。
- 隔离主应用 shell 与独立页面的全局客户端副作用。
- 建立可重复的性能验证脚本或流程，用构建产物、接口响应和图片请求数据验证优化结果。

**Non-Goals:**

- 不改变 AI 编排、Prompt、Tool Calling、模型输出结构或训练生成规则。
- 不改变 Prisma schema，不新增动作图片表，不批量重写数据库图片字段。
- 不为了性能删除用户已经可见的卡片、详情、筛选、训练执行或语音配置能力。
- 不引入重量级性能监控 SaaS 或新运行时依赖；优先使用 Next.js 构建产物、脚本和现有测试体系。
- 不主动启动 dev server 或使用真实浏览器验证；除非后续实现阶段确实需要定位 hydration、布局或真实图片加载问题，并经用户确认。

## Decisions

### 1. 先建立性能基线，再做拆分

实现前先新增或固化一个本地性能统计流程，从 `.next/server/app/*_client-reference-manifest.js` 和 `.next/static/chunks` 汇总每个路由入口的 raw/gzip JS 体积，并记录关键路由：`/`、`/composer`、`/exercises`、`/plans`、`/training`、`/dev/ai-traces`、`/settings`。

备选方案是只靠 `next build` 输出判断。当前 Next 16 / Turbopack 输出没有稳定展示传统 route size 表，因此应保留项目内可重复脚本，避免后续只能凭肉眼猜测。

### 2. 路由内懒加载优先拆“低频且重”的组件

首页聊天页优先拆：

- `react-markdown` / `remark-gfm` 对应的 Markdown 渲染组件。
- `WorkoutPlanDraftCard`、`WorkoutRoutineDraftCard`、`ExerciseRecommendationCard`。

动作编排和训练执行页优先拆：

- `ExercisePreviewSheet`。
- 训练执行页的语音设置、语音自检和浏览器支持诊断面板。

拆分时应使用稳定的 loading skeleton 或轻量占位，不应让消息流、输入框、当前训练步骤和主要导航闪烁。对于首屏必须立即可交互的组件，不做动态拆分。

备选方案是把整个页面入口改成 `dynamic()`。该方案容易延迟首屏主交互，而且 App Router 已经有路由级拆分；本 change 应做更细粒度的路由内拆分。

### 3. 服务端校验与客户端轻量 guard 分离

Zod schema 仍是服务端 API、持久化和 AI 输出校验的事实来源，但客户端首屏不应因为类型导入或少量解析逻辑加载完整 schema。客户端需要运行时判断时，优先使用轻量 guard；只有在导入计划、保存 routine 或交互后确实需要复杂校验时，才动态加载相关转换和校验模块。

备选方案是直接删除客户端校验。该方案会降低数据安全和错误定位能力，不符合项目强类型和可维护性要求。

### 4. 图片优化必须有明确策略，不只依赖 `loading="lazy"`

当前列表图片默认已由浏览器和 `next/image` 处理懒加载，但 `images.unoptimized: true` 关闭了尺寸和格式优化。实现阶段必须选择并验证一种策略：

- 开启 Next 图片优化，并确保 `/api/exercise-images/**` 或等价本地图片 URL 可被 optimizer 安全处理；或
- 为动作图片生成缩略图/多尺寸派生资源，让列表页和小卡片请求小图，详情页和训练执行页请求较大图。

无论选择哪种策略，都必须保留本地图片读取 Route 的路径安全边界和长缓存策略，并确保占位图、缺失图和多步骤图片顺序不回退。

备选方案是只给图片组件显式加 `loading="lazy"`。这不足以解决原始图片体积、解码成本和 48/96 张列表图片的网络压力。

### 5. 动作列表使用摘要 DTO，详情按需读取完整数据

`/api/exercises` 列表响应应返回 `ExerciseListItem` 或等价摘要类型，只包含列表卡片、筛选计数、排序和右侧简要预览需要的字段。完整动作说明、完整二级肌群、embedding、长说明数组和源数据字段应由 `/api/exercises/[id]` 或明确的详情请求返回。

前端动作库可以保留当前“选择列表项后右侧展示详情”的体验，但数据流应拆成：

1. 列表接口返回轻量摘要。
2. 选中项缺少完整详情时发起详情请求。
3. 详情请求期间显示稳定 skeleton，并缓存已读取详情，避免重复请求。

备选方案是在现有完整 `Exercise` 上继续做前端裁剪。该方案不会降低响应体、序列化和传输成本。

### 6. 主应用 shell 用 route group 隔离，而不是在客户端 return null

主应用侧栏、聊天历史读取和常规路由过渡应只挂载在需要主应用 shell 的路由下。推荐通过 Next App Router route group 拆分主应用页面和独立页面，例如把普通页面放到主 shell layout，把 `/training`、`/dev/ai-traces` 放到独立 layout，保持 URL 不变。

如果实现阶段发现 route group 迁移风险过高，可以先把侧栏历史读取 effect 移到实际渲染分支之后，并确保独立页面不触发聊天历史请求。但长期更清晰的方向是布局层隔离，而不是客户端组件内部判断。

### 7. 验证以自动化和构建产物为主

实现阶段应优先运行：

- `npm run typecheck`
- `npm test` 或相关单测
- `npm run build`
- 性能统计脚本，记录优化前后 route entry JS raw/gzip、关键接口响应体大小和图片资源体积

如果 `npm run build` 在沙箱内因 Turbopack 权限失败，应按权限规则申请在沙箱外运行一次构建。不得主动启动 dev server。

## Risks / Trade-offs

- [Risk] 动态拆分产物卡片后，AI 回复完成时卡片加载出现明显延迟。  
  Mitigation: 只拆低频重组件，提供卡片 skeleton，并可在收到 `artifact_generating` 时预加载对应模块。

- [Risk] 去掉客户端 Zod 首屏依赖后，某些旧历史或异常 payload 在 UI 层暴露错误。  
  Mitigation: 保留轻量 guard、错误边界和服务端校验；写入前或导入前仍执行确定性校验。

- [Risk] 图片 optimizer 与本地 API Route 组合后出现不可缓存、不可优化或 SVG/图片类型限制问题。  
  Mitigation: 先用少量图片和构建配置验证；若 Next optimizer 不适合本地 API 图片，则转为生成缩略图/多尺寸派生资源。

- [Risk] 动作列表 DTO 会影响多个前端调用点和类型边界。  
  Mitigation: 分离 `ExerciseListItem` 和 `Exercise`，只在列表接口使用摘要类型；详情页、训练生成和服务端领域逻辑继续使用完整 `Exercise`。

- [Risk] route group 迁移可能影响页面路径、metadata 或 layout 样式。  
  Mitigation: 保持 URL 不变，迁移后用构建和路由清单验证所有页面仍存在；如风险过高，先实施副作用延迟作为阶段性方案。

## Migration Plan

1. 新增性能统计脚本或记录流程，提交优化前基线。
2. 拆首页聊天低频重依赖，验证 `/` entry JS raw/gzip 下降且聊天核心流程不变。
3. 拆动作编排和训练执行交互后面板，验证 `/composer`、`/training` entry JS 下降。
4. 拆客户端 Zod 运行时依赖，保留服务端校验与必要的前端轻量 guard。
5. 选择并实现动作图片优化策略，验证列表图片请求体积和多步骤详情展示。
6. 为 `/api/exercises` 增加列表摘要 DTO 与详情按需读取，验证动作库筛选、分页、详情、相关动作和编排入口。
7. 隔离主应用 shell 与独立页面 layout，验证 `/training`、`/dev/ai-traces` 不再加载侧栏历史读取逻辑。
8. 运行类型检查、测试、构建和性能统计，记录优化结果。

## Open Questions

- 图片优化最终采用 Next optimizer 还是生成缩略图，需要在实现阶段用当前本地图片 Route 验证后决定。
- 性能预算的具体阈值应以当前基线为准，建议先要求 `/` 和 `/composer` 首包 gzip 至少下降 25%，再根据实际拆分效果调整。
