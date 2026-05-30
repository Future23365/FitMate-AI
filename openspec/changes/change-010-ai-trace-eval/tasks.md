## 1. Trace 数据结构

- [x] 1.1 新增或扩展 `AiRunTrace` 类型，包含 runId、userId、sessionId、messageId、model、promptVersion、toolVersions、input、steps 和 finalDecision。
- [x] 1.2 定义 trace step 类型，覆盖 intent resolution、reference resolution、tool call、patch proposal、validation、persistence 和 response write。
- [x] 1.3 增加 trace 字段长度预算、摘要化和敏感字段脱敏规则。

## 2. Trace 记录接入

- [x] 2.1 在 `/api/chat` 编排入口创建 run trace，并记录 latest user message 与 recent artifact summaries。
- [x] 2.2 在 ReferenceResolver 执行时记录 `reference_resolution` step。
- [x] 2.3 在 `searchArtifacts`、`getArtifactPayload` 和后续受控工具调用时记录 `tool_call` step。
- [x] 2.4 在 Patch 提出或应用时记录 `patch_proposal` step 和 Patch scope / operation 摘要。
- [x] 2.5 在 Validation、Persistence 和 Response Writer 阶段记录成功、可恢复失败或硬失败结果。
- [x] 2.6 确保 trace 写入失败不会导致用户可见回复丢失。

## 3. Trace 调试页

- [x] 3.1 扩展 `/dev/ai-traces` 阶段映射，展示 reference resolution、tool call、patch proposal、validation 和 persistence step。
- [x] 3.2 为新增 step 提供可读摘要，显示状态、关键 id、耗时、错误 code 和决策原因。
- [x] 3.3 保留新增 step 的 Raw JSON 查看和保存 log 功能。
- [x] 3.4 对未知 step 类型提供通用展示，避免后续扩展导致调试页空白。

## 4. 权限与隐私

- [x] 4.1 校验 trace 中 artifact、schedule、routine payload 只来自当前 userId 可访问范围。
- [x] 4.2 对长 payload、模型消息和工具输出执行截断或摘要化。
- [x] 4.3 补充失败路径 trace，确保权限拒绝、候选不足、Patch 校验失败和持久化失败都有可诊断记录。

## 5. 测试与验证

- [x] 5.1 补充 trace builder 单元测试，覆盖基础 envelope、step 追加和 finalDecision。
- [x] 5.2 补充 ReferenceResolver、tool call、Patch 和 validation step 的 trace fixture。
- [x] 5.3 补充 `/dev/ai-traces` step 展示测试或组件测试，覆盖新增 step 类型和 Raw JSON。
- [x] 5.4 补充 trace 脱敏和长度截断测试。
- [x] 5.5 运行 `npm test`、`npm run typecheck` 和 `npm run lint`；如影响 trace 页面构建边界，运行 `npm run build` 或说明无法运行原因。

## 6. 文档记录

- [x] 6.1 在 `docs/方案变更历史` 新增方案变更记录，说明第一批 AI 编排 trace 能覆盖 artifact、引用解析、Patch 和校验链路。
- [x] 6.2 如 trace 字段、log 保存方式或调试页使用方式变化，同步更新相关开发文档。
- [x] 6.3 在 `docs/项目演变历程.md` 末尾追加本次核心 AI trace 链路改进记录。
