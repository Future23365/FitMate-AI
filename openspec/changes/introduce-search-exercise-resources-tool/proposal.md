## Why

`docs/agent-tool-design.md` 已经把动作库查询能力收敛为单一职责的 `searchExerciseResources` 设计，但当前生产 Agent 仍处于空 `ToolRegistry` 阶段，模型无法通过受控工具读取发布态动作库事实。

本 change 需要把这个只读结构化动作查询作为第一个真实业务 tool 接入 Agent 工具体系，使普通聊天可以回答“有哪些符合条件的动作”这类事实查询，同时保持 core、`/api/chat` 和训练生成链路不被业务特例污染。

## What Changes

- 新增 `searchExerciseResources` 业务 Agent tool 的实现范围：tool bundle、`inputSchema`、`outputSchema`、policy metadata、handler、安全 model / user projection、trace summary 和 `ToolRegistry` 注册。
- 为 `searchExerciseResources` 新增专用动作资源查询 repository 入口，使用数据库层 `where`、`count`、`take` 和 `select` 执行发布态结构化筛选，禁止通过 `listExerciseRecords()` 或旧 `searchExercises()` 全表读取后内存过滤。
- 将 production `/api/chat` 的 Agent registry 从“必须为空”调整为“允许注册 `searchExerciseResources` 这一个低风险只读业务 tool”，但继续禁止 fixture tools、训练生成、保存、用户记忆、artifact 写入和业务关键词分流。
- 将基础文本问答边界调整为“基于当前可见 tools 决定是否调用工具”：不需要数据库事实的问题继续用 `final_answer`，动作库事实查询可以由模型选择 `searchExerciseResources`。
- 不修改 Agent core 主循环、`PlannerPort`、Executor 主流程、`Policy Guard` 主流程、`Resource Contract Validator` 主流程或 `Response Renderer` 主流程。
- 不把 `searchExerciseResources` 当成 routine / plan / patch 的执行候选集合 builder，也不产出 `candidate_set` resource、训练卡片、保存事件或 artifact 写入。

## Capabilities

### New Capabilities

- `agent-exercise-resource-query-tool`: 定义 `searchExerciseResources` 只读动作库查询 tool 的输入、输出、投影、trace、安全边界和测试要求。

### Modified Capabilities

- `agent-text-chat-flow`: 将生产文本聊天的空 `ToolRegistry` 阶段改为允许注册 `searchExerciseResources`，并保留无关键词分流、无 fixture tool、无训练生成和无保存能力的生产边界。
- `agent-text-chat-basic-answering`: 调整基础问答规则，使模型在当前可见 `searchExerciseResources` tool 下仍能直接回答普通问题，并且只在需要动作库事实时调用该 tool。

## Impact

- 预计影响代码：
  - `lib/server/agent-tools/**` 或等价业务 tool 目录。
  - `lib/server/agent-tools/index.ts` 或等价 registry 接线入口。
  - 动作库查询服务边界，例如 `lib/server/exercises/exercise-repository.ts`、`lib/server/exercises/exercise-service.ts` 和 `lib/shared/exercises/query-schema.ts` 的复用层。
  - `/api/chat` 的 production Agent registry 构造入口，但只允许局部注册接线，不改变主链路或新增自然语言分流。
  - Agent tool manifest、projection、trace summary 和相关测试。
- 预计新增或更新测试：
  - `tests/agent-tools/search-exercise-resources.test.ts` 或等价 tool-level unit tests。
  - Agent core contract helper / registry manifest 测试。
  - production registry 或 architecture boundary 测试，证明 core 和 `/api/chat` 没有业务 toolName 分支、关键词分流或 fixture tool 回归。
- 不涉及 Prisma Schema、数据库迁移、新依赖、前端 UI 或训练计划保存流程。
