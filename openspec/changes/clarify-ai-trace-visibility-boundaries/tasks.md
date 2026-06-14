## 1. Scope and Boundary Checks

- [x] 1.1 确认本 change 只修改 `/dev/ai-traces` 页面、trace 导出逻辑和对应测试，不修改 LangChain runtime 主循环、DeepSeek provider payload、production response adapter 主流程或 `/api/chat` route。
- [x] 1.2 确认不修改任何业务 tool 的 `inputSchema`、`outputSchema`、`description`、schema description 或 `toModelVisibleSummary` 字段集合。
- [x] 1.3 确认 `traceSummary.totalMatches`、`returnedCount`、`truncated` 等 debug 指标仍保留在 trace / export 中，但不进入 `modelVisibleSummary`。

## 2. Trace Viewer Implementation

- [x] 2.1 在 `components/dev/ai-trace-viewer.tsx` 或等价组件中，将 `modelVisibleSummary`、`userProjection`、`traceSummary` 展示为清晰分区或等价结构。
- [x] 2.2 为 `modelVisibleSummary` 展示 LLM 可见 / ToolMessage 内容标签，并标记 `modelVisible: true` 或等价 UI 语义。
- [x] 2.3 为 `userProjection` 展示用户投影 / 前端投影标签，并标记不回填模型。
- [x] 2.4 为 `traceSummary` 展示 debug-only / 调试摘要标签，并标记不回填模型。
- [x] 2.5 在页面展示 `traceSummary.totalMatches`、`returnedCount`、`truncated` 或等价候选数量诊断时，明确标注 debug-only / not model-visible。
- [x] 2.6 调整 `enteredModelContext` 的页面文案或派生展示，说明它只表示 `modelVisibleSummary` 已进入模型上下文，不表示整个 execution record 进入模型。
- [x] 2.7 保留 Raw JSON、`contentRef` 和 `detailRef` 入口，不因可见性标签删除现有排查信息。

## 3. Trace Export Implementation

- [x] 3.1 在保存全链路 log 的导出逻辑中，为 `modelVisibleSummary`、`userProjection`、`traceSummary` 添加区块级或字段级 visibility 元数据。
- [x] 3.2 导出中将 `modelVisibleSummary` 标注为 `llm_visible`、`modelVisible: true` 或等价语义。
- [x] 3.3 导出中将 `userProjection` 标注为 `user_projection`、`modelVisible: false` 或等价语义。
- [x] 3.4 导出中将 `traceSummary` 标注为 `debug_only`、`modelVisible: false` 或等价语义。
- [x] 3.5 当导出报告或 `detailRef` 详情包含 `traceSummary.totalMatches`、`returnedCount`、`truncated` 时，确保字段或所属区块能被识别为 debug-only / not model-visible。
- [x] 3.6 当 `modelVisibleSummary`、`userProjection` 或 `traceSummary` 被外置到 `contentRef` / `detailRef` 时，header record 保留可见性元数据，chunk record 通过 `parentRef` 继承该边界。
- [x] 3.7 导出仍执行现有脱敏、截断和大 payload 外置规则；visibility 标签不得替代安全脱敏。

## 4. Tests and Regression Coverage

- [x] 4.1 更新 `tests/ai-trace-viewer.test.ts` 或最接近的页面测试，覆盖 tool execution 三类输出分区和 visibility 标签。
- [x] 4.2 更新 `tests/ai-trace-viewer.test.ts` 或最接近的页面测试，覆盖 `enteredModelContext` 不再暗示整条 execution record 进入模型上下文。
- [x] 4.3 更新 `tests/ai-trace-http.test.ts`、`tests/ai-trace-viewer.test.ts` 或现有 trace export 测试，覆盖 `ai_trace_log.js` / `detailRef` 导出中的 visibility 元数据。
- [x] 4.4 增加或保留回归断言：`searchExerciseResources.toModelVisibleSummary` 或对应模型可见摘要不包含 `totalMatches`、`returnedCount`、`truncated`。
- [x] 4.5 增加或保留回归断言：导出中出现 `traceSummary.totalMatches` 时，该字段或所属区块必须标注 debug-only / not model-visible。
- [x] 4.6 用 `rg` 检查本 change 未新增服务端关键词分流、业务 `toolName` 特判或修改生产 `/api/chat` 主链路。

## 5. Verification

- [x] 5.1 运行 `openspec validate clarify-ai-trace-visibility-boundaries --strict`。
- [x] 5.2 运行 `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts`，或说明项目中实际覆盖 trace viewer / export 的最窄测试文件。
- [x] 5.3 如果修改 TypeScript、React、API 或共享 trace 类型，运行 `npm run typecheck`。
- [x] 5.4 最终检查 `git diff --name-status`，确认没有删除或重命名不属于本 change 的文件。
