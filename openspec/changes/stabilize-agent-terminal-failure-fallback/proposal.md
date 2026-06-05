## Why

当前 production `/api/chat` 在 Agent terminal 校验失败并耗尽 repair budget 后，会把用户可见响应收口为 `error` 事件，前端最终展示“聊天生成失败，请稍后重试。”。这类文案对用户不可恢复，也会把“模型输出未通过合同校验”和“服务端/模型服务不可用”混在一起。

最新 trace 中，Planner 已成功读取上一轮 `visibleTrainingProposal` 并查询到可消费 training 动作事实，但最终输出 `payload.kind = "routine"` 时只包含 `training` section，并把 warmup / stretch 写进正文建议，违反 `routine` 必须由结构化 `warmup`、`training`、`stretch` 动作事实支撑的合同。系统应保留该确定性校验，但用户可见收口应变成安全、可恢复的助手回复，而不是死路错误。

## What Changes

- 为 production text chat 增加统一的用户可见 terminal failure 投影：对 repair budget 耗尽、terminal reference invalid、visible output validation failure、budget / timeout / provider 类失败按稳定错误事实输出安全中文 `content` 和必要的 `assistant_suggestions`，避免用户看到“聊天生成失败，请稍后重试。”。
- 保留 trace / test / dev log 中的原始错误 code、details、失败阶段和 validation 诊断；用户可见文本不得原样展示内部 error message、validator 文案、provider 原文或 stack。
- 对 `visibleTrainingProposal` 的 routine / plan section 覆盖失败，补强模型可见 repair / observation 合同：诊断应表达缺失 section、当前可见 section 覆盖和可恢复方向，使模型可以继续查询缺失 section、输出当前事实可支撑结构、澄清或安全失败收口。
- 失败收口必须基于 runtime status、terminal error code、validation details、repair budget 和 registry/tool capability 等确定性事实，不得基于用户原文关键词、正则、同义词表、短句模板或具体 phrasing 做服务端语义分流。
- 本 change 不新增业务 tool，不注册 fixture tool，不恢复旧 AgentOrchestrator / assistant_action / intent_resolved 链路，不让 Response Renderer 生成未经校验的训练卡片。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-text-chat-user-error-boundary`: 扩展用户可见错误边界，使 terminal failure / repair exhausted 类失败投影为可恢复助手回复，而不是通用“聊天生成失败”死路文案。
- `agent-text-chat-flow`: 调整生产 NDJSON 失败收口合同，允许特定 terminal failure 由 production adapter 输出安全 `content` / `assistant_suggestions` / `done`，同时保留默认 renderer 的脱敏错误边界。
- `visible-training-proposal-validation`: 明确 routine / plan 缺少 `warmup`、`training` 或 `stretch` section 时的结构化诊断和 repair 可见信息要求。
- `agent-prompt-contract-governance`: 明确涉及 terminal output validation / repair feedback 的 prompt 或 model input 变更必须把可恢复方向表达给模型，并禁止把具体 trace 短句升格为通用规则。

## Impact

- 预计影响模块：`lib/server/chat/agent-text-chat-service.ts`、`lib/server/agent-core/response-renderer.ts`、`features/chat/api/chat-client.ts`、`features/chat/hooks/use-chat-controller.ts`、`lib/server/visible-training-proposals/*`、Agent prompt / model input / observation / repair feedback 相关配置和测试。
- 预计测试：chat service terminal failure 投影测试、client error mapping 测试、visibleTrainingProposal validator / repair feedback 测试、prompt / manifest / observation 合同测试、architecture boundary scan、`openspec validate stabilize-agent-terminal-failure-fallback --strict`。
- 不涉及数据库 schema、Prisma migration、权限模型、真实业务 tool 注册、旧链路恢复或浏览器 UI 验证。
