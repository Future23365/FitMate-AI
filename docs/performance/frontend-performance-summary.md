# 前端性能优化统计

生成时间：2026-06-02 21:29:11 CST

本次统计使用 `npm run build` 生成生产构建，再运行 `npm run perf:frontend` 从 `.next` client-reference manifest 汇总关键路由入口 JavaScript raw/gzip 大小和 chunk 清单。详细数据见：

- `docs/performance/frontend-performance-before.json`
- `docs/performance/frontend-performance-after.json`

## 路由入口体积

| route | before raw KB | after raw KB | before gzip KB | after gzip KB | gzip delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 675.7 | 192.1 | 179.9 | 59.1 | -120.8 |
| `/composer` | 559.1 | 555.6 | 148.3 | 148.6 | +0.3 |
| `/exercises` | 193.9 | 195.9 | 57.5 | 58.8 | +1.3 |
| `/plans` | 179.1 | 179.2 | 51.9 | 52.9 | +1.0 |
| `/training` | 260.0 | 234.3 | 77.1 | 70.1 | -7.0 |
| `/settings` | 156.5 | 156.6 | 46.5 | 47.5 | +1.0 |
| `/dev/ai-traces` | 282.5 | 261.3 | 79.7 | 73.6 | -6.1 |

首页下降的主要原因是 `react-markdown`、`remark-gfm`、训练计划卡、动作编排卡、动作推荐卡和客户端 Zod schema 从首屏同步依赖中移出。`/training` 和 `/dev/ai-traces` 下降来自主应用 shell route group 隔离，不再加载侧栏历史读取和导航副作用。

## 动作列表 API

优化前 `/api/exercises` 列表响应返回完整 `Exercise`，列表首屏会携带 `sourceUrl`、`license`、`instructionsEn`、`instructionsZh`、`secondaryMuscles`、`secondaryMusclesZh`、`images`、`embeddingText`、`embedding` 等详情字段。

优化后列表响应返回 `ExerciseListItem` 摘要字段，详情页和右侧详情面板通过 `/api/exercises/[id]` 按需读取完整 `Exercise`，并在当前页面会话缓存。`tests/exercise-service.test.ts` 已覆盖摘要响应不包含详情重字段。

## 动作图片资源

优化前本地动作图片目录统计：

- 文件数：1746
- 总体积：94.10 MB
- 平均单图：55.2 KB
- 最大单图：`exercises_picture/Cable_Judo_Flip/1.jpg`，897.8 KB

本次选择 Next image optimizer 策略，`next.config.ts` 已关闭 `images.unoptimized` 并启用 AVIF/WebP 输出格式。列表、小卡片和详情页继续使用受控 `/api/exercise-images/**` URL，路径安全校验、内容类型、缓存头和缺失图回退仍由本地图片 Route 与 resolver 负责。
