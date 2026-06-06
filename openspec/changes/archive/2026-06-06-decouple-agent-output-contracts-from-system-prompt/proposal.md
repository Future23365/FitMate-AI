## Why

当前生产 Agent 的 `system prompt` 同时承担通用 `AgentAction` 合同、`visibleTrainingProposal` 业务输出规则、`routine` / `plan` section 规则、引用连续性规则和不可执行请求兜底说明。继续把业务实例和失败路径补进通用 prompt，会让模型输入越来越密，也让后续维护者难以判断规则应该放在通用 prompt、output schema、tool manifest、observation 还是 repair feedback。

本 change 目标是把模型可见合同重新分层：通用 system prompt 只保留跨能力的执行合同和安全边界，结构化业务输出能力通过 `outputContracts` / schema summary 暴露，失败或不可执行路径通过通用 action 语义和 deterministic fallback 边界表达。

## What Changes

- 收敛默认 Agent LLM system prompt：保留 `AgentAction` 输出格式、`tool_call` / `final_answer` / `ask_user` 行为边界、`usedRefs` grounding、policy/resource/validator 不可绕过、医疗安全和未执行能力不得承诺等通用规则。
- 新增模型可见 `actionContract` 输入层，用结构化字段字典、最小 JSON 形状、决策顺序和 few-shot 解释 `AgentAction`，避免默认 system prompt 继续写成后端接口文档。
- 新增模型可见 `outputContracts` 输入层，与 `tools`、`observations`、`toolResults` 并列进入 Planner user payload，用于承载 `visibleTrainingProposal` 等用户可见结构化输出能力的说明、schema summary、grounding 要求、examples 和可消费事实边界。
- 将 `visibleTrainingProposal`、`payload.kind = exercise_selection | routine | plan`、`warmup` / `training` / `stretch`、`prescription`、`schedule` 等业务输出规则，从通用 system prompt 迁移到 `outputContracts` 或对应可见输出合同测试中，并明确当前 `plan = one routine template + schedule`。
- 明确 failed tool result 的终态语义：failed / diagnostic 事实不能支撑成功 `final_answer`；如需解释失败或恢复，应优先使用 `ask_user`、继续合法 `tool_call`，或让 production terminal failure fallback / finalizer 收口。
- 集中不可执行请求的模型可见决策顺序：可直接回答则 `final_answer`；缺必要信息则 `ask_user`；需要未注册能力则不得 `tool_call` 或承诺已执行；已有事实不足则继续合法 tool、澄清或安全失败收口。
- 更新 prompt / model input / output contract / repair feedback 相关测试，断言合同结构、禁止项和边界，而不是依赖超长 system prompt 文案逐字存在。
- 不新增服务端关键词、正则、同义词表、自然语言模板路由、用户 phrasing 特判、固定 `toolName` 调用顺序或业务 `toolName` 语义分支。

## Capabilities

### New Capabilities

- `agent-visible-output-contracts`: 定义 Planner 可见的结构化用户输出能力合同，包括 output type、schema version、schema summary、grounding 要求、examples、失败/诊断边界，以及它与 system prompt、tool manifest、terminal output validator 的分工。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 system prompt 从业务输出细节承载者改为通用 Agent 执行合同入口，并要求生产模型 user payload 暴露 `outputContracts`。
- `agent-text-chat-user-error-boundary`: 细化 failed / diagnostic tool result、不可执行能力和 terminal failure 的用户可见收口边界，避免模型用成功 `final_answer` 解释未完成结果。
- `agent-prompt-contract-governance`: 增加 prompt / model input 变更时的规则分层要求，防止把业务输出实例继续升格为通用 system prompt 规则。

## Impact

- 预计影响：
  - `lib/server/config/agent-llm-prompt-config.ts`
  - 新增或调整 `lib/server/config/*visible-output-contract*` 等集中配置模块
  - `lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts` 或等价 Planner model input builder
  - `lib/server/visible-training-proposals/*` 中可复用 schema summary / examples / output contract 配置
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - prompt / model input / terminal grounding / chat fallback 相关测试
- 不影响：
  - `/api/chat` 外部 request schema 和 NDJSON stream 协议
  - `ToolRegistry` 注册范围
  - 业务 tool handler、数据库查询、Prisma schema、ResourceStore、Policy Guard、Resource Contract Validator、terminal output validator、Response Renderer
  - 训练结果 validator 的严格性、权限隔离或保存事实链路
