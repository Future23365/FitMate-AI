## Context

当前 `Exercise.images` / `Exercise.imageUrls` 保存在 PostgreSQL 中，其中 `imageUrls` 多数仍是 `raw.githubusercontent.com` 的远程地址。前端动作库、动作详情、推荐卡、训练编排和训练执行页都直接消费服务端返回的 `imageUrls` 或派生出的 `imageUrl`。

图片文件已经下载到项目根目录 `exercises_picture/<Exercise.id>/<stepIndex>.jpg`，并由下载脚本生成 `_manifest.json`。该目录当前不在 `public/` 下，Next.js 不会自动暴露它，因此需要一个受控的服务端读取入口或可配置的外部资源基础 URL。

本 change 属于跨服务端数据出口、API Route、前端展示契约和文档配置的变更，不能只在某个组件里替换字符串。

## Goals / Non-Goals

**Goals:**

- 前端展示动作图片时默认使用本地目录对应的可访问 URL。
- 支持通过配置切换动作图片目录和对外访问基础 URL，便于后续迁移到 CDN、对象存储或其他静态目录。
- 在服务端统一解析动作图片展示 URL，避免前端组件重复处理 GitHub URL、本地路径和占位图。
- 保留多步骤动作图片顺序，继续支持动作详情轮播和训练执行页多图展示。
- 对本地文件读取做路径安全校验，避免暴露配置目录之外的文件。

**Non-Goals:**

- 不修改 Prisma schema，不新增图片资源表。
- 不批量重写数据库中的 `imageUrls`，避免丢失原始来源信息。
- 不改变动作筛选、动作推荐、训练计划生成或 AI 语义逻辑。
- 不主动启动 dev server 或使用真实浏览器验证；实现阶段优先使用类型检查、测试和构建验证。

## Decisions

### 1. 服务端统一生成展示 URL，而不是前端逐处替换

动作图片展示 URL 应在服务端出站数据层统一生成。`Exercise` 进入前端之前，`imageUrls` 应已经是可展示的资源地址；训练 routine item、推荐卡等从动作库派生展示字段时也复用同一解析函数。

备选方案是在每个前端组件中判断 GitHub URL 并替换成本地路径。该方案会让动作库、详情 Sheet、推荐卡、训练编排和训练执行页各自维护一套规则，后续换 CDN 或目录结构时容易遗漏。

### 2. 原始来源数据保留在数据库中

数据库中的 `images` 和 `imageUrls` 继续表示来源事实：`images` 是源数据相对路径，`imageUrls` 是原始远程 URL。展示层通过 resolver 派生本地或配置后的 URL。

备选方案是一次性把 `Exercise.imageUrls` 更新为本地 URL。该方案短期简单，但会丢失来源地址，并把部署环境相关路径写进事实数据，后续迁移会更困难。

### 3. 使用配置化资源基础 URL 和本地目录

新增服务端配置：

- `EXERCISE_IMAGE_LOCAL_DIR`：本地图片目录，默认 `exercises_picture`。
- `EXERCISE_IMAGE_PUBLIC_BASE_URL`：前端访问图片的基础 URL，默认 `/api/exercise-images`。

当 `EXERCISE_IMAGE_PUBLIC_BASE_URL` 指向站内 API 时，由本项目的图片 Route 读取本地目录。当它指向 CDN 或对象存储域名时，resolver 只负责拼接 URL，图片文件由外部资源服务承载。

### 4. 本地读取 Route 只暴露配置目录内的图片

新增 `app/api/exercise-images/[...path]/route.ts` 或等价 Route。Route 只允许读取 `EXERCISE_IMAGE_LOCAL_DIR` 下的图片文件，必须拒绝路径穿越、绝对路径、空路径和非图片后缀。

该 Route 不承载用户私有数据；动作图片是公共动作库资产。它可以不依赖匿名用户 cookie，但必须限制文件系统边界，并返回合适的 `Content-Type` 与缓存头。

### 5. 本地资源索引优先使用 manifest，保留确定性回退

解析本地图片时优先读取下载脚本生成的 `_manifest.json`，用 `exerciseId`、`sourceImagePath`、`sourceUrl` 和 `stepIndex` 建立本地资源索引，避免每次列动作都对文件系统做大量 `stat`。

如果 manifest 不存在或某条记录缺失，resolver 可以基于 `exercise.images[index]` 或 `${exercise.id}/${index}.jpg` 生成确定性路径；但实现必须保证不会拼接出配置目录之外的 URL，并且在可确定本地资源缺失时回退到占位图或配置允许的来源。

## Risks / Trade-offs

- [Risk] 本地 manifest 与实际目录不同步，导致部分图片 URL 404。  
  Mitigation: 下载脚本继续输出 `_manifest.json` 和 `_failed.json`；实现阶段增加 resolver 测试和少量本地文件存在性校验，缺失时回退占位图。

- [Risk] 图片 Route 若路径处理不严谨，可能读取到配置目录之外的文件。  
  Mitigation: Route 必须使用路径归一化和目录边界校验，并测试 `..`、绝对路径、非图片后缀等拒绝场景。

- [Risk] 只改 `/api/exercises` 会漏掉推荐卡或训练执行页中由服务端派生的 `imageUrl`。  
  Mitigation: 把 resolver 放在服务端共享模块，统一接入动作仓储、动作推荐和 workout routine 映射链路。

- [Risk] 外部 CDN 基础 URL 与本地 API 基础 URL 的缓存策略不同。  
  Mitigation: resolver 只负责生成稳定 URL；本地 API 设置长缓存，外部 CDN 缓存策略由部署配置处理。

## Migration Plan

1. 新增图片配置、resolver、manifest 读取和受控读取 Route。
2. 将动作仓储和服务端派生展示字段切换到 resolver 输出。
3. 保持数据库数据不变，验证 API 返回的 `imageUrls` 从 GitHub URL 变成本地或配置后的 URL。
4. 更新 README 或相关文档说明图片目录配置方式。
5. 如需回滚，将 `EXERCISE_IMAGE_PUBLIC_BASE_URL` 指回远程资源基础 URL，或恢复 resolver 调用点即可，不需要数据库回滚。

## Open Questions

- 是否需要在实现阶段同时支持远程 GitHub 作为显式 fallback 配置。默认建议不启用，避免“看似本地化但实际仍依赖 GitHub”。
