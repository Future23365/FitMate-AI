## Why

后续新增业务 Agent tool 或调整 Agent prompt / model input 时，如果只靠人工记忆，很容易漏掉通用编排器的固定使用方式、`AgentAction` 输出格式、tool 调用边界、resource / policy / grounding 规则，导致 prompt 改动把模型引向错误的调用方式或成功收口条件。

本 change 要先建立一个只针对 Agent prompt 合同治理的 Codex Skill，作为后续修改 `prompt / model input / manifest / schema summary / examples / repair feedback` 的固定入口，降低 prompt 改错、漏写固定编排规则和把业务规则混入通用 prompt 的风险。

## What Changes

- 新增 `agent-prompt-contract-governance` 能力规格，定义 Agent prompt / model input 变更的触发范围、preflight、固定合同、禁止项和验证要求。
- 后续实现一个独立 Codex Skill，专门治理 Agent prompt 合同，不替代 `agent-tool-change-governance`。
- 要求后续改 Agent prompt、tool manifest、schema summary、examples、repair feedback、context package 或 observations 时，先区分“通用 Agent 编排规则”和“单个业务 tool 的模型可见说明”。
- 要求 Skill 固化模型必须知道的通用规则：只能输出受控 `AgentAction`，只能调用 `ToolRegistry` 中注册的 tool，tool input 必须匹配 schema，final answer 必须基于 `satisfied=true` 的 tool result 或 consumable resource，diagnostic / failed / unsatisfied 结果不能支撑成功 final answer，write / high risk tool 必须经过 `Policy Guard` / confirmation。
- 要求后续新增业务 tool 时同步补充模型可见说明：何时使用、何时不用、input schema 关键字段、成功结果含义、失败/diagnostic 含义、resource 是否可消费、final answer 如何引用。
- 不修改当前 prompt 内容，不新增真实业务 tool，不接入生产聊天链路，不改变 Agent runtime 行为。

## Capabilities

### New Capabilities

- `agent-prompt-contract-governance`: 规范 Agent prompt / model input / manifest / schema summary / examples / repair feedback 等模型可见合同的协作流程、固定规则、禁止项、验证项和 Codex Skill 入口。

### Modified Capabilities

- 无。

## Impact

- 预计影响 `.codex/skills/` 或项目内等效 Skill 目录。
- 预计影响 README 或相关开发文档，用于说明该 Skill 的使用场景。
- 预计影响 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录 prompt 合同治理入口的引入。
- 预计影响 OpenSpec / 测试任务说明，要求后续 prompt 相关 change 包含 prompt config 测试、schema summary / manifest 测试、Agent runtime / grounding 测试或无法运行原因。
- 不影响 API 契约、数据库结构、现有 prompt 运行时、现有模型输出结构、用户可见聊天流程或真实业务 tool 行为。
