## Why

当前 production `/api/chat` 在 Agent 内部 repair / terminal validation 次数耗尽后，部分失败仍会以 `error` 事件收口，前端对话体验被打断。用户需要的是：服务端继续坚持结构化校验和不展示无效结果，但在内部重试机会耗尽后，再让一个受限的失败收口模型调用生成自然、可继续对话的解释和建议，而不是直接抛给前端错误。

## What Changes

- 新增 Agent terminal failure finalizer：当主 Agent run 因可分类的内部校验失败、terminal reference 失败、visible output validation 失败或 repair budget 耗尽而终止时，production adapter MAY 额外调用一次受限 finalizer LLM。
- finalizer 不属于主 Agent repair，不允许调用 tool、不允许输出 `visibleOutputs`、不允许保存或声称已完成用户需求，只能生成用户可见解释和 `suggestedQuestions`。
- finalizer 输入只包含结构化、脱敏后的失败摘要、已验证事实摘要、未满足原因、可恢复方向和严格系统指令；不得把原始 stack、provider body、完整 tool output 或敏感 payload 暴露给模型。
- 当外部模型不可用、provider quota/rate limit/HTTP failure、模型配置缺失、网络失败或总超时已经表明无法可靠调用模型时，系统 MUST NOT 再调用 finalizer，必须使用确定性中文安全兜底。
- production `/api/chat` 对 finalizer 成功结果输出普通 `content` / `suggested_questions` / `done`，让前端继续按普通助手消息展示；finalizer 失败时降级为确定性安全回复。
- trace / replay / dev diagnostics 必须记录主 Agent 失败原因、是否进入 finalizer、finalizer 模型调用结果、降级原因和最终响应投影类型。
- 不降低任何服务端 validator、terminal output validator、ResourceStore、Policy Guard、Response Renderer 或权限隔离要求；无效训练结果仍不得渲染、保存或写入事实库。
- 不新增服务端关键词、正则、同义词表、用户 phrasing 特判、固定 `toolName` 调用顺序或业务 `toolName` 语义分支。

## Capabilities

### New Capabilities

- `agent-terminal-failure-finalizer`: 定义主 Agent repair 耗尽后的受限失败回复生成器、触发边界、模型输入合同、输出校验、确定性降级和禁止项。

### Modified Capabilities

- `agent-text-chat-user-error-boundary`: 将可分类的内部 Agent 校验失败从前端错误体验收敛为可继续对话的助手回复，并明确 provider 不可用时的确定性兜底。
- `agent-text-chat-flow`: 扩展 production NDJSON 失败收口合同，允许 finalizer 生成 `content` / `suggested_questions` / `done`，并记录该响应不是主 Agent 成功。
- `agent-llm-prompt-configuration`: 增加 terminal failure finalizer 的模型可见系统指令和输入摘要合同，描述性自然语言默认中文。
- `agent-runtime-configuration`: 为 finalizer 调用、超时、token 和启用边界提供集中配置，不把额外模型调用预算散落在业务 adapter 中。
- `ai-run-trace`: 记录 finalizer 触发、模型调用、输出校验、确定性降级和最终响应投影。
- `manual-llm-consistency-tests`: 将内部 repair 耗尽后的 finalizer 回复纳入黑盒可见合同，区分主任务完成、可恢复失败回复和服务不可用兜底。

## Impact

- 预计影响模块：
  - `lib/server/chat/agent-text-chat-service.ts`
  - `lib/server/agent-core/response-renderer.ts` 的 production adapter 消费边界
  - `lib/server/agent-planners/**` 或新增 finalizer model adapter 调用边界
  - `lib/server/config/**`
  - `lib/server/dev/ai-trace-*`
  - `features/chat/**` 或当前聊天客户端错误消费测试
- 预计测试：
  - chat service terminal failure finalizer tests
  - model input / prompt config snapshot tests
  - provider unavailable deterministic fallback tests
  - finalizer output schema validation tests
  - trace projection tests
  - architecture boundary scan
  - manual LLM consistency report contract tests
- 不涉及数据库 schema、Prisma migration、训练计划 validator 放宽、业务 tool handler 查询语义、前端卡片组件重写或旧聊天链路恢复。
