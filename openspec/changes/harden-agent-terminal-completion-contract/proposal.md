## Why

2026-06-05 的 `/api/chat` trace 显示，Planner 在已经执行 `inspectVisibleTrainingProposals(read_recent)` 并看到 training-only 事实后，输出了 `final_answer`，正文承诺“需要先查询热身和拉伸动作，请稍等”，但 `visibleOutputs` 为空且没有任何 grounding 引用。Runtime 将该 `final_answer` 当作成功终态收口，导致用户确认后没有生成训练编排，也没有进入 repair。

现有 `routine` / `plan` section readiness 合同只覆盖“提交了不完整 visibleOutputs”的情况，无法覆盖“用成功 `final_answer` 承诺后续还要执行 tool”的终态合同漏洞。需要把 `final_answer` 的完成语义、tool-result grounding 和模型可见说明一起收紧。

## What Changes

- 收紧通用 Agent terminal contract：`final_answer` 是当前 run 的终态，不能承诺尚未执行的 tool、查询、生成、保存或后续继续动作。
- 收紧 Action Validator 的成功 grounding：当当前 run 已经有 tool results 时，成功 `final_answer` 必须通过 `usedToolResultIds`、`usedResourceRefs` 或 `visibleOutputs[]` 连接到当前 run 的已满足事实；不能在工具执行后用无引用、无结构输出的 `final_answer` 空收口。
- 保持普通文本聊天能力：没有 tool result 的普通问答、能力说明、训练原则解释仍可直接用自然语言 `final_answer` 收口。
- 更新默认 Agent LLM prompt，让模型明确看到：需要继续获取事实时必须继续 `tool_call`，不能用 `final_answer.content` 表达“请稍等后再查”。
- 更新 `inspectVisibleTrainingProposals` 和 `searchExerciseResources` 的模型可见说明 / observation 边界：tool 结果只提供事实，不代表最终训练结构已经生成；需要后续事实时继续 tool_call、澄清或明确失败收口。
- 增加回归测试，覆盖原始失败类别和至少一个等价表达，证明不会新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- 不新增业务 tool、不修改 `/api/chat` 主路由、不让服务端按用户原文替模型选择 action、toolName、调用顺序或 `payload.kind`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-tool-safety-resource-closure`: 收紧 terminal action grounding，防止工具执行后成功 `final_answer` 无引用、无结构事实地空收口。
- `agent-tool-production-hardening`: 扩展生产 Agent hardening，使 invalid terminal completion 进入 repair 或安全失败收口，而不是成功投影。
- `agent-llm-prompt-configuration`: 默认 prompt 必须表达 `final_answer` 的终态完成语义，以及需要继续工具时必须返回 `tool_call`。
- `visible-proposal-reference-tool`: `inspectVisibleTrainingProposals` 的模型可见说明必须表达 read/import 只导入事实，不代表最终训练结构已经生成。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见说明必须表达查询结果只提供动作事实；如果最终结构仍缺事实，模型必须继续 tool_call、澄清或明确失败收口，不能用 `final_answer` 承诺异步继续。

## Impact

- 影响 Agent core terminal validation：
  - `lib/server/agent-core/action-validator.ts`
- 影响默认模型可见 prompt：
  - `lib/server/config/agent-llm-prompt-config.ts`
- 影响业务 tool 的模型可见说明和 observation：
  - `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- 影响测试：
  - `tests/agent-core/planner-validator.test.ts`
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-tools/inspect-visible-training-proposals.test.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/chat-service.test.ts`
  - `tests/agent-core/architecture-boundary.test.ts`
- 不影响：
  - `/api/chat` 请求 / 响应外部契约
  - `PlannerPort`
  - Executor 主流程
  - Policy Guard 主流程
  - Response Renderer 主流程
  - 数据库 schema、Prisma migration 或训练动作数据
