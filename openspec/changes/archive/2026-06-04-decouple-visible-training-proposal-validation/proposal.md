## Why

当前 `visibleTrainingProposal` 的最终输出校验从本轮 `toolResults` 中按具体 `toolName` 收集动作来源，导致训练方案合法性与 `searchExerciseResources` / `inspectVisibleTrainingProposals` 的返回形态耦合。这个耦合会让后续新增任意动作查询、动作解析或候选工具时都必须修改 `visibleTrainingProposal` validator，也让“动作是否存在于数据库”和“模型是否调用过某个 tool”混成同一个边界。

## What Changes

- 将 `visibleTrainingProposal` 的动作合法性校验从具体 `toolName` 返回值解耦，改为基于数据库事实验证最终 `exerciseId`、发布态状态和 section 边界。
- 引入或调整终态输出校验服务，使 `final_answer.visibleOutputs[]` 在渲染和保存前完成数据库事实校验；不得依赖 `searchExerciseResources` 或 `inspectVisibleTrainingProposals` 的 toolName 分支来证明动作存在。
- `searchExerciseResources` 保持只读动作库查询职责：它可以帮助模型发现动作事实，但不再是 `visibleTrainingProposal` 合法性的唯一或特殊背书来源。
- `visibleTrainingProposal` renderer 使用已校验的数据库动作详情补齐用户可见卡片内容，不再从具体 tool result 中按 toolName 拼展示详情。
- 保留 Agent 边界：LLM 仍负责选择最终训练方案；服务端只校验结构、数据库事实、权限、发布态和 section；不得新增服务端关键词、正则、同义词或短句模板来解析用户语义。
- 保留 `visible_training_proposal_fact` 的跨轮事实职责，但它不再作为绕过数据库动作事实校验的来源；读取历史事实后仍需校验其中动作当前可用性。
- 明确本 change 不新增批量动作解析 tool、不扩展 `searchExerciseResources` 批量查询字段、不修改 `/api/chat` 业务语义分流。

## Capabilities

### New Capabilities
- `visible-training-proposal-validation`: 定义 `visibleTrainingProposal` 的最终输出校验、数据库动作事实读取、renderer 详情来源和跨轮事实复核边界。

### Modified Capabilities
- `agent-tool-production-hardening`: 收紧 terminal output validation 的通用安全要求，禁止最终输出校验层硬编码具体业务 `toolName` 作为合法来源。

## Impact

- 后端终态输出校验：`lib/server/visible-training-proposals/visible-training-proposal-validator.ts`、`lib/server/agent-core/terminal-output-validator.ts`、`lib/server/agent-core/action-validator.ts`
- 动作事实读取：`lib/server/exercises/exercise-repository.ts` 或新增服务端只读校验服务
- 用户可见渲染：`lib/server/visible-training-proposals/visible-training-proposal-renderer.ts`
- 事实桥与跨轮引用：`lib/server/visible-training-proposals/visible-training-proposal-fact-store.ts`
- 生产聊天接入：`lib/server/chat/agent-text-chat-service.ts` 中的 validator / renderer 装配边界
- 测试：`tests/visible-training-proposal-validator.test.ts`、`tests/agent-core/architecture-boundary.test.ts`、`tests/chat-service.test.ts`、必要的 renderer / fact-store 回归测试和 `npm run typecheck`
