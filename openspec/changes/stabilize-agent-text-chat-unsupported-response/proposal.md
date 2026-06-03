## Why

当前生产 `/api/chat` 文本聊天阶段使用空 `ToolRegistry`。当用户请求“生成计划”等当前阶段尚未接入的业务能力时，模型可能返回 `tool_call`，runtime 会因 unknown tool 或 repair budget 失败收口，前端随后显示类似 `Agent runtime reached the invalid action repair limit.` 的服务端内部错误。

用户可见聊天不应展示任何服务端错误、validator 名称、runtime budget 或内部工具合同信息。对于当前不支持的 tool 能力，系统应直接给出安全的助手文本回复，说明目前暂不支持该功能，并引导用户继续提出当前可回答的问题。

## What Changes

- 新增生产文本聊天的用户可见错误边界：NDJSON 中的 `error` 事件或服务端 `ToolError.message` 不得直接渲染成聊天气泡中的用户可见文案。
- 对空 registry、unknown tool、unsupported tool、tool call 不可执行、invalid action repair limit 等“能力不支持或不可执行”场景，后端 Response Renderer 或聊天接入层 MUST 投影为普通 `content` 回复和可选 `assistant_suggestions`，而不是原样输出内部错误。
- 前端聊天消费层 MUST 忽略或安全处理服务端 `error` 事件中的内部 message，不得把服务端错误原文写入 assistant message。
- 保留结构化错误 code、details、trace 和测试诊断能力，便于开发排查；但这些信息只允许进入内部日志、trace 或测试断言，不得成为用户可见文本。
- 保持当前阶段空 `ToolRegistry` 边界，不注册动作库、训练生成、artifact 保存、用户记忆或任何业务 tool。
- 禁止通过服务端关键词、正则、同义词表或自然语言模板分流来判断用户是否想生成计划；unsupported fallback 只基于确定性 runtime / registry / action validation 错误分类。

## Capabilities

### New Capabilities

- `agent-text-chat-user-error-boundary`: 定义生产文本聊天阶段的用户可见错误投影、unsupported tool fallback、前端错误事件消费和内部诊断保留边界。

### Modified Capabilities

- 无。本 change 为当前未归档的 production text chat 阶段补充独立用户可见错误边界，不修改既有业务 tool、训练生成、动作检索或 artifact 保存能力。

## Impact

- 可能影响后端：`lib/server/chat/agent-text-chat-service.ts`、`lib/server/agent-core/response-renderer.ts`、`lib/server/agent-core/redaction.ts` 或等价错误投影 helper。
- 可能影响前端：`features/chat/api/chat-client.ts`、`features/chat/hooks/use-chat-controller.ts` 的 `error` 事件处理和 assistant message 投影逻辑。
- 可能影响测试：`tests/chat-service.test.ts`、`tests/agent-core/executor-runtime-renderer.test.ts`、`tests/chat-client.test.ts`、`tests/features/chat/use-chat-controller*.test.*`、`tests/agent-core/architecture-boundary.test.ts`。
- 不影响 Prisma Schema、数据库迁移、真实业务 tool 注册、训练计划生成规则、动作选择规则、权限模型或 dev server 启动方式。
