## Why

当前「保存全链路log」把模块摘要、Raw trace 和长文本混在 `codex_logs/ai_trace_log.js` 中。长 prompt、model input、observation 和 raw response 会让默认日志体积很大；如果继续硬截长文本，又会丢失排查模型行为 bug 时最关键的尾部约束或 JSON 结尾。

本 change 需要把默认排查入口改成轻量报告，并把长文本外置到可按引用查找的映射文件，降低日常读 log 的 token 成本，同时保留必要的深度复盘能力。

## What Changes

- 将「保存全链路log」调整为双文件覆盖导出：
  - `codex_logs/ai_trace_log.js` 保存极简报告、模块摘要、关键 code/id、token usage、step 结构和长文本引用。
  - `codex_logs/ai_trace_texts.jsonl` 保存脱敏后的长文本映射，一行一个 `contentRef` 记录。
- 报告文件中的长字符串不再直接内联，改为 `contentRef`、`originalLength`、`hash`、`path` 和简短预览，方便按需定位长文本。
- 长文本文件头部写入注释，说明如何从报告中的 `contentRef` 使用 `rg` 精确查找对应文本。
- 多次点击保存继续覆盖上一次全链路 log 和长文本映射，不新增导出目录，也不累积历史导出。
- 「保存用户问答记录」继续追加写入 `codex_logs/prompt.js`，不受本 change 影响。
- 继续执行脱敏边界，不导出 API key、authorization、cookie、跨用户 payload、完整敏感 payload 或完整 tool output。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-trace-debugger`: 修改「保存全链路log」的导出合同，要求默认报告与长文本映射分离，并提供可查找的 `contentRef` 指引。

## Impact

- 影响代码：`components/dev/ai-trace-viewer.tsx`、`app/api/dev/ai-traces/route.ts`。
- 影响测试：`tests/ai-trace-viewer.test.ts`、`tests/ai-trace-http.test.ts`。
- 不影响 `/api/chat` 主链路、Agent runtime、PlannerPort、ToolRegistry、Policy Guard、ResourceStore、Response Renderer、Prisma Schema、数据库迁移、用户问答记录导出和用户可见聊天协议。
