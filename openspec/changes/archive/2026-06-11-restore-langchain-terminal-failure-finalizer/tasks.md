## 1. OpenSpec 和边界确认

- [x] 1.1 运行 `openspec validate restore-langchain-terminal-failure-finalizer --strict`，确认 proposal / design / specs / tasks 可被 OpenSpec 接受。
- [x] 1.2 按 `agent-tool-change-governance` 确认本 change 是 production 接入变更，不新增业务 tool、不修改 tool schema、不恢复旧 Agent core。
- [x] 1.3 按 `agent-prompt-contract-governance` 对照 `docs/llm-prompt-guidance.md`，确认 finalizer 模型输入属于 Runtime Context，finalizer prompt 属于失败解释策略，输出 shape 由 Zod 校验。

## 2. LangChain finalizer 实现

- [x] 2.1 新增 LangChain terminal failure finalizer 模块，定义输入摘要、输出 schema、skip / degraded reason、trace summary 和受限模型调用。
- [x] 2.2 在集中配置中新增 finalizer 开关、超时、maxTokens、suggestedQuestions 限额和 trace 裁剪预算，route 和业务模块不得局部硬编码。
- [x] 2.3 在 `/api/chat` LangChain production service 中接入 finalizer：主 Agent 失败后先尝试 finalizer，成功则投影 finalizer 事件，失败则保留现有确定性 fallback。
- [x] 2.4 更新 response adapter，使其支持 `terminal_failure_finalizer` projection type，并确保 finalizer 不输出 `visible_output`、tool event 或旧协议事件。
- [x] 2.5 更新 trace summary，记录 finalizer 成功、跳过或降级原因，同时保留主 Agent 原始 failure code。

## 3. 模型可见合同和安全边界

- [x] 3.1 finalizer system prompt 使用中文说明失败收口职责，不暴露 tool manifest，不允许继续执行原任务，不允许声称训练卡片已生成或保存。
- [x] 3.2 finalizer 输入 builder 只使用脱敏失败摘要、`schemaIssues` 和可安全告知用户的事实摘要，不传完整 raw tool input、完整 prompt、secret 或跨用户数据。
- [x] 3.3 finalizer 输出校验只检查 JSON shape、非空 `content`、最多 3 条 `suggestedQuestions` 和长度边界，不做中文短语白名单语义扫描。

## 4. 测试和验证

- [x] 4.1 新增或更新 finalizer 单元测试，覆盖成功输出、输出 shape 不合法、provider/config 不可用、schema issue 输入脱敏和确定性 fallback 降级。
- [x] 4.2 更新 response adapter 测试，覆盖 `terminal_failure_finalizer` projection、事件白名单和不输出 `visible_output`。
- [x] 4.3 更新 `/api/chat` 或 LangChain service 测试，覆盖主 Agent `budget_exhausted` / `tool_schema_invalid` 后 finalizer 成功，以及 finalizer 失败后固定 fallback。
- [x] 4.4 运行相关测试：`npm test -- tests/langchain-agent-runtime/response-adapter.test.ts tests/langchain-agent-runtime/runtime.test.ts tests/api-routes.test.ts`，并按新增测试文件补充最窄测试命令。
- [x] 4.5 修改 TypeScript / AI 编排后运行 `npm run typecheck`，如无法运行需说明原因。

## 5. 文档和收尾

- [x] 5.1 更新 `docs/architecture.md` 中 LangChain 失败收口说明，去掉“旧 finalizer 不再是生产主链必经步骤”的过时表述。
- [x] 5.2 如本次属于核心链路修正，在 `docs/方案变更历史/` 新增一份上海时间文档，并在 `docs/项目演变历程.md` 末尾追加简要记录。
- [x] 5.3 最终 diff 检查，确认没有服务端关键词分流、旧 AgentAction JSON 恢复、未校验 visible output 投影或高风险删除。
