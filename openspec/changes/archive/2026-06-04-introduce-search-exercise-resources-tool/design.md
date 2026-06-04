## Context

当前 `docs/agent-tool-design.md` 已经把动作库查询 tool 收敛为 `searchExerciseResources`：它只接收 LLM 结构化后的动作筛选字段，按 `Exercise` 数据库字段查询发布态动作，并返回事实摘要。这个设计刻意排除了训练生成、候选集合、卡片事件、保存 artifact 和分页控制。

当前生产 `/api/chat` 已经接入新的 `agent-core` 文本聊天主链，但 `ToolRegistry` 仍为空。现有 OpenSpec 规格中还有“文本聊天阶段必须使用空 ToolRegistry”的要求，因此本 change 必须同时处理业务 tool 新增和生产注册边界迁移，否则实现会和既有规格冲突。

任务分类：

- 主类型：新增业务 tool。
- 伴随类型：production 接入变更，仅限 production registry 注册 `searchExerciseResources`。
- 模型可见合同类型：单个业务 tool 模型可见说明。
- core contract 变更：不在范围内。

允许触碰模块：

- `lib/server/agent-tools/**` 中新增动作查询 tool bundle。
- `lib/server/agent-tools/index.ts` 或等价 registry 工厂，新增 production registry 注册入口。
- `lib/server/chat/agent-text-chat-service.ts` 中空 registry 构造点的局部接线。
- `lib/server/exercises/**` 和 `lib/shared/exercises/query-schema.ts` 的查询服务复用边界，包括新增专用动作资源查询 repository 入口。
- `tests/agent-tools/**`、`tests/agent-core/**`、`tests/chat-service.test.ts` 或等价最窄测试。

禁止触碰模块：

- `agent-core` Runtime 主循环、`PlannerPort`、Executor 主流程、`Policy Guard` 主流程、`Resource Contract Validator` 主流程和 `Response Renderer` 主流程。
- `/api/chat` route 的业务关键词、正则、模板或同义词分流。
- routine / plan / patch 候选集合、训练草稿生成、保存 artifact、用户记忆和写入确认链路。
- 任何服务端基于用户原文改写 LLM 高层语义决策的逻辑。

## Goals / Non-Goals

**Goals:**

- 将 `searchExerciseResources` 实现为真实业务 Agent tool，并通过 `ToolRegistry` 暴露给生产文本聊天。
- 让模型在需要动作库事实时可以调用工具查询发布态动作，并基于成功 tool result 生成 `final_answer`。
- 保持 tool 单一职责：只返回动作资源摘要和查询摘要，不产生下游可消费训练候选集合。
- 为 schema、handler、projection、trace、manifest、registry 和 production 接入补齐自动化验证。
- 让能力边界从“空 registry”迁移为“只注册这个低风险只读 tool”，同时保留基础文本问答能力。

**Non-Goals:**

- 不新增训练编排、训练计划、动作替换、保存 artifact、用户记忆或写工具。
- 不让 `searchExerciseResources` 产出 `candidate_set` resource 或 `candidateSetId`。
- 不支持分页、`limit`、`offset`、`page`、`pageSize` 等模型可控数量参数。
- 不查询未发布动作；普通生产聊天只能查询可面向用户展示的发布态动作。
- 不调整通用 Agent prompt 的 core 合同，只在 tool manifest / schema 描述 / examples 中表达单个业务 tool 的模型可见说明。
- 不新增数据库字段、Prisma migration 或外部依赖。
- 不引入新的语义向量检索、pgvector 查询或外部 Vector DB；`q` 仍是数据库可执行的确定性文本搜索字段。

## Decisions

### Decision 1: 以独立 tool bundle 接入，不修改 Agent core

新增 `searchExerciseResources` 应放在 `lib/server/agent-tools/exercises/` 或等价领域目录，通过 `defineTool` 定义 `name`、`version`、`description`、`whenToUse`、`whenNotToUse`、`inputSchema`、`outputSchema`、`policy`、`handler`、`toModelObservation`、`toUserProjection` 或等价安全投影。

理由：这是一个单个业务 tool 能解决的问题，现有 `ToolRegistry`、manifest、Executor、projection 和 trace 机制已经提供接入点。为这个 tool 修改 Runtime / Planner / Executor 会把业务分支写进 core。

备选方案：在 `/api/chat` 中根据“动作”“器械”等关键词直接查库。该方案违反服务端语义边界，也绕过 ToolRegistry 和模型结构化决策，放弃。

### Decision 2: 生产 registry 只注册 `searchExerciseResources`

当前 `createEmptyProductionTextChatRegistry()` 或等价函数应演进为明确的 production registry 构造入口，例如 `createProductionAgentToolRegistry()`。本 change 只允许注册 `searchExerciseResources`，并通过测试证明没有 fixture tools、训练生成、保存、用户记忆或其他业务 tool 被带入。

理由：用户请求是“把业务 tool 引进来”，而不是恢复完整训练业务链路。只注册一个低风险只读 tool，可以解除空 registry 限制，又避免一次 change 跨越多个领域能力。

备选方案：一次性注册动作详情、候选集合、训练生成和保存工具。该方案范围过大，会同时触碰 resource、policy、confirmation、artifact 和训练生成合同，放弃。

### Decision 3: 输入合同复用动作列表结构化字段，但收紧生产发布态

`inputSchema` 只允许 `q`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`goalTag`、`riskTag`、`published` 和 `sort`。普通生产聊天默认 `published = true`，并且不得让用户查询未发布动作；如果模型提交 `published = false`，应作为权限或输入边界失败处理，而不是查询未发布数据。

理由：这些字段来自现有动作列表查询合同和 `Exercise` 模型，服务端可以确定性校验和执行。发布态是权限边界，不是语义判断。

备选方案：开放 `candidateUse`、`resultRequirements`、`injuryLimitations`、`requiresNoEquipment` 或分页字段。该方案会把消费场景和自然语言语义塞进基础查询 tool，放弃。

### Decision 4: 使用专用 repository 下推查询，不复用全表读取入口

`searchExerciseResources` 的 handler 不得调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他会先读取全量 `Exercise` 再内存过滤的入口。实现时应新增或复用专用 repository 函数，例如 `searchExerciseResourceSummaries()`，把可执行筛选转换为 Prisma `where`，并用同一 `where` 分别执行：

- `count()`：生成 `totalMatches`。
- `findMany({ where, orderBy, take: maxReturned + 1, select })`：只取有限动作摘要字段，并用多取 1 条判断 `truncated`。

`select` 必须只包含 tool output 和安全投影需要的摘要字段，默认不读取完整 `instructionsEn`、`instructionsZh`、`embedding`、内部诊断字段或其他大 payload。`q` 只能下推为确定性文本搜索，例如匹配 `nameZh`、`nameEn`、`embeddingText` 或当前动作列表查询合同支持的公开文本字段；不得在本 change 中新增本地向量 rerank、pgvector 查询或外部 embedding 调用。

理由：当前动作库规模虽然不大，但 production Agent tool 每次执行都全表读取会放大数据库传输、Node.js 对象分配和 GC 压力。这个 tool 只是发布态动作事实查询，结构化字段已经能在数据库层确定性筛选，没必要把执行型候选集合 builder 的全量内存路径固化到新的只读 tool。

备选方案：直接调用现有 `searchExercises()` 再截断输出。该方案实现快，但会把全表读取、执行型候选诊断和 hybrid ranking 带入一个本应轻量的事实查询 tool，放弃。

### Decision 5: 成功查询不登记下游 resource

工具成功时返回 `status: "succeeded"`、查询摘要和动作摘要，并使 fulfillment 为 `satisfied = true`。即使 `totalMatches = 0`，也表示成功完成事实查询。默认不登记 `ResourceStore` resource，final answer 只能通过 `usedToolResultIds` 引用本轮成功 tool result。

理由：这个 tool 的结果只支撑普通回答，不支撑 routine / plan / patch 的执行型候选消费。避免把普通查询结果误当成 `candidate_set`。

备选方案：返回 `candidateSetId` 供训练生成复用。该方案会和执行型候选集合 builder 混淆，放弃。

### Decision 6: 模型可见说明放在 tool manifest，不写入通用 prompt 特例

`whenToUse` 应表达“当用户需要查询符合结构化条件的发布态动作列表时使用”。`whenNotToUse` 应表达“不要用于生成训练、保存结果、读取单个动作详情、解析唯一动作名、统计全库 facet 或构建 routine / plan / patch 候选集合”。schema 描述和 examples 应说明关键字段、默认发布态、`q` 的确定性匹配边界、成功结果和空结果含义。

理由：单个业务 tool 的能力边界应靠 manifest 和 schema 让模型看到，不应把业务特例写进通用 Agent prompt。

备选方案：修改通用 prompt，要求遇到动作查询就调用某个工具。该方案会把 toolName 特例写进通用合同，放弃。

### Decision 7: projection 和 trace 只输出摘要

`toModelObservation` 只允许输出 `toolResultId`、`totalMatches`、`returnedCount`、`truncated`、`appliedFilters` 和有限动作摘要字段。用户投影只展示查询口径、命中数量和可展示动作摘要。trace summary 记录 toolName、toolResultId、输入摘要、命中数量、截断状态、失败 code，不记录完整数据库对象或内部 handler payload。

理由：动作库数据不是高度敏感数据，但完整 handler output、内部对象和大 payload 不应默认进入模型、用户事件或 trace。

备选方案：让 runtime 默认把完整 output 灌给模型和用户。该方案违反 redaction 和 projection 边界，放弃。

## Risks / Trade-offs

- [Risk] `q` 被模型误当成语义向量检索或 hard constraint。→ Mitigation: manifest / schema 描述明确 `q` 是动作库文本搜索字段，结构化约束必须放在对应 filters；tool-level tests 覆盖结构化字段优先和 `q` 边界。
- [Risk] 实现时为了复用旧服务而继续全表读取动作库。→ Mitigation: design / spec / tasks 明确 handler 必须走专用 repository，测试用 mock 或 spy 证明 `listExerciseRecords()` / `searchExercises()` 未被调用，并断言 Prisma 查询使用 `where`、`select`、`count` 和内部固定 `take`。
- [Risk] 空 registry 相关测试会失效。→ Mitigation: 更新测试语义，从“必须为空”改为“只允许受控 production registry”，并保留无工具场景的单元测试。
- [Risk] 普通基础问答可能过度调用动作查询 tool。→ Mitigation: prompt / manifest tests 覆盖不需要数据库事实的问题必须直接 `final_answer`，能力说明基于当前可见 tools。
- [Risk] 模型提交 `published = false`。→ Mitigation: schema、policy 或 handler 必须拒绝普通生产聊天查询未发布动作，并记录结构化失败。
- [Risk] 查询结果被误用于训练生成。→ Mitigation: 不产出 `candidateSetId` 或 `candidate_set` resource；contract tests 验证该 tool result 只能支撑普通 final answer。
