## 1. Prompt 配置边界

- [x] 1.1 新增 `lib/server/ai/prompt-config.ts`，迁移现有 `aiPromptConfig` 内容并保持 prompt 文本不变。
- [x] 1.2 更新 `app/api/chat/route.ts`、`lib/server/workout-plans/ai-workout-plan-service.ts`、`lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts` 的导入路径。
- [x] 1.3 删除旧的 `app/api/ai-prompt-config.ts`，并用 `rg "@/app/api/ai-prompt-config|app/api/ai-prompt-config"` 确认没有旧路径残留。

## 2. 聊天服务端编排模块

- [x] 2.1 在 `lib/server/chat/*` 建立聊天请求 Schema、请求类型和服务返回类型，保持 `/api/chat` 请求体和错误语义兼容。
- [x] 2.2 将聊天意图 Schema、意图解析模型请求、JSON 解析、fallback 和相关 trace step 移入服务端聊天模块。
- [x] 2.3 将动作上下文构建逻辑移入服务端聊天模块，继续复用 `listAllExercises()` 和 `selectExerciseCandidates()`。
- [x] 2.4 将 `assistantAction` 推导和 suggested replies 可见性规则提取为可测试的确定性函数。
- [x] 2.5 将 system prompt 构造、DeepSeek 流式请求、stream event 编码和 token usage 处理移入服务端聊天模块。

## 3. Route Handler 收薄

- [x] 3.1 将 `app/api/chat/route.ts` 改为 HTTP 边界入口，只保留 API key 检查、body 解析、请求校验、trace 创建、服务调用和响应映射。
- [x] 3.2 确保 `/api/chat` 的成功流事件、错误响应、`done` 事件 `traceId`、`thinkingEnabled` 处理和超时行为保持兼容。
- [x] 3.3 确保 `app/api/chat/route.ts` 不再直接承载意图解析、候选动作注入、prompt 构造或模型请求细节。

## 4. 测试与回归验证

- [x] 4.1 补充或调整服务端测试，覆盖聊天请求校验、意图解析 fallback、候选动作上下文构建、assistant action 推导和 suggested replies 过滤。
- [x] 4.2 补充或调整流事件测试，覆盖内容 delta、错误事件、token usage 和最终 trace metadata。
- [x] 4.3 验证 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 在 prompt config 移动后仍保持 `parentTraceId`、模型输出校验和候选动作校验不变。
- [x] 4.4 运行 `npm run typecheck`。
- [x] 4.5 运行 `npm run lint`。

## 5. 文档与边界检查

- [x] 5.1 如目录结构或分层约定发生实际变化，同步更新 `README.md` 的目录说明和分层约定。
- [x] 5.2 使用 `rg "from \\\"@/app/api|from '@/app/api"` 检查 `lib/server/*` 中不存在对 `app/api/*` 的反向依赖。
- [x] 5.3 使用 AI Trace 或保存日志对比一次典型聊天请求，确认模型调用次数、主要 trace step 和 token usage 语义未发生非预期变化。
