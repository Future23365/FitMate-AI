## Context

`/dev/ai-traces` 当前已有保存全链路 log 的能力，前端会把完整 trace/stage/step payload 发送到 `POST /api/dev/ai-traces`，接口统一写入 `codex_logs/ai_trace_log.js`。这类日志适合排查链路，但对回归测试过重：里面混有内部候选、校验、metadata 和模型请求细节。

用户需要的 `prompt.js` 更像“问答样本”：多轮对话时保留历史用户问题，只保留最终展示给用户的回答文本，不包含卡片内容。

## Goals / Non-Goals

**Goals:**
- 在 trace 页面一键导出当前 trace 的用户问答记录。
- 输出格式直接可读，包含 trace 标题、route、保存时间、用户问题列表和最终回答文本。
- 复用 dev-only trace 保存接口，保持写文件能力只在 AI trace 开启时可用。
- 不影响现有全链路 log 保存行为。

**Non-Goals:**
- 不把 `prompt.js` 设计成自动化测试 runner 或 fixture schema。
- 不新增数据库表、API 契约给生产环境使用。
- 不导出动作卡片、训练计划卡片、候选动作池或完整模型 payload。

## Decisions

1. 保存类型由请求体中的 `logType` 区分。
   - 选择：`trace` 覆盖写入 `ai_trace_log.js`，`prompt` 追加写入 `prompt.js`。
   - 理由：复用已有 dev-only endpoint，避免新增只用于开发页的 API route。
   - 取舍：接口请求体多一个字段，但行为集中在一个保存入口，后续扩展其他调试导出也更直观。

2. 问答记录在前端从当前 trace 中提炼。
   - 选择：trace viewer 已持有完整 trace 和现有压缩/展示 helper，直接生成窄 payload。
   - 理由：按钮语义是“保存当前页面选中的 trace”，前端最清楚当前目标和保存状态。
   - 取舍：如果 trace payload 结构继续演进，提炼 helper 需要同步更新；但不会污染服务端 AI 编排代码。

3. 用户问题优先从 `trace.input` 和模型请求 messages 中提取，并去重保序。
   - 选择：从常见字段和 `model_request.messages` 中收集 `role: "user"` 的文本内容。
   - 理由：当前 trace 已能看到 latestUserMessage、conversationSummary 和模型 messages；多轮上下文通常会出现在模型请求 messages 中。
   - 取舍：如果某些链路只记录 summary 而不记录完整历史用户消息，导出会保留可见的最新问题，避免伪造不可见历史。

4. 最终回答只从用户可见文本字段提取。
   - 选择：优先读取 `response_write` / final response 相关 step 的文本字段，其次回退到模型响应中的 assistant content。
   - 理由：要排除卡片内容，不能直接保存完整 output；文本字段更接近最终展示给用户的回答。
   - 取舍：不同链路字段名不完全统一，因此 helper 会做多路径读取，但输出仍保持窄结构。

## Risks / Trade-offs

- trace 未记录完整历史用户问题 → 导出只保存 trace 中可见的问题，并通过空数组/缺失值保持真实边界。
- 不同 step 的最终回答字段不统一 → 使用集中 helper 和候选字段顺序，后续字段稳定后可收敛。
- `prompt.js` 会持续追加记录 → 文件会随回归样本累积变长；这是为了保留多次问答样本，清理交给人工按需处理。
- 保存时间使用本地时区 → 方便对齐本机 dev log 和人工调试时间，但不适合作为跨时区排序的唯一依据。
