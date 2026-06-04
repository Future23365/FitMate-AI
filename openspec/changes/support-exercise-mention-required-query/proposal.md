## Why

当前 trace 暴露了一个动作查询能力缺口：用户明确说“包含俯卧撑、深蹲和平板支撑”时，Planner 只能用 `searchExerciseResources(q: "俯卧撑")` 做单个文本查询，导致另外两个点名动作没有进入数据库事实链路。系统需要给模型一个受控能力，先确认用户点名动作是否存在于数据库，再让现有动作列表查询在返回列表时优先包含这些已解析动作。

## What Changes

- 新增低风险只读业务 tool，用于解析模型显式传入的用户点名动作文本，例如 `["俯卧撑", "深蹲", "平板支撑"]`，返回每个文本对应的数据库动作命中、歧义或未命中诊断。
- 新 tool 只做数据库事实查询，不读取用户原始自然语言做服务端拆词，不生成 routine / plan / patch / 训练卡片，不保存 artifact 或用户记忆。
- 扩展 `searchExerciseResources` input，新增 `requiredExerciseIds`，用于让已解析的数据库动作优先进入现有 `groups.<section>.exercises` 列表。
- `searchExerciseResources` output 主结构保持不变，继续使用 `groups -> exercises`、`query`、`diagnostics`；不得新增 `requiredMatches`、`supplementalMatches` 或让模型二选一的新并行结果字段。
- 当 `requiredExerciseIds` 与 section、发布态、排除列表或确定性边界冲突时，`searchExerciseResources` SHALL 通过现有 `diagnostics` 扩展稳定错误码说明原因，不静默丢弃指定动作。
- 模型可见说明 SHALL 引导 Planner：用户点名多个动作时先调用新 tool 解析为 `exerciseId`，再把这些 id 传给 `searchExerciseResources.requiredExerciseIds`，最终仍由模型自行组合 `visibleTrainingProposal`。
- 不改变 `AgentAction`、`PlannerPort`、Executor、Policy Guard、Resource Contract Validator、Response Renderer 或 `/api/chat` 语义分流；不新增服务端关键词、正则、同义词表或短句模板。

## Capabilities

### New Capabilities

- `agent-exercise-mention-resolution-tool`: 定义点名动作解析 tool 的输入、输出、模型可见说明、数据库查询边界、projection / redaction、trace 和 tool-level 验证。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 扩展 `searchExerciseResources` 的输入合同，支持 `requiredExerciseIds` 优先纳入现有动作列表返回，并通过现有 `diagnostics` 表达指定动作无法进入列表的原因。

## Impact

- 新增业务 tool bundle：`lib/server/agent-tools/exercises/*`
- 现有动作查询 tool：`lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- 动作 repository 查询能力：`lib/server/exercises/exercise-repository.ts`
- ToolRegistry 生产注册：`lib/server/agent-tools/index.ts`
- 模型可见 manifest、schema summary、examples、observation、repair feedback 和 trace projection
- 测试：新增点名动作解析 tool-level tests，更新 `searchExerciseResources` tool-level tests、tool registry / manifest tests、Agent core contract helper tests、生产聊天回归测试和 `npm run typecheck`
