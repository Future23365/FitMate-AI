## 1. 合同与边界

- [x] 1.1 使用抽象层级门禁确认方案不新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 1.2 运行 `openspec validate repair-structured-final-response-before-terminal-failure --strict`，确认 proposal / design / specs / tasks 合同有效。

## 2. Runtime Repair 实现

- [x] 2.1 新增结构化最终回答 repair helper，输入当前消息、生成消息、工具目录、已验证工具事实和 schema 错误，输出修复后的 LangChain run 结果或失败。
- [x] 2.2 在 `runLangChainAgentRuntime()` 的 `fitmate_final_response` 解析失败分支接入一次 repair，repair 成功走正常成功结果，repair 失败才返回 `structured_output_validation_failed`。
- [x] 2.3 确保 repair 不在 runtime 中新增用户原文关键词判断、不生成业务 plan、不改写 provider tool call、不写具体业务 `toolName` 语义分支。
- [x] 2.4 确保 trace summary 能保留 repair 过程中的 model call、provider tool call 和 tool execution 摘要。

## 3. Terminal Failure 收窄

- [x] 3.1 收窄 `buildLangChainTerminalFailureFinalizerSystemPrompt()`，移除“把问题改成普通动作解释/区别说明”方向。
- [x] 3.2 确保 finalizer 的 `suggestedQuestions` 只能围绕原始健身任务补条件或继续原任务，不包含系统重试、运维错误或无关任务。

## 4. 回归测试

- [x] 4.1 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖结构化最终回答缺失时先 repair，repair 成功返回正常结果。
- [x] 4.2 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖 repair 失败后才返回 `structured_output_validation_failed` 并进入 terminal failure 路径。
- [x] 4.3 更新 `tests/langchain-agent-runtime/terminal-failure-finalizer.test.ts`，断言 finalizer prompt 不再允许建议用户换成无关动作解释或区别说明。
- [x] 4.4 增加等价语义回归样例，覆盖 plan/routine 请求在动作候选事实足够时不应因为缺少首次结构化终态而直接 terminal failure。

## 5. 验证与收尾

- [x] 5.1 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-runtime/terminal-failure-finalizer.test.ts`。
- [x] 5.2 如修改模型可见 prompt 或合同门禁相关文本，运行 `npm test -- tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [x] 5.3 运行 `npm run typecheck`。
- [x] 5.4 检查最终 diff，确认未混入 `features/chat/components/chat-page.tsx` 的既有未提交改动，且没有新增高风险删除或无关重构。
