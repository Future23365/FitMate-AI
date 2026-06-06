## Why

当前生产 Planner 的模型输入已经完成了部分 ToolManifest 瘦身，但稳定协议、当前 run 事实、output contract、repair 反馈和 observation 投影仍混在同一轮模型上下文里。长上下文下模型仍可能把协议当作普通数据、把 repair 规则用于正常规划，或从模型可见示例和 observation 中学习到不完整的 action 形态。

本 change 要把模型可见合同继续分层：正常规划时只暴露稳定协议和当前事实，校验失败时才进入独立 repair 语境，同时清理旁路合同里的半截 action 示例和过重 observation。

## What Changes

- 将 Planner 模型请求拆分为稳定协议层和当前事实层：`system` 或等价高优先级内容承载 AgentAction 合同、glossary、Planner policy 和 output contract 摘要；`user` payload 只承载当前 `run`、`step`、`tools`、`observations` 和 `toolResults`。
- 为校验失败后的下一轮 Planner 调用引入显式 repair 语境；首轮正常规划不携带 repair-only 指令，只有存在上一轮非法 action 和 validator details 时才追加 repair prompt / repair payload。
- 统一模型可见 output contract 示例形态：字段名为 `expectedAction` 时必须是完整 `AgentAction` object；自然语言决策说明必须改名为 `expectedDecision` 或等价非 action 字段。
- 收紧 `inspectVisibleTrainingProposals(operation = "read_recent")` 的模型可见 `ref` 来源说明，避免把 runtime 的 diagnostic resource 校验实现细节暴露成可选输入来源。
- 瘦身 production tool 的 `toModelObservation` / compressed observation 投影：保留事实等级、可消费性、缺口字段、诊断 code 和必要 grounding 摘要，移除重复全局禁止项、长篇下一步说明和固定 tool flow 暗示。
- 不新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支，也不让服务端替模型改写用户意图或 action。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 增加 Planner 模型输入分层、稳定协议和 runtime context 的边界要求，并约束 output contract examples 的 action 形态。
- `agent-contract-repair-loop`: 增加 repair-only prompt / repair payload 与正常 planning prompt 分离的要求。
- `agent-tool-production-hardening`: 增加模型可见 observation 投影瘦身和结构化事实等级要求。
- `visible-proposal-reference-tool`: 收紧 `read_recent.ref.value` 的模型可见来源边界，只允许复制本轮 `list_recent` 返回的真实 `factRef` / `messageId`。

## Impact

- 影响模型请求构造：`DeepSeekModelAdapter` 或等价 adapter 的 message / payload builder。
- 影响 prompt 配置：`lib/server/config/agent-llm-prompt-config.ts`、visible output contract 配置和相关摘要 helper。
- 影响 runtime repair 输入：`agent-core` 的 invalid action observation / repair context 生成和 `PlannerPort` 输入形态。
- 影响 production tool 模型可见投影：`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 的 schema description、examples 或 `toModelObservation`。
- 影响测试：prompt config、adapter request body、repair loop、manifest hardening、tool registry manifest、business tool observation 和 architecture boundary 测试。
- 不影响 `/api/chat` 外部 API、前端 NDJSON 事件合同、数据库 schema、真实 tool handler 业务查询逻辑或权限模型。
