## 1. OpenSpec 与契约

- [x] 1.1 补充 `ai-trace-debugger` 规格，定义用户问答记录导出按钮、保存路径和导出内容边界。
- [x] 1.2 运行 `openspec validate add-ai-trace-prompt-export --strict`。

## 2. Trace Viewer 实现

- [x] 2.1 在 `TraceHero` 中新增「保存用户问答记录」按钮，并放在「保存全链路log」左侧。
- [x] 2.2 新增用户问答记录 payload 构造逻辑，只提取 trace 可见的用户问题和最终文本回答。
- [x] 2.3 复用现有保存状态和提示文案，区分用户问答记录与全链路 log 的保存目标。

## 3. 保存接口实现

- [x] 3.1 扩展 `POST /api/dev/ai-traces` 请求体，支持 `logType: "trace" | "prompt"`。
- [x] 3.2 当 `logType` 为 `prompt` 时追加写入 `codex_logs/prompt.js`，并使用清晰的 CommonJS 记录列表格式。
- [x] 3.3 保持默认或 `trace` 类型继续写入 `codex_logs/ai_trace_log.js`。
- [x] 3.4 保存文档顶部时间使用本地时区格式。

## 4. 验证

- [x] 4.1 运行与改动范围相关的类型检查。
- [x] 4.2 运行相关自动化测试或说明未运行原因。
- [x] 4.3 检查 Git 状态，提交本次改动，并在最终回复中说明剩余未提交文件。
