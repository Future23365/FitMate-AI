## Why

动作图片已经从 GitHub 下载到项目本地 `exercises_picture/` 目录，但前端仍直接展示数据库中的 GitHub raw URL。继续依赖远程 URL 会让本地开发、离线可用性和后续资源迁移都受制于外部源。

本次 change 需要把动作图片展示切换为可配置的本地资源 URL，并保留后续迁移到 CDN、对象存储或其他静态目录的能力。

## What Changes

- 新增动作图片资源能力：前端展示使用服务端生成的动作图片 URL，而不是直接使用 GitHub raw URL。
- 支持通过环境变量配置本地图片目录和对外访问基础 URL。
- 新增受控图片读取入口，用于从配置目录读取 `exercises_picture/<exerciseId>/<stepIndex>.jpg` 这类本地文件。
- 在服务端动作数据出口统一解析图片 URL，避免在多个前端组件中重复替换路径。
- 保留数据库中的原始 `images` / `imageUrls` 字段语义，不把 GitHub 来源信息从事实数据中抹掉。
- 继续支持无图片或本地文件缺失时回退到现有占位图。

## Capabilities

### New Capabilities
- `exercise-image-assets`: 约束动作图片如何从本地目录或配置的资源基础 URL 生成前端可访问地址，并覆盖安全读取、回退和多步骤图片展示。

### Modified Capabilities
- 无。

## Impact

- 影响服务端动作数据出口：`lib/server/exercises/exercise-repository.ts`、动作推荐服务、训练计划/训练执行持久化读取链路中依赖 `exercise.imageUrls` 的位置。
- 新增图片资源读取 API Route，例如 `app/api/exercise-images/[...path]/route.ts`。
- 新增或调整环境变量，例如 `EXERCISE_IMAGE_LOCAL_DIR`、`EXERCISE_IMAGE_PUBLIC_BASE_URL`。
- 可能更新 `README.md` 或相关文档，说明本地图片目录与可配置 URL。
- 不改变 Prisma 数据模型，不要求迁移数据库字段。
