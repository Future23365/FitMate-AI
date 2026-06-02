## Context

当前 `/api/chat` 生产链已经收敛到 Tool-first `AgentOrchestrator`。动作库相关只读能力主要是 `searchExercises` 和 `getExerciseById`：前者面向候选集合检索，后者要求已知 `exerciseId`。用户问“数据库有多少个动作”或“某某动作怎么做”时，这两类工具都不能直接表达请求：统计问题缺少总量读取工具，按名称查详情也缺少确定性名称解析工具。

现有动作服务已经能从 PostgreSQL 读取全量动作并在列表查询中返回 `total`，但该能力没有进入 Agent registry。动作详情记录中已有 `instructionsZh`、`imageUrls`、`equipmentZh`、`primaryMusclesZh` 等事实字段，适合用于“怎么做”的解释型回答。

## Goals / Non-Goals

**Goals:**

- 为 Agent 增加动作库统计和按名称读取动作详情的只读事实工具。
- 让“目前数据库有多少动作”“动作库有多少发布动作”等统计问题得到数据库事实回答。
- 让“俯卧撑怎么做”“Pushups 怎么做”等动作详情问题先解析动作库记录，再基于数据库步骤给出中文说明，并允许 LLM 做表达润色。
- 区分统计/详情问答与动作推荐、训练生成、Patch、保存链路，避免只读问答误触发训练卡片或失败兜底。
- 补充 trace、tool result、Response Writer 和测试边界，保证回答可回溯到本轮 tool result。

**Non-Goals:**

- 不新增动作表字段、迁移或动作数据 seed 规则。
- 不改变动作推荐、routine、plan、patch 的执行型候选集合合同。
- 不新增前端动作详情抽屉或卡片 UI。
- 不允许服务端通过关键词、正则或同义词表解释用户原文并改写高层语义。
- 不把 LLM 润色结果作为新的事实来源或持久化内容。

## Decisions

### 1. 新增专用只读工具，而不是让 `searchExercises` 承担统计和详情问答

新增或等价拆分：

- `getExerciseLibrarySummary`：读取动作库总量、发布态数量、基础 facet 计数和统计更新时间摘要。
- `resolveExerciseByName`：按模型传入的结构化 `name` / `localeHint` / `requireUnique` / `limit` 在动作库字段中解析候选，返回唯一命中、歧义候选或未找到诊断。
- `getExerciseDetailByName` 或 `resolveExerciseByName` + `getExerciseById`：读取完整动作详情摘要，供最终回答使用。

取舍：复用 `searchExercises` 能少加工具，但会把“找候选动作”和“查某个动作事实”混在一起，继续放大 candidateUse、resultRequirements 和执行型链路误判风险。专用工具更清晰，也更容易测试统计、歧义和详情回答。

### 2. 名称解析只执行结构化动作库匹配，不做服务端自然语言意图判断

`resolveExerciseByName` 只使用 LLM 已提交的结构化名称字段，与动作库中的 `nameZh`、`nameEn`、`id`、`sourceId` 或可公开别名字段做确定性匹配和排序。工具可以返回多个候选并要求澄清，但不得从完整用户原文里用关键词推断用户想查哪个动作。

取舍：这要求模型先把“某某动作怎么做”中的动作名放进工具输入，但符合项目“LLM 负责语义理解，服务端只做确定性合同校验”的边界。

### 3. 动作详情回答以 `answered` 收口，LLM 润色只基于 tool result

动作详情工具返回结构化事实摘要：动作名、英文名、器械、目标肌群、难度、数据库步骤、图片列表和安全/禁忌摘要。Agent 最终返回 `answered`，`usedToolResultIds` 必须引用对应只读工具结果。LLM 可把步骤改写成更易读的中文教练式说明，但具体动作流程、器械、肌群和注意事项必须来自工具结果。

取舍：不使用 `completed_operation`，因为这不是写操作或受控操作完成，而是只读问答；不生成 artifact，避免把单个动作详情误当作推荐卡片。

### 4. Response Writer 保留失败诊断，但调整只读问答失败的用户文案

当动作库统计或动作详情工具失败时，Agent 应返回 `blocked`、`needs_clarification` 或 `answered` 解释原因。若最终仍落到 `failed`，Response Writer 不应固定说“没有生成或修改训练结果”，而应基于失败上下文表达“这次动作库查询没有完成”或更具体的只读失败说明。

取舍：这不是把失败改成成功，而是避免训练生成语义污染普通只读问答。

## Risks / Trade-offs

- [Risk] 动作名称歧义，例如“划船”可能对应多个动作。→ Mitigation：名称解析工具必须支持 `requireUnique`，不唯一时返回候选摘要并让 Agent 追问。
- [Risk] LLM 润色时编造数据库没有的步骤。→ Mitigation：最终回答的具体步骤必须能映射到工具结果的 `instructionsZh`，测试覆盖“不得引入不存在动作或步骤”。
- [Risk] 工具数量增加导致 prompt token 增长。→ Mitigation：模型可见 schema 摘要只暴露必要字段，统计/详情工具不携带完整动作列表。
- [Risk] 统计数字与运行中数据库不一致。→ Mitigation：统计工具直接读取当前 PostgreSQL，不使用静态 seed 数或历史记忆作为事实。
- [Risk] 详情问答被误投影成推荐卡片。→ Mitigation：工具结果标记为 `exercise_detail` / `library_summary`，不产生 `candidate_set`，聊天 artifact 投影只消费 recommendation 用途候选集合。
