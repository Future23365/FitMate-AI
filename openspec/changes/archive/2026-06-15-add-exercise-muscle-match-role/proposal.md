## Why

当前 `searchExerciseResources.muscles` 同时匹配主肌群和辅助肌群，导致用户按目标肌群请求动作推荐时，模型拿到的是“目标肌群参与”的宽泛候选池，而不是“目标肌群主练”的候选池。数据库已经有 `primaryMuscles*` 和 `secondaryMuscles*`，问题不在缺少数据字段，而在 tool 查询参数和模型可见合同没有区分“主练命中”和“参与命中”。

## What Changes

- **BREAKING（模型可见 tool 合同）**：调整 `searchExerciseResources.muscles` 的默认匹配口径。未显式指定匹配角色时，`muscles` 默认只匹配 `primaryMuscles` / `primaryMusclesZh`。
- 为 `searchExerciseResources` 新增结构化输入字段 `muscleMatchRole`：
  - `primary`：只匹配主肌群，作为默认值，用于目标肌群动作推荐、训练动作筛选和结构化训练结果候选。
  - `any`：匹配主肌群或辅助肌群，用于查询某肌群是否参与、动作会带到哪些肌群、或用户明确需要宽泛参与口径时。
- 更新 `searchExerciseResources` 的 repository filter、schema description、tool description、model-visible summary、user projection 和 trace summary，使模型和 trace 都能看到当前肌群匹配角色。
- 更新默认 Agent prompt 的 Planner Policy：目标肌群推荐默认按主练肌群理解；只有用户目标要求“参与 / 带到 / 辅助刺激 / 覆盖相关动作”这类宽泛参与语义时，才使用 `muscleMatchRole = "any"`。
- 更新 model-visible contract gate 和相关测试，防止修复退化为具体用户短句、关键词、业务 `toolName` 分支或服务端自然语言分流。
- 不新增 Prisma 字段、不迁移动作数据、不删除辅助肌群字段，也不把 `searchExerciseResources` 改成推荐排序器或训练生成器。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 修改 `searchExerciseResources` 的肌群匹配执行合同，新增 `muscleMatchRole`，并将 `muscles` 默认口径从主/辅都命中改为主肌群命中。
- `agent-llm-prompt-configuration`: 调整默认 prompt 中目标肌群推荐、宽泛参与查询和停止继续查询的 Planner Policy。
- `agent-model-visible-contract-gate`: 增加门禁覆盖，确保肌群匹配角色说明不会变成 case-specific 生产规则、固定 workflow 或服务端语义分流。

## Impact

- 影响模型可见和执行合同：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/exercises/exercise-service.ts`（如复用同一查询语义）
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/model-visible-contract-gate.ts`
- 影响测试：
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-runtime/runtime.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- 不影响：
  - Prisma schema、migration 或动作数据回填
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - 服务端 route / handler 基于用户自然语言的关键词、正则、同义词或 phrasing 分流逻辑
