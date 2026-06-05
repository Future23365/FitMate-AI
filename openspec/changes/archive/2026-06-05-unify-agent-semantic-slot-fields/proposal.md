## Why

当前 Agent 合同里存在一类模型不友好的字段设计：同一个语义槽在不同 `type`、`operation` 或场景下使用不同字段名，例如终态用户可见文本在 `final_answer` 中叫 `content`，在 `ask_user` 中叫 `question`。这会迫使模型同时记忆多个等价字段，尤其在 prompt、manifest 和 repair feedback 很长时容易输出结构正确但字段错误的 JSON。

本 change 目标是一次性审查并收敛这类“同义字段分裂”问题：语义差异由稳定判别字段表达，字段名只表达数据槽本身，降低模型注意力负担并让 repair 更直接。

## What Changes

- 建立 Agent 合同命名原则：如果同一个语义槽只是出现在不同 `type`、`operation` 或 `kind` 下，字段名 SHOULD 保持一致，差异 SHOULD 由 `type`、`operation`、`kind` 或等价判别字段表达。
- **BREAKING** 收敛 `AgentAction` 终态用户可见文本字段：`final_answer` 和 `ask_user` 都使用 `content` 表达用户可见文本；`ask_user.question` 不再作为新主合同字段。
- **BREAKING** 同步 Response Renderer、NDJSON trace summary、聊天服务投影和 tests，使 `ask_user` 的用户可见文本来源与 `final_answer` 一致，不再依赖 `question`。
- 强化模型可见 `AgentAction` 输出格式：在默认 prompt / model input 中用短 JSON 形状明确 `tool_call`、`final_answer`、`ask_user` 的必需字段，避免只用长段说明描述字段要求。
- 强化 `invalid_action_schema` repair feedback：当模型输出同义旧字段或缺主字段时，反馈必须直接指出新字段名，例如 `ask_user` 用户可见文本必须写入 `content`。
- 审查并收敛 tool input 中的同义字段：
  - `searchExerciseResources.muscle` / `muscles` 应收敛为一个主肌群筛选字段。
  - `inspectVisibleTrainingProposals.read_recent` 的 `factRef` / `messageId` 引用输入应收敛为一个结构化引用槽，或明确只保留一个主引用字段。
- 审查 terminal grounding 中的引用槽设计，评估 `usedToolResultIds` / `usedResourceRefs` 是否应收敛为统一来源引用结构；如设计确认不收敛，必须在 design 中说明它们不是同一语义槽的理由。
- 不新增服务端关键词、正则、同义词表、短句模板或自然语言语义分流；模型仍负责理解用户意图，服务端只校验结构、权限、资源和事实。
- 不做旧字段长期兼容转换。若实现阶段需要短期迁移入口，必须写清入口、清理条件、测试边界和禁止模型继续输出旧字段的 repair 说明。

## Capabilities

### New Capabilities
- 无。

### Modified Capabilities
- `agent-tool-contract-kernel`: 修改 `AgentAction` 终态字段合同，并补充同义语义槽字段命名原则。
- `agent-llm-prompt-configuration`: 默认 Agent prompt 必须用短 JSON 形状表达每类 `AgentAction` 的字段要求，并说明同义旧字段不再可用。
- `agent-text-chat-flow`: 文本聊天主链、Response Renderer、NDJSON 事件摘要和 trace 必须按统一终态文本字段投影 `final_answer` / `ask_user`。
- `agent-contract-repair-loop`: repair feedback 必须针对同义旧字段和缺主字段给出字段级修复建议。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的单值 / 多值肌群筛选字段需要收敛为一个主字段或给出非同义设计证明。
- `visible-proposal-reference-tool`: `inspectVisibleTrainingProposals.read_recent` 的引用输入字段需要收敛为一个引用槽或给出非同义设计证明。

## Impact

- 影响核心 Agent 合同：
  - `lib/server/agent-core/contracts.ts`
  - `lib/server/agent-core/action-validator.ts`
  - `lib/server/agent-core/response-renderer.ts`
  - `lib/server/agent-core/runtime.ts`
- 影响模型可见输入：
  - `lib/server/config/agent-llm-prompt-config.ts`
  - tool manifest、schema description、examples、repair feedback、observations 和 compressed tool results
- 影响生产聊天与前端消费：
  - `lib/server/chat/agent-text-chat-service.ts`
  - `features/chat/api/chat-client.ts`
  - `features/chat/hooks/use-chat-controller.ts`
  - `features/chat/types.ts`
- 影响业务 tool schema：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`
- 影响测试与文档：
  - AgentAction schema / validator / renderer / runtime tests
  - prompt config / model adapter tests
  - tool-level schema / manifest / repair tests
  - trace / replay 或 ai trace summary tests
  - `docs/方案变更历史/` 和 `docs/项目演变历程.md`
- 不影响：
  - 服务端自然语言理解边界
  - `ToolRegistry` 选择机制
  - `Policy Guard` 权限和确认裁决
  - 数据库事实来源和训练方案业务校验规则
