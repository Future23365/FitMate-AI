## Why

当前 `searchExerciseResources` 的模型可见结果同时暴露动作事实、section coverage 诊断和每个动作的 `allowedSections`，容易让模型把“查询到动作候选”误读成“还缺 warmup / stretch 或需要继续补齐编排”。同时该 tool 固定每个 section 返回 8 个动作，无法满足用户明确要求“取出 10 个动作”等候选规模需求。

## What Changes

- **BREAKING** 简化 `searchExerciseResources` 的模型可见 observation：从旧 `groups.<section>.exercises[]` 和 section coverage 诊断，调整为按查询口径分组的 `candidateGroups[]` 候选列表；每组保留 `suitability` 作为本次查询来源，不再向模型暴露 `sectionSummary`、`availableSections`、`missingSections`、每个动作的 `allowedSections`、`allowedSectionsRelation` 和 `groupSemantics`。
- 保留 `suitabilities` 作为查询输入，模型需要主训练、热身或拉伸候选时仍通过 `suitabilities = ["training"]`、`["warmup"]` 或 `["stretch"]` 表达查询口径；模型可见结果中的 `candidateGroups[].suitability` 只回显查询来源，不是最终训练编排命令。
- 新增受控候选数量输入 `candidateCountPerSection?: number`，默认值为 8，最大值为 24；该字段只控制每个请求 section 的候选返回数量，不提供分页、offset、cursor 或任意全库读取能力。
- 保守保留最终 `visibleTrainingProposal` 服务端校验：最终输出仍由服务端基于数据库事实复核 `exerciseId`、发布态和 `allowedSections`，不把训练 section 合法性完全交给模型自由判断。
- 同步更新 `searchExerciseResources` 的 description、schema description、model-visible summary、user projection、trace summary 和相关测试，明确该 tool 只返回动作候选事实，不生成 routine、plan、训练卡片、处方或保存结果。
- 不新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` runtime 分支或 `/api/chat` 主链路改动。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 调整 `searchExerciseResources` 的输入数量控制、模型可见 observation 形状、section coverage 暴露边界和动作候选事实合同。
- `agent-tool-production-hardening`: 区分受控候选数量字段和分页 / offset 控制字段，继续禁止 `limit`、`page`、`pageSize`、`offset`、`take`、`maxReturned` 等可复制分页字段。
- `ai-token-budgeting`: 调整 Planner 模型投影保留字段要求，保留 `searchExerciseResources` 的 `candidateGroups[]` 查询口径分组，避免继续要求模型可见投影保留已删除的 `allowedSections` / section coverage 字段。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/config/agent-runtime-config.ts`
  - `lib/server/exercises/exercise-repository.ts` 的现有 `maxReturned` hard cap 消费路径
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- 不影响代码：
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - `submitVisibleTrainingProposal` 的最终数据库动作事实校验
- 需要更新 OpenSpec specs，并运行 `openspec validate simplify-exercise-resource-search-output --strict`、相关 tool 单测、catalog / contract gate 测试和 `npm run typecheck`。
