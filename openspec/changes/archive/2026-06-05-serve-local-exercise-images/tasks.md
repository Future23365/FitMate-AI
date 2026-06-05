## 1. 图片配置与解析层

- [x] 1.1 梳理当前 `Exercise.imageUrls` 和派生 `imageUrl` 的服务端使用点，确认动作库、推荐卡、routine 保存读取和训练执行页都能接入统一 resolver。
- [x] 1.2 新增服务端动作图片配置模块，支持 `EXERCISE_IMAGE_LOCAL_DIR` 和 `EXERCISE_IMAGE_PUBLIC_BASE_URL`，并提供默认值 `exercises_picture` 与 `/api/exercise-images`。
- [x] 1.3 新增动作图片 resolver，优先使用 `exercises_picture/_manifest.json` 建立本地资源索引，按动作 id 和步骤序号生成稳定展示 URL。
- [x] 1.4 为 resolver 增加缺失资源回退逻辑，确保无图、manifest 缺失或单个图片不可解析时返回现有占位图或显式配置的 fallback 来源。

## 2. 本地图片读取 API

- [x] 2.1 新增 `app/api/exercise-images/[...path]/route.ts` 或等价 Route，从配置目录读取图片文件。
- [x] 2.2 实现路径安全校验，拒绝 `..`、绝对路径、空路径段、非图片扩展名和配置目录外文件。
- [x] 2.3 为图片响应设置正确 `Content-Type`、错误状态和静态资源缓存头。

## 3. 服务端数据出口接入

- [x] 3.1 在 `lib/server/exercises/exercise-repository.ts` 中接入 resolver，让 `/api/exercises` 和 `/api/exercises/:id` 返回本地或配置后的展示 URL。
- [x] 3.2 在动作推荐服务中复用 resolver，确保推荐卡 `imageUrl` 不再默认来自 GitHub raw URL。
- [x] 3.3 在 workout routine 映射和训练执行相关服务端读取链路中复用 resolver，确保已保存 routine 读取时使用当前图片配置。
- [x] 3.4 检查前端组件，删除因本次接入变得多余的局部 URL 替换逻辑；若没有局部替换逻辑，则保持组件只消费 `imageUrls` / `imageUrl`。

## 4. 文档与验证

- [x] 4.1 更新 README 或相关项目文档，说明 `exercises_picture`、`EXERCISE_IMAGE_LOCAL_DIR` 和 `EXERCISE_IMAGE_PUBLIC_BASE_URL` 的使用方式。
- [x] 4.2 如实现涉及核心展示链路调整，在 `docs/方案变更历史/` 新增本次方案变更记录，并按需追加 `docs/项目演变历程.md`。
- [x] 4.3 为 resolver 增加单元测试，覆盖 manifest 命中、多步骤顺序、配置基础 URL、无图回退和缺失资源回退。
- [x] 4.4 为图片读取 Route 增加测试或等价验证，覆盖合法图片、路径穿越、非图片后缀和缺失文件。
- [x] 4.5 运行 `npm run lint`、`npm run typecheck`、`npm test`。
- [x] 4.6 若实现触及 Route、构建配置或服务端/客户端模块边界，运行 `npm run build`；如无法运行，记录原因。
