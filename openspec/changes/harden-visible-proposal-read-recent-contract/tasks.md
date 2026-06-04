## 1. 证据与边界确认

- [x] 1.1 运行 `git status --short`，确认实现前工作区状态，隔离无关改动。
- [x] 1.2 读取 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`，确认原始失败 action、模型可见 manifest、examples、metadata 和 repair observation。
- [x] 1.3 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不触碰禁止模块。
- [x] 1.4 读取 `inspectVisibleTrainingProposals` 的 input schema、examples、model observation、user projection 和相关 tests，确认完整产生方和消费方。

## 2. Tool 输入合同修复

- [x] 2.1 将 `inspectVisibleTrainingProposals(operation = "read_recent")` input schema 改成 JSON Schema 可见的合法 union 分支，分别表达 `factRef` required 和 `messageId` required。
- [x] 2.2 保留 runtime 执行前校验，确保缺少 `factRef` / `messageId` 的 `read_recent` 在 handler 前被拒绝，且不读取 fact store。
- [x] 2.3 更新 `description`、`whenToUse`、`whenNotToUse` 和 schema description，使用中文说明 `read_recent` 引用必须来自当前 run 可见真实事实索引或 metadata。
- [x] 2.4 更新 examples，删除 `{ operation: "read_recent" }` 这类无效示例，不引入可被照抄的占位 `factRef` / `messageId`。

## 3. Repair feedback 修复

- [x] 3.1 更新 `invalid_tool_input` 错误构造或 validator details，安全暴露字段路径、失败原因和可恢复建议。
- [x] 3.2 更新 invalid action observation 投影，确保下一轮 Planner 能看到缺少 `factRef` / `messageId` 的中文 repair feedback。
- [x] 3.3 确认 repair feedback 不泄漏 handler payload、数据库完整输出、secret、stack trace 或用户不可见事实。

## 4. 回归测试

- [x] 4.1 更新 `tests/agent-core/tool-registry-manifest.test.ts`，断言 `read_recent` schema 暴露 `factRef` required 和 `messageId` required 分支，examples 不包含无引用 `read_recent`。
- [x] 4.2 更新 `tests/agent-core/planner-validator.test.ts` 或等价 validator 测试，覆盖缺引用 `read_recent` 返回 `invalid_tool_input`，并包含字段级 repair details。
- [x] 4.3 更新 runtime 或 chat replay 相关测试，覆盖原始失败形态和一个等价变体，证明非法 `read_recent` 不执行 handler，合法引用仍可继续读取事实。
- [x] 4.4 更新模型可见描述语言相关断言，确认新增描述性自然语言默认中文，技术字段名保持英文原样。
- [x] 4.5 运行 architecture scan 或相关测试，确认没有新增服务端关键词、正则、同义词、固定短语路由、业务 `toolName` 特判或 `/api/chat` 分流。

## 5. 验证与收口

- [x] 5.1 运行 `openspec validate harden-visible-proposal-read-recent-contract --strict`。
- [x] 5.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 5.3 运行 `npm test -- tests/agent-core/planner-validator.test.ts` 或最窄等价 validator 测试。
- [x] 5.4 运行与 runtime/chat replay 改动相关的最窄测试，例如 `npm test -- tests/chat-service.test.ts` 或具体文件。
- [x] 5.5 如修改 TypeScript、schema、AI 编排或共享业务逻辑，运行 `npm run typecheck`。
- [x] 5.6 最终检查 diff，确认只包含本 change 范围内的 OpenSpec、tool 合同、repair feedback 和测试改动。
