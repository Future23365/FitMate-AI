## Why

LangChain 迁移后，`/api/chat` 的主 Agent 失败会直接进入确定性安全 fallback，旧的 terminal failure finalizer 不再参与生产失败收口。这样在 `submitVisibleTrainingProposal` 参数校验失败、预算耗尽或结构化终态失败时，用户只能看到固定模板回复，无法得到基于当前失败事实的可恢复说明和下一步建议。

## What Changes

- 为当前 LangChain 生产主链恢复 terminal failure finalizer：主 Agent run 失败后，先尝试一次受限模型兜底回复。
- finalizer 只输出普通用户可见 `content` 和可选 `suggestedQuestions`，不输出 tool call、`visible_output`、训练事实、artifact 或旧 `AgentAction`。
- finalizer 输入只包含脱敏后的 LangChain run 失败摘要、稳定错误码、tool 执行失败摘要、schema issues、已验证事实摘要和用户请求摘要。
- finalizer 不属于主 Agent loop，不增加业务 tool 调用预算，不尝试继续完成原始训练方案生成。
- finalizer 不可用、超时、输出 shape 不合法或 provider 配置缺失时，继续降级到现有确定性 fallback。
- trace / response summary 必须区分主 Agent 失败、finalizer 兜底成功和确定性 fallback。

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-terminal-failure-finalizer`: 将 terminal failure finalizer 恢复到当前 LangChain `/api/chat` 生产失败收口链路，并定义 LangChain 失败摘要输入边界。
- `agent-text-chat-flow`: 当前生产 stream 失败收口需要先尝试 finalizer，finalizer 成功时投影普通 `content` / `suggested_questions` / `done`。

## Impact

- 影响 `/api/chat` LangChain production service、LangChain response adapter、finalizer 模型输入 / 输出 shape、trace 摘要和相关测试。
- 不新增业务 tool，不修改训练方案 validator 的事实边界，不改变 visible output 渲染和持久化规则。
- 涉及 AI 编排和模型可见输入合同，需要按 `docs/llm-prompt-guidance.md` 分层：runtime 提供失败事实，finalizer prompt 引导失败解释，Zod schema 校验输出 shape，response adapter 只投影白名单事件。
