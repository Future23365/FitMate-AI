## Context

生产 `/api/chat` 已迁移到 `LangChain Agent Runtime + DeepSeek native tool_calls`，`searchExerciseResources` 是动作库只读事实查询 tool。当前 tool 已支持结构化 facet 查询、`equipment = "no_equipment"` 的无外部器械兼容映射、多 `muscles` 候选均衡和有限模型可见 summary。

最新 trace 暴露的问题不是数据库没有结果，而是宽泛动作推荐中候选不够低门槛：第一次查询返回了核心候选，但由于排序仍以 `name_asc` 为主，部分主肌群不是腹肌或需要外部条件的动作排在前面，模型继续补 `equipment` / `homeRequirement` 以追求更适合推荐的结果。产品目标不是一次性精确满足所有隐藏偏好，而是先返回几个低门槛、目标肌群更贴近的动作，让用户后续再补充器械、场地或偏好。

## Goals / Non-Goals

**Goals:**

- 让宽泛动作候选查询在未显式指定器械时，内部默认使用现有无外部器械兼容筛选口径，提升第一轮候选可用性。
- 让 `muscles` 查询优先返回请求肌群作为主肌群命中的动作，减少辅助命中动作挤占首屏候选。
- 保留点名动作和受控动作 id 查询的召回优先级，避免默认低门槛策略误伤用户明确对象。
- 保持模型可见 observation 简洁：模型看到候选动作事实，不看到内部默认补出的 `query.equipment`。
- 不修改 LangChain runtime、provider payload、production response adapter 或 `/api/chat` 主链路。

**Non-Goals:**

- 不新增自然语言关键词、正则、同义词表、短句模板或服务端语义分流。
- 不把 `homeRequirement` 自动推断为居家、地面、支撑面或其他场地条件。
- 不新增新的 tool、分页能力、语义搜索能力或动作推荐打分模型。
- 不改变 `submitVisibleTrainingProposal` 的最终数据库动作事实校验。
- 不要求模型通过 prompt 固定少查或固定调用某个终态 tool。

## Decisions

### 1. 在 repository 查询层做内部低门槛默认，而不是改通用 prompt

宽泛候选查询缺少 `equipment` 时，repository 在构造数据库 where 时使用现有无外部器械兼容筛选条件。该默认只影响候选召回，不改变模型可见 schema，也不要求模型显式传入 `equipment = "no_equipment"`。

选择该方案的原因是：问题来自动作候选质量，不是模型缺少一个新的业务 workflow。把默认放在 tool 查询能力内部，比在通用 Agent prompt 中写“用户没说器械就先无器械”更局部，也不会让 runtime 或 `/api/chat` 读取用户自然语言。

替代方案：让模型通过 tool description 自行补 `equipment = "no_equipment"`。该方案会继续增加模型规划负担，也可能再次触发连续查询，因此不采用。

### 2. 复用既有无外部器械兼容映射，不严格匹配单一 `no_equipment`

内部默认必须使用当前 repository 已有的无外部器械兼容逻辑，例如映射到自重或等价无外部器械数据库字段。它不得严格只匹配输入字面值 `no_equipment`，也不得把 `homeRequirement` 当成无器械条件。

选择该方案的原因是：动作库中存在类似垫上动作、地面动作或其他无需外部器械但不一定以单一字段值表达的记录。复用现有兼容映射能保持与显式 `equipment = "no_equipment"` 一致的数据库语义。

替代方案：直接把缺省 `equipment` 写成 `no_equipment` 再走现有 handler。该方案容易污染模型可见 `query`，也会把内部默认误表达成 Planner 显式输入，因此不采用。

### 3. 默认低门槛只作用于宽泛候选查询

内部低门槛默认只在以下条件同时成立时启用：

- 输入没有显式 `equipment`；
- 输入没有 `exerciseNames`；
- 输入没有 `requiredExerciseIds`；
- 输入没有与默认器械口径冲突的显式受控动作锚点。

如果模型已经点名动作或传入受控 `exerciseId`，查询应优先召回这些明确对象，并通过 diagnostics 表达筛选不一致，而不是被默认无外部器械口径过滤掉。

替代方案：所有未传 `equipment` 的查询都默认无外部器械。该方案会误伤点名动作、历史事实复用和未来需要完整动作库候选的合法查询，因此不采用。

### 4. 肌群排序优先主肌群命中，原 `sort` 只做 tie-breaker

当输入包含 `muscles` 时，候选选择和排序应按以下优先级稳定返回：

1. 请求肌群按输入顺序确定优先级；
2. 同一请求肌群内，`primaryMuscles` / `primaryMusclesZh` 命中优先于仅 `secondaryMuscles` / `secondaryMusclesZh` 命中；
3. 同优先级内使用现有 `sort` 和 `id` 做稳定排序；
4. 多肌群查询仍保留代表性覆盖，不允许单一肌群完全挤占其他有候选的请求肌群。

选择该方案的原因是：用户传入 `muscles = ["腹肌"]` 时，最自然的候选应是腹肌主练动作。辅助命中仍可作为补充，但不应排在主练动作前面。

替代方案：新增 `sort = "muscle_priority"`。该方案会扩大模型可见输入合同，并让模型继续纠结排序字段选择；本 change 只改默认候选质量，不新增模型可控排序能力。

### 5. 模型可见 observation 不回显内部默认

内部低门槛默认不得作为 `query.equipment`、`appliedFilters` 中的显式 Planner input 或新的模型可复制字段进入模型可见 observation。模型看到的是当前返回的候选动作事实；服务端 trace 可以记录该内部默认是否生效，供调试复盘。

选择该方案的原因是：把内部默认显式告诉模型会让模型继续围绕未确认条件推理，反而增加补查概率。模型不需要知道服务端如何构造低门槛候选，只需要使用返回的候选事实继续回答或结构化收口。

## Risks / Trade-offs

- [Risk] 内部默认可能减少健身房器械动作的首轮曝光。  
  → Mitigation：只在宽泛候选查询中启用；点名动作、受控 id 和显式 `equipment` 查询不受影响。用户后续明确器械时，显式 `equipment` 覆盖内部默认。

- [Risk] 模型不可见内部默认，调试时难以判断为什么候选偏向低门槛。  
  → Mitigation：trace summary 记录服务端内部默认是否生效，但不把它回灌给模型作为 `query.equipment`。

- [Risk] 主肌群优先排序可能降低原 `name_asc` 的可预测性。  
  → Mitigation：仅在 `muscles` 存在时启用肌群优先；同优先级内继续使用原 `sort` 和 `id` 稳定排序。

- [Risk] 多肌群代表性覆盖与主肌群排序可能冲突。  
  → Mitigation：先按请求肌群桶做代表性覆盖，再在每个桶内优先主肌群命中，避免一个肌群挤占全部候选。

## Migration Plan

1. 为 `searchExerciseResources` 增加 tool-level 回归测试，覆盖宽泛核心动作查询、点名器械动作查询、多肌群查询和模型可见 summary 边界。
2. 在 repository 查询策略中增加内部低门槛默认和肌群优先候选选择。
3. 更新 `searchExerciseResources` 的 trace summary / user projection，如需记录内部默认，只放入非模型可见投影。
4. 运行 `openspec validate prefer-low-friction-exercise-candidates --strict`、相关 tool 单测、catalog / contract gate 测试和 `npm run typecheck`。

## Open Questions

无。
