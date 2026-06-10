## Why

当前 `visibleTrainingProposal` 把“动作必须来自当前 run 可消费事实来源”作为 hard fail，导致模型输出数据库中真实存在且 section 合法的动作时，仍可能因为未出现在本轮 tool result 的对应 group 中被拒绝。与此同时，`inspectVisibleTrainingProposals` 要求模型先 `list_recent` 再 `read_recent` 才能复用历史方案，增加了模型规划分支和失败面。

更大的根因是模型可见合同把服务端内部引用机制暴露给 LLM：`factRef`、`messageId`、`resourceId`、`toolResultId`、`usedRefs` 和二阶段读取流程都要求模型复制、选择或拼装内部 ID。模型真正需要的是训练方案、动作和约束这些业务事实；内部引用应由服务端维护，用于权限、trace、持久化和 provenance，而不是成为 Planner 输出合同。

本 change 的目标是把服务端 hard 校验收敛到确定性数据库事实和结构边界，把历史可见训练方案读取封装进一次 tool 调用，并将模型可见合同升级为“业务事实输入、业务结构输出”。服务端内部继续维护权限、状态、schema、ResourceStore、trace 和 provenance，但不再要求 LLM 手写或引用内部 ID。

## What Changes

- 调整 `visibleTrainingProposal` terminal output 校验：新生成卡片的 `exerciseItems[*].exerciseId` 不再要求必须出现在当前 run 的 `toolResults.groups.<section>.exercises[]` 或 consumable resource 中。
- 保留并强化数据库事实 hard 校验：`exerciseId` 必须存在、发布态可展示、当前用户可访问，且 `exerciseItems[*].section` 必须被数据库 `allowedSections` 覆盖。
- 将当前 run 动作来源从 hard fail 降级为 provenance / trace diagnostic；缺少当前 run 来源时不得阻断已通过数据库事实校验的 `visibleTrainingProposal`。
- 从模型可见 `AgentAction` / `actionContract` / prompt / repair feedback 中移除 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`resourceId`、`toolResultId`、`factRef`、`messageId` 等内部引用操作要求；这些引用只允许作为服务端内部 provenance、trace、持久化或 ResourceStore 数据。
- 调整 terminal grounding：`final_answer.visibleOutputs[]` 通过业务 validator 后即可作为结构化交付成功依据；普通 `final_answer` 或 `ask_user` 的内部来源由 runtime 根据本轮 tool results、observations、visibleOutputs 或失败上下文自动记录，不要求模型输出 `usedRefs`。
- 删除模型可见的 `inspectVisibleTrainingProposals(operation = "read_recent")` 分支；历史方案事实读取、权限校验和 consumable resource 登记由 `list_recent` 一次完成。
- 将 `inspectVisibleTrainingProposals(operation = "list_recent")` 改为查询当前 actor 和当前 conversation 中历史生成并已展示的 `visibleTrainingProposal` 事实，返回可复用的受控压缩业务事实，并由服务端内部登记当前 run 可消费 resource；模型可见输出不得暴露可复制的 `factRef`、`messageId`、`resourceId` 或 `toolResultId`。
- 更新模型可见 output contract、tool manifest、schema summary、examples、observation 和 repair feedback，移除“必须 `read_recent`”和“新卡片动作必须来自当前 run 来源”的强规则。
- 更新模型实际输入分层：模型只接收业务内容、动作事实、方案事实和业务约束；服务端内部 provenance 不进入模型必须操作的字段。
- 不新增服务端自然语言关键词路由、短句模板、同义词判断或具体 `toolName` 语义分支。
- **BREAKING**: `inspectVisibleTrainingProposals` 的模型可见 input contract 不再支持 `operation = "read_recent"`；相关测试、manifest 和 replay fixture 需要同步更新。
- **BREAKING**: Planner 可见 `final_answer` / `ask_user` 不再支持或要求 `usedRefs`；Planner 可见 `tool_call` 不再支持让模型手写 `consumes` resource 引用。相关 Agent core schema、prompt、repair、manifest、adapter、runtime 和 tests 需要同步更新。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `visible-training-proposal-validation`: 将当前 run 动作来源从 hard fail 改为诊断信息，保留数据库事实、section、payload、prescription 和 schedule hard 校验。
- `visible-proposal-reference-tool`: 收敛 `inspectVisibleTrainingProposals` 为一次 `list_recent` 可消费事实查询，移除模型可见 `read_recent` 分支。
- `agent-visible-output-contracts`: 更新 `visibleTrainingProposal` 模型可见 output contract，使其表达数据库事实校验和历史事实一次导入的新 grounding 边界。
- `agent-tool-contract-kernel`: 将模型可见 `AgentAction` 与服务端内部 grounding / ResourceStore provenance 解耦，移除 Planner 手写内部引用 ID 的要求。
- `agent-llm-prompt-configuration`: 更新 action contract、glossary、toolResults / observations 投影和 repair 说明，使模型不再需要理解或输出内部引用 ID。
- `agent-contract-repair-loop`: 更新 schema / domain repair feedback，遇到旧引用字段时要求删除或改用业务结构，而不是要求模型补正确 ID。

## Impact

- 影响 `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`、`visible-training-proposal-exercise-facts.ts` 及相关 terminal output validation metadata。
- 影响 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 input schema、handler、resource contract、model/user projection、trace projection 和 tests。
- 影响 `lib/server/agent-core/contracts.ts`、`action-validator.ts`、`runtime.ts`、`observation.ts`、`schema-error-projector.ts`、`resource-store.ts` 的模型可见边界、内部 provenance 记录和 tests。
- 影响 `lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts`、`lib/server/config/agent-llm-prompt-config.ts`、`lib/server/config/agent-visible-output-contracts.ts` 以及相关 prompt / manifest / model input builder 测试。
- 影响 `lib/server/chat/terminal-failure-finalizer.ts` 和 production trace / response summary 中对 terminal grounding、blocked outputs 和 visible output validation 的投影说明。
- 影响依赖 `current_run_source_missing`、`read_recent`、`visible_training_proposal_fact_index` 或二阶段历史读取的 `tests/chat-service.test.ts`、`tests/visible-training-proposal-validator.test.ts`、`tests/agent-tools/inspect-visible-training-proposals.test.ts` 和 registry manifest 测试。
- 影响依赖 `usedRefs`、`usedToolResultIds`、`usedResourceRefs`、`resourceId`、`toolResultId`、`factRef` 或 `messageId` 模型可见引用合同的 Agent core、prompt、repair 和 chat-service 测试。
- 不改变 `/api/chat` 的生产入口职责，不绕过 `ToolRegistry`、`Policy Guard`、`ResourceStore`、terminal output validator 或 Response Renderer；只是把这些内部机制从模型可操作合同中移回服务端内部。
