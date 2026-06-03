## 1. 根因与边界复核

- [x] 1.1 复核 `codex_logs/ai_trace_log.js` 中“你能干什么”失败链路，确认失败发生在 Planner action / Action Validator / repair budget，而不是 tool 执行或数据库。
- [x] 1.2 复核 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 不注册业务 tool、不改 core 主循环、不加关键词分流。
- [x] 1.3 复核现有 `externalize-agent-llm-prompts` prompt 入口，确认实现落在 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`。

## 2. Prompt 合同实现

- [x] 2.1 将默认 Agent LLM system prompt 改为中文合同，覆盖 JSON-only、三类 `AgentAction`、普通问答、能力说明、空 `tools`、`tool_call` 条件、`ask_user` 条件、repair 反馈和安全边界。
- [x] 2.2 更新 prompt version，保证 trace、测试和后续 review 能区分新旧 prompt。
- [x] 2.3 确认 prompt 不包含具体业务 toolName、动作库查询、训练生成、保存 artifact、用户记忆或服务端关键词分流规则。

## 3. 生产文本聊天错误投影

- [x] 3.1 收窄 `agent-text-chat-service` 中 empty registry unsupported fallback 的用户可见文案，使其只表达“需要当前未接入工具，无法直接执行”的安全边界。
- [x] 3.2 确认基础问答正常路径只消费模型合法 `final_answer.content`，服务端不根据用户原文生成“你能干什么”固定回复。
- [x] 3.3 保留内部错误 code、details、traceEvents 和 finalDecision 诊断，不把 runtime / validator / provider 原文输出到用户气泡。

## 4. 测试覆盖

- [x] 4.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖中文 prompt、空 `tools` 禁止 `tool_call`、普通问答使用 `final_answer`、能力说明边界、repair 行为和无业务 toolName。
- [x] 4.2 更新 `tests/agent-core/adapter-llm-planner.test.ts`，确认 DeepSeek request system message 来自新 prompt，并同步 prompt version / 文案断言。
- [x] 4.3 更新 `tests/chat-service.test.ts`，覆盖“你能干什么”类基础问答由合法 `final_answer` 输出 `content + done`。
- [x] 4.4 更新 `tests/chat-service.test.ts`，覆盖空 registry 下重复 `tool_call` 仍不泄漏内部错误，但输出收窄后的安全边界文案而非固定训练计划业务回答。
- [x] 4.5 运行或更新 `tests/agent-core/architecture-boundary.test.ts`，证明 `/api/chat` 没有业务 tool 注册、fixture tool、旧链路或用户文本关键词分流回流。

## 5. 文档同步

- [x] 5.1 更新 `docs/agent-tool-orchestrator-design.md`，记录基础文本问答由模型 `final_answer` 决定，服务端 fallback 只做安全错误边界。
- [x] 5.2 在 `docs/方案变更历史/` 生成本次方案变更文档，时间使用上海时区精确到秒。
- [x] 5.3 在 `docs/项目演变历程.md` 末尾追加本次变更摘要。

## 6. 验证与收尾

- [x] 6.1 运行 `openspec validate stabilize-agent-text-chat-basic-final-answer --strict`。
- [x] 6.2 运行相关自动化测试：prompt 配置、adapter、chat service、architecture boundary。
- [x] 6.3 修改 TypeScript / API / AI 编排后运行 `npm run typecheck`。
- [x] 6.4 检查最终 diff，确认未混入既有 `openspec/changes/improve-agent-llm-trace-debugger/` 或无关改动。
- [x] 6.5 提交本次变更，commit message 使用中文。
