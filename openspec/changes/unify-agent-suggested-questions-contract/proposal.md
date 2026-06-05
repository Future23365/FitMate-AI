## Why

当前聊天链路里“建议提问 / 建议回复”相关字段分散在 `final_answer.assistantSuggestions`、`ask_user.suggestions`、`assistant_suggestions.suggestions`、前端 `suggestedReplies` 和历史 `suggestedQuestions` 之间，语义不一致，导致后续很难判断某个字段到底是澄清选项、下一步建议，还是旧兼容字段。

用户端真实需求很简单：展示一组按钮，按钮文字就是用户点击后自动发送的下一轮提问文本。需要把这项能力收敛成统一的 Agent 输出合同，并在全局 Agent prompt 中作为通用可选字段表达，而不是继续扩散多套命名。

## What Changes

- 将用户可见“建议提问”统一定义为 `suggestedQuestions?: string[]`：每一项都是可直接作为下一轮用户消息发送的完整自然语言文本。
- 收敛 Agent 终态字段：`final_answer` 和 `ask_user` 都使用同一个 `suggestedQuestions` 字段表达建议提问，不再继续新增 `assistantSuggestions`、`suggestions` 或 `suggestedReplies` 变体。
- 将 `suggestedQuestions` 设计为全局可选字段，而不是所有 AI 回复的强制字段；模型只在自然存在可恢复下一步、澄清选项或后续提问时输出。
- 在默认 Agent LLM prompt 中增加全局合同：最多 3 条、每条必须是用户口吻、必须可直接发送、不得重复正文、不得承诺未注册能力或未执行结果。
- 保留前端交互形态：按钮展示文本，点击后按普通用户消息发送该文本；前端不根据按钮文案推断业务语义。
- 不做旧建议协议迁移：实现阶段直接移除或忽略 `assistantSuggestions`、`suggestedReplies`、`assistant_suggestions` 和 `suggestions` 等旧协议，不把旧字段转换成新字段。
- 不新增服务端关键词、正则、同义词或短句模板来决定是否生成建议提问；是否给出建议由模型基于可见上下文和全局 prompt 自主决定，服务端只做结构和安全边界校验。
- 本 change 先只建立 OpenSpec 文档，不修改 TypeScript、prompt、runtime、renderer 或前端代码。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 Agent LLM prompt 必须把 `suggestedQuestions` 作为通用 AgentAction 可选字段表达，并说明输出条件、条数、口吻和能力边界。
- `agent-text-chat-flow`: `AgentAction` 终态、Response Renderer、NDJSON stream 和前端消息投影需要围绕 `suggestedQuestions` 形成统一建议提问合同。
- `assistant-suggestions`: 用户可见建议的主合同从复杂 `assistantSuggestions` 对象收敛为简单 `suggestedQuestions: string[]`，复杂对象和旧字段不进入新链路。
- `api-layer-boundaries`: `/api/chat` 仍输出统一建议事件，但新实现路径只以 `suggestedQuestions` 作为服务端和前端之间的建议提问语义。

## Impact

- 影响模型可见 prompt / output schema：
  - `lib/server/config/agent-llm-prompt-config.ts`
  - `lib/server/agent-core/contracts.ts`
- 影响生产聊天响应投影：
  - `lib/server/agent-core/response-renderer.ts`
  - `lib/server/chat/agent-text-chat-service.ts`
- 影响前端流解析和消息状态：
  - `features/chat/api/chat-client.ts`
  - `features/chat/hooks/use-chat-controller.ts`
  - `features/chat/types.ts`
  - `features/chat/components/chat-page.tsx`
- 影响聊天历史读写新字段：
  - `features/chat/lib/chat-history.ts`
  - `lib/server/chat/chat-history-service.ts`
- 影响测试：
  - AgentAction schema / renderer 测试
  - chat service NDJSON 测试
  - chat client / controller 状态测试
  - prompt 配置测试
  - 旧字段不参与新链路的残留扫描测试
- 不影响：
  - 业务 tool handler
  - ResourceStore、Policy Guard、Executor
  - 数据库事实来源和训练方案校验规则
  - 前端按钮的基础交互形态
