# LangChain DeepSeek Tool Calling 主链迁移

时间：2026-06-11 12:45:34 CST

## 原方案为什么不合适

旧生产聊天链路围绕自研 `agent-core`、`PlannerPort`、`ToolRegistry`、`DeepSeekModelAdapter` 和自定义 `AgentAction` JSON 协议运行。这个方案能提供强控制边界，但后续每次修改 prompt、tool、resource、renderer 和 trace 都容易互相牵连，模型也必须手写 `{ type: "tool_call" | "final_answer" | "ask_user" }` 形态的项目私有 action。

继续只替换模型 adapter 会保留旧执行循环的复杂度，也不能真正使用 DeepSeek native `tool_calls`。

## 调整思路

生产 `/api/chat` 改为：

```txt
/api/chat
  -> LangChain Agent Runtime
  -> @langchain/deepseek ChatDeepSeek
  -> DeepSeek native tool_calls
  -> LangChain tool wrappers
  -> production response adapter
  -> NDJSON 白名单事件
```

模型负责自然语言理解和 tool calling 决策；服务端继续负责认证、权限、Zod 校验、数据库动作事实校验、结构化输出 validator、trace、NDJSON 投影和事实持久化边界。

## 关键改动

- 新增 `lib/server/langchain-agent/**`，包含 DeepSeek model factory、prompt builder、runtime、tool wrapper、production tool catalog 和 response adapter。
- 新增 `lib/server/visible-outputs/**`，把结构化可见输出 envelope、validator registry 和 renderer registry 从旧 `agent-core` 类型中抽出。
- 将生产只读能力迁移为 LangChain tools：`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources`。
- 新增 `submitVisibleTrainingProposal` finalization tool，用于提交训练方案、routine、plan 等结构化终态；只有通过服务端 validator 和数据库动作事实校验后，才会进入 `visible_output`。
- `/api/chat` 生产入口切到 `createLangChainAgentTextChatResponse()`，保持认证、请求校验、conversation hydration、NDJSON 外部事件和 trace。
- trace 改为记录 LangChain run、model request / response 摘要、DeepSeek `tool_calls`、tool wrapper execution、结构化 validator 和 response projection 摘要。

## 验证方式

- `npm test -- tests/langchain-agent-runtime tests/langchain-agent-tools tests/api-routes.test.ts tests/visible-training-proposal-validator.test.ts tests/visible-training-proposal-renderer.test.ts tests/visible-training-proposal-fact-store.test.ts`
- `npm run typecheck`

当前相关测试覆盖 14 个文件、83 个用例。

## 当前保留风险

- 旧 `lib/server/agent-core/**`、`lib/server/agent-planners/**`、旧测试和旧 manual runner 仍未删除；删除这些文件会触发高风险删除规则，需要单独审查确认。
- 新 LangChain `/api/chat` 主链尚未把 provider usage 写入 `AiTokenUsageSummary`，后台 token 汇总不能被当成本轮 LangChain 调用的完整事实来源。
- dev trace view 仍需要继续按 LangChain trace 字段做展示层迁移。
