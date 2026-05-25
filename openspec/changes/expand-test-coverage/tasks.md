## 1. 前置条件与测试数据

- [ ] 1.1 确认 `formalize-testing-workflow` 已完成，`npm test` 可运行并能发现当前测试。
- [ ] 1.2 新增测试 fixture 或工厂函数，覆盖 `Exercise`、`WorkoutItem`、`WorkoutPlanIntent`、`WorkoutPlanDraft`、聊天消息和 API request。
- [ ] 1.3 清理测试数据组织方式，确保单元测试默认使用最小 fixture，只有真实数据兼容性测试读取 `data/exercises.zh.json`。

## 2. 共享领域逻辑测试

- [ ] 2.1 补充 `lib/shared/workouts/composition.ts` 测试，覆盖 timeline、循环、休息、估算、热身/训练/拉伸分区和计时/计次动作。
- [ ] 2.2 补充 `lib/shared/chat/fitness-conversation-context.ts` 测试，覆盖长对话截取、trigger intent 合并、事实提取、缺失字段和 prompt 格式化。
- [ ] 2.3 补充 `features/chat/lib/workout-plan-trigger.ts` 测试，覆盖 fenced JSON、嵌入 JSON、无效 JSON 和非 trigger 文本。
- [ ] 2.4 补充共享 Schema 测试，覆盖 workout plan、exercise recommendation、exercise query 和 workout persistence 的合法与非法输入。

## 3. 服务层测试

- [ ] 3.1 补充 `lib/server/exercises/exercise-service.ts` 测试，覆盖搜索、分类、肌群、器械、居家条件、分页、排序和 facets。
- [ ] 3.2 补充 `lib/server/workout-plans/exercise-candidate-service.ts` 测试，扩展目标肌群、器械、伤病、avoidance、候选不足和候选排序场景。
- [ ] 3.3 补充 `lib/server/workout-plans/workout-plan-validation-service.ts` 测试，覆盖非法 `exerciseId`、重复动作、时长估算、伤病风险和合规草稿。
- [ ] 3.4 补充 AI 编排边界测试，覆盖 JSON 解析失败、模型输出校验失败、高风险健康词拦截、候选不足降级、`parentTraceId` 和 trace metadata。
- [ ] 3.5 补充 `lib/server/workouts/workout-persistence-service.ts` 和 `lib/server/chat/chat-history-service.ts` 的映射、userId 隔离参数、状态转换和删除路径测试。
- [ ] 3.6 补充 `lib/server/dev/ai-trace-store.ts` 和 `lib/server/http/*` 测试，覆盖 trace 生命周期、错误 body 解析和请求失败映射。

## 4. API 边界测试

- [ ] 4.1 补充 `/api/chat` Route Handler 测试，覆盖入参校验、缺少模型配置、合法请求服务调用、流事件和 `traceId`。
- [ ] 4.2 补充 `/api/ai/workout-plan` 与 `/api/ai/exercise-recommendations` Route Handler 测试，覆盖请求校验失败、失败码映射、成功响应和 `parentTraceId`。
- [ ] 4.3 补充 `/api/exercises` 与 `/api/exercises/[id]` 测试，覆盖列表参数、详情、非法参数和资源不存在。
- [ ] 4.4 补充 workouts、workout sessions 和 chat conversations API 测试，覆盖列表、详情、创建/更新、删除、非法参数和资源不存在。

## 5. 前端业务逻辑与交互验收

- [ ] 5.1 补充聊天前端逻辑测试，覆盖 NDJSON 流事件处理、推荐动作去重、不喜欢动作排除、换一批参数和训练卡片 trigger。
- [ ] 5.2 补充 workout 前端请求与转换测试，覆盖保存训练、读取训练、日程状态更新、请求错误映射和计划草稿转保存结构。
- [ ] 5.3 对训练执行页、动作预览抽屉、推荐卡片和浏览器 API 相关变更保留 Chrome DevTools MCP 验收任务。
- [ ] 5.4 如为测试需要调整模块边界，只抽出稳定纯函数或服务入口，不为测试暴露不稳定实现细节。

## 6. 验证

- [ ] 6.1 运行 `npm test`。
- [ ] 6.2 运行 `npm run typecheck`。
- [ ] 6.3 运行 `npm run lint`。
- [ ] 6.4 如修改 Route Handler、Next.js 配置、依赖配置或服务端/客户端导入边界，运行 `npm run build`。
- [ ] 6.5 在最终交付中记录已运行命令；如任何检查无法运行，说明原始报错、原因和剩余风险。
