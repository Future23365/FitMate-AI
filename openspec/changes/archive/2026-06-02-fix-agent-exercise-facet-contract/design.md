## Context

当前 `/api/chat` 生产主链已迁移到 Tool-first `AgentOrchestrator`。Agent 在生成 routine 或 plan 前需要先通过 `searchExercises` 获取动作候选集合，后续 draft、validation、policy 和 persistence 都依赖该候选集合。

现有 `searchExercises` 工具 Schema 将 `targetMuscles`、`equipment` 定义为自由字符串数组，模型可以输出数据库不存在的筛选值。动作检索服务则按真实动作字段做 hard filter：`targetMuscles` 必须等于 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 或 `secondaryMusclesZh` 中的某个值。结果是用户表达“上肢”时，模型输出 `upper body`，工具无法命中任何动作。

项目约束是：自然语言语义理解由 LLM 完成，服务端不得基于用户原文做关键词、正则或同义词语义重解释。因此修复不能写成“看到用户说上肢就替换成肩胸背臂”，而应让 LLM 输出受控结构化字段，服务端只执行该字段的确定性合同。

## Goals / Non-Goals

**Goals:**

- 让 Agent 动作检索只能使用动作库真实 facet 或受控身体区域枚举。
- 支持 `upper_body`、`lower_body`、`core`、`full_body` 这类高层区域字段，并由服务端确定性展开成真实肌群 facet。
- 当动作检索因未知 facet 返回空候选时，提供结构化诊断，使 Agent 可以 retry 一次，而不是直接阻断 routine 生成。
- 保持服务端不读取用户原文做自然语言语义判断。
- 覆盖真实回归输入“今天想练上肢，30 分钟，有哑铃，帮我安排一套”。

**Non-Goals:**

- 不改数据库 schema。
- 不引入向量库或外部检索服务。
- 不改变动作库事实数据本身。
- 不恢复旧 intent-first、旧 readonly tool loop 或旧 `workoutIntent` 触发链路。

## Decisions

### Decision 1: 新增 `bodyRegions`，不把范围词放进 `targetMuscles`

`searchExercises` 输入新增 `bodyRegions?: Array<"upper_body" | "lower_body" | "core" | "full_body">`。`targetMuscles` 保持为精确动作肌群 facet。Agent prompt 和工具摘要必须说明：当用户说“上肢、下肢、核心、全身”时，应输出 `bodyRegions`；只有用户表达具体肌群时才输出 `targetMuscles`。

取舍：只改 prompt 可能仍让模型输出 `upper body`；直接在服务端根据用户原文改写违反语义边界。新增受控枚举字段能把语义判断留给 LLM，把执行边界留给服务端。

### Decision 2: 服务端通过受控映射展开身体区域

服务端维护稳定映射，例如：

- `upper_body` -> `肩部`、`胸部`、`背阔肌`、`中背部`、`肱二头肌`、`肱三头肌`、`前臂`
- `lower_body` -> `臀部`、`股四头肌`、`腘绳肌`、`小腿`
- `core` -> `腹肌`、`下背部`
- `full_body` -> 不额外收窄肌群，或展开为主要全身肌群集合

映射必须只在工具输入已经包含 `bodyRegions` 时执行。服务端不得检查 latest user message 来推断区域。

### Decision 3: facet 字典进入 Agent 可见工具上下文

工具 registry 摘要为 `searchExercises` 暴露轻量 facet guidance，包括身体区域枚举、常用肌群 facet、常用器械 facet 和规则提示。这里传的是筛选词表，不是完整动作列表。候选动作详情仍通过工具结果返回，避免 token 膨胀。

取舍：动态查询完整 facet 最准确，但每轮都传完整列表会增加 token；首版使用稳定的常用 facet guidance，并在空候选诊断中返回局部可用 facet，后续可再把完整 facet cache 化。

### Decision 4: 空候选失败必须可恢复

`searchExercises` 返回 0 候选时继续使用失败结果，但 failure detail 需要包含：

- `failureReasons`
- `unmatchedTargetMuscles`
- `unmatchedEquipment`
- `suggestedTargetMuscles`
- `suggestedEquipment`
- `retryable`

Agent prompt 需要明确：当 `retryable=true` 且失败原因指向未知 facet 时，应基于诊断重新调用 `searchExercises`；只有 retry 后仍无候选或缺少必要信息时才 `blocked`。

### Decision 5: 测试覆盖服务层和 Agent 决策层

服务层测试直接覆盖 `searchExercisesInMemory` 的 body region 展开和未知 facet 诊断。Agent 层测试使用 deterministic decision provider 或已有测试 harness，断言典型上肢哑铃 routine 请求不会在第一次空候选后直接 `blocked`，而会继续走候选检索和 draft 工具链。

## Risks / Trade-offs

- [Risk] 身体区域映射不完整，导致部分合理动作未进入候选。→ Mitigation：映射以动作库真实 facet 为准，测试覆盖常见上肢、下肢、核心；后续可通过 facet 统计迭代。
- [Risk] 传给模型的 facet guidance 太长。→ Mitigation：只传常用 facet 与规则，不传完整动作库；完整候选仍由工具返回。
- [Risk] Agent 在可恢复失败后仍直接 blocked。→ Mitigation：在 prompt、工具 error detail 和测试中明确 retry 行为。
- [Risk] 服务端映射被误用为自然语言语义规则。→ Mitigation：映射函数只接收结构化 `bodyRegions`，不得接收 latest user message。

## Migration Plan

1. 扩展 `searchExercises` 输入类型、Zod Schema 和执行逻辑。
2. 增加 facet guidance 与 prompt 约束。
3. 增强空候选 diagnostics 和 trace error detail。
4. 更新或新增测试。
5. 运行 `npm test` 和 `npm run typecheck`。

回滚时可移除 `bodyRegions` 输入和 retry guidance，恢复原工具 Schema；不涉及数据迁移。

## Open Questions

暂无需要产品确认的问题；首版身体区域映射以当前动作库真实 facet 和本次故障场景为准。
