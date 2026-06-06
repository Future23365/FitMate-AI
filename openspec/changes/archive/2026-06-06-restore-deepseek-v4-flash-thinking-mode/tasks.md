## 1. 实现前核查与治理边界

- [x] 1.1 读取当前 `DeepSeekModelAdapter`、`createAgentTextChatRunInput`、`chatRequestSchema`、trace projection 和基础黑盒 runner，确认 `thinkingEnabled` 当前只进入 metadata、没有进入 provider request。
- [x] 1.2 用 `git show` 或等价方式核对旧 `/api/chat` 链路中 `deepseek-v4-flash`、`thinking.type` 和 `reasoning_content` 的历史实现，作为本次恢复范围证据。
- [x] 1.3 按 `agent-prompt-contract-governance` 检查本次属于 model input / provider request contract 恢复，不修改业务 tool manifest、业务 tool handler、AgentAction schema 或服务端语义分流。
- [x] 1.4 运行 `openspec validate restore-deepseek-v4-flash-thinking-mode --strict`，确认 proposal、design、spec delta 和 tasks 可进入 apply。

## 2. 集中配置与模型默认值

- [x] 2.1 在 `lib/server/config/` 的 Agent LLM 配置中新增 DeepSeek 默认模型配置，默认值为 `deepseek-v4-flash`，并继续允许 `DEEPSEEK_MODEL` 覆盖最终 model。
- [x] 2.2 在集中配置中新增 Thinking Mode 配置，包含默认 `reasoning_effort = "high"` 和必要中文意图注释。
- [x] 2.3 更新配置导出和相关测试 import，确保 `DeepSeekModelAdapter` 不在配置之外重复硬编码生产默认模型名或 reasoning effort。
- [x] 2.4 确认 finalizer 模型调用是否沿用或显式禁用 Thinking Mode；如果选择不同策略，必须在设计说明、配置注释和测试中写清原因。

## 3. DeepSeekAdapter 请求与响应映射

- [x] 3.1 扩展 `DeepSeekModelAdapter` 请求体类型，支持 `thinking.type = "enabled" | "disabled"` 和 `reasoning_effort`。
- [x] 3.2 将 `PlannerInput.run.metadata.thinkingEnabled` 或等价受控 provider option 映射到 DeepSeek 请求体；`false` 时必须显式发送 `thinking.type = "disabled"`。
- [x] 3.3 保持 prompt、user payload、`response_format` 和内部 `AgentAction` JSON 输出合同不变，不接入 DeepSeek 原生 `tools/tool_calls`。
- [x] 3.4 扩展 DeepSeek 响应类型以识别 `reasoning_content`，但解析 `AgentAction` 时继续只使用正式 `content`。
- [x] 3.5 确保 `reasoning_content` 不进入用户可见 `content`、chat history assistant content、visible output payload 或 suggested questions。

## 4. Trace 与后续展示能力边界

- [x] 4.1 扩展模型 request trace envelope，记录最终 model、`thinking.type`、`reasoning_effort` 和请求是否启用 Thinking Mode。
- [x] 4.2 扩展模型 response trace envelope，记录是否收到 `reasoning_content`、长度、脱敏摘要或长文本引用，并与正式 `content` 区分。
- [x] 4.3 更新 `/dev/ai-traces` 展示和保存日志逻辑，使页面与导出文件能看到 thinking 配置和 reasoning 诊断摘要。
- [x] 4.4 保留后续 reasoning 展示能力的服务端边界，但本 change 不新增用户可见 reasoning stream event。

## 5. 测试

- [x] 5.1 更新 `tests/agent-core/adapter-llm-planner.test.ts` 或等价 adapter 测试，断言默认 model 为 `deepseek-v4-flash`，env / constructor override 仍可生效。
- [x] 5.2 增加 adapter 请求体测试，覆盖 `thinkingEnabled = true` 或默认开启时发送 `thinking.type = "enabled"` 和 `reasoning_effort = "high"`。
- [x] 5.3 增加 adapter 请求体测试，覆盖 `thinkingEnabled = false` 时显式发送 `thinking.type = "disabled"`。
- [x] 5.4 增加响应解析测试，覆盖响应包含 `reasoning_content` 时仍从正式 `content` 解析 `AgentAction`，并将 reasoning 只放入 trace 诊断。
- [x] 5.5 更新 trace / ai-trace-viewer 相关测试，覆盖 thinking 配置和 reasoning 诊断摘要展示或导出。
- [x] 5.6 更新基础黑盒 runner 或报告测试，确认请求体仍只发送首页公开字段，并继续包含 `thinkingEnabled`，不向客户端暴露 provider 专有字段。

## 6. 文档与验证

- [x] 6.1 如实现改变模型默认值、环境变量说明或 trace 字段，更新 README、`docs/llm-prompt-guidance.md` 或相关文档中的当前真实入口说明。
- [x] 6.2 本次属于重构遗漏能力恢复和模型请求合同修复，完成实现时在 `docs/方案变更历史/` 新增上海时间精确到秒的变更记录。
- [x] 6.3 如实现影响当前 Agent 主链或后续开发判断，在 `docs/项目演变历程.md` 末尾追加简要演进记录。
- [x] 6.4 运行 `openspec validate restore-deepseek-v4-flash-thinking-mode --strict`。
- [x] 6.5 运行相关自动化测试，例如 adapter、trace、chat-client / blackbox runner 请求合同测试。
- [x] 6.6 修改 TypeScript 后运行 `npm run typecheck`，并按改动范围补充 `npm test -- <相关测试文件>`。
- [x] 6.7 如需要真实模型验证，只通过显式手动命令运行基础 LLM 黑盒测试，并在报告中记录最终 model、thinking 配置、token usage 来源和失败排查摘要。
