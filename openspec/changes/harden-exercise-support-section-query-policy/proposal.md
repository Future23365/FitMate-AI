## Why

`searchExerciseResources` 当前把热身 / 拉伸动作和主训练动作使用同一套 hard filters 查询，导致 support section 在难度、动作力学、目标标签等字段组合过严时查空。实际问题不是模型不知道要查热身或拉伸，而是 tool 没有表达“support section 查询应以 section、器械、场地和部位边界为主”的执行合同，也没有把实际应用和未应用的过滤字段结构化暴露给 Planner。

本 change 要解决的是动作库查询 tool 的执行边界问题：让热身 / 拉伸查询更容易返回可用动作事实，同时保持服务端不读取用户原文、不做关键词分流、不替模型决定下一步。

## What Changes

- 调整 `searchExerciseResources` 的 repository 查询策略，按 `suitabilities` / section 区分 hard filter policy。
- `training` 查询继续保持现有严格结构化过滤：发布态、section、器械、场地、肌群、难度、分类、动作力学、目标标签、风险标签、`q`、`requiredExerciseIds` 和 `excludeExerciseIds` 等字段按当前合同执行。
- `warmup` / `stretch` 查询采用 `support_section` policy：只把发布态、section、器械、场地、肌群、`requiredExerciseIds` 和 `excludeExerciseIds` 作为 hard filters。
- 对 `warmup` / `stretch` 暂不把 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag`、`q` 作为 hard filters；这些字段如果由 Planner 传入，必须在 output / observation 中以机器可读结构声明为未作为强约束使用。
- 增加结构化 `filterApplications` 或等价字段，表达每个 section 实际采用的 policy、已应用 hard filters 和未作为 hard filter 使用的输入字段。
- 不新增自由文本 `resultBoundary` 之类服务端语义解释句；只暴露机器可读执行事实和稳定 reason code。
- 不新增 pgvector、RAG、向量召回或新的细碎 Planner 参数；现有 `stage-exercise-semantic-retrieval` change 仍负责语义检索基础设施。
- 不修改 Agent core、`/api/chat` 主链路、Policy Guard、Response Renderer 或服务端自然语言 intent 判断。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 调整 `searchExerciseResources` 的 section-aware hard filter policy，并要求 output / model observation 结构化披露实际应用与未应用的输入过滤字段。

## Impact

- 预计影响：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/exercises/exercise-repository.ts` 或等价 repository 查询构造入口
  - `searchExerciseResources` output schema、model observation、trace summary 和相关投影测试
  - `tests/agent-tools/search-exercise-resources.test.ts` 或现有最贴近的 tool-level 单测
  - `tests/agent-core/tool-registry-manifest.test.ts` 或等价 manifest / schema summary 测试，如模型可见 schema 或说明有变化
- 禁止影响：
  - Agent core 主循环、`PlannerPort`、Executor、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer、`/api/chat` production route
  - 服务端基于用户原文的关键词、正则、同义词表、短句模板或具体 phrasing 分流
  - `stage-exercise-semantic-retrieval` 的 pgvector / RAG 基础设施范围
