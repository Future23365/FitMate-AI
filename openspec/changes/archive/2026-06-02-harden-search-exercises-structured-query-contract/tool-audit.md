# Agent 工具能力审计

审计时间：2026-06-02 17:43:46 CST

## Definition of Done

本 change 的完成标准是：复杂 Agent tool 必须声明 `AgentToolCapabilityContract`；模型可见摘要必须来自同一份合同；执行型 ToolRequest 必须能表达 `operation`、hard constraints、soft preferences、result requirements 和 projection；成功 ToolResult 必须返回 `satisfied=true` 和可追踪 evidence；不能满足时必须返回结构化失败，后续工具不得消费未满足的资源。

## 工具能力边界

| tool | 严格 operation | 不能执行的 operation | 输入表达缺口与风险 | 本次处理 |
| --- | --- | --- | --- | --- |
| `listRecentArtifacts` | list recent artifacts | 唯一引用解析、payload 读取、语义改写 | 只能列候选，不能证明“上一套”唯一 | 保留 list 能力合同，产出 candidate set |
| `searchArtifacts` | structured artifact candidate search | 唯一引用解析、payload 读取 | 多候选时旧链路容易被模型静默挑选 | 明确 candidate search，引用解析交给 `resolveArtifactReference` |
| `resolveArtifactReference` | `resolve_artifact_reference` | payload 读取、动作搜索 | 需要证明引用唯一，否则后续读取会绑定错 artifact | 新增工具；多候选返回 `ambiguous_resource` |
| `getArtifactPayload` | exact artifact payload read | 语义搜索、候选选择 | 只能读取指定 id，不承担引用理解 | 保留 exact read 合同和 allowed ids 边界 |
| `getExerciseById` | exact exercise read | 动作搜索、替换建议 | 只能读取数据库真实动作 | 保留 exact read 合同 |
| `searchExercises` | `build_exercise_candidate_set` | 训练生成、自然语言 hard filter 推导 | 旧 `query` 容易承载“无器械”等 hard constraints，却无法证明满足 | 新增结构化 filters/resultRequirements/candidateSetEvidence |
| `getUserMemory` | memory snapshot | 精确 memory query | snapshot 只能做背景，不证明查询覆盖 | 保留 snapshot 合同 |
| `queryUserMemory` | `query_user_memory` | snapshot 汇总、语义解释 | 需要按 kind/status/source 等字段返回覆盖诊断 | 新增工具；无匹配返回 `unverifiable_result` |
| `proposeWorkoutEditPlan` | edit plan compile | 从自然语言二次推导 patch 语义 | 服务端不能关键词纠偏用户语义 | 保留结构化 edit plan 登记和资源引用 |
| `generateRoutineDraft` | candidate set to routine draft | 跨候选集合补动作、声明未证明约束 | 旧补动作可能从全量库越过搜索 hard filters | 改为只消费 satisfied candidate set；缺阶段失败 |
| `generatePlanDraft` | candidate set to plan draft | 跨候选集合扩展计划 | 长期计划展开不能绕过候选证据 | 改为绑定 satisfied candidate set |
| `proposeWorkoutPatch` | patch compile | 从候选外替换动作 | replacement 可能违背“无器械”等 hard filters | replacement 必须来自同一 candidate set |
| `validateRoutineDraft` / `validatePlanDraft` / `validateWorkoutPatch` | validation | 自动补齐候选、放宽 hard filters | Validator 不能把未证明候选当 warning 放过 | 新增 query boundary 和 result requirement hard fail |
| `evaluatePolicy` | policy check | 补齐 draft/validation/payload | Policy 只评估已登记资源 | 只接受已满足资源引用 |
| `saveConversationArtifactRevision` | persistence | 保存未校验或未证明资源 | 保存必须绑定 validation/policy 和 satisfied 上游结果 | 只保存已登记、已校验、可证明的资源 |
| `askClarification` | clarification | 执行查询、生成训练 | 只生成澄清问题 | 保留澄清合同 |

## LLM 期望结果对照

| tool | LLM 可能想要的结果 | 当前 schema 是否能表达 | 本次结论 |
| --- | --- | --- | --- |
| `searchExercises` | “换一套没有器械的训练候选，并证明不含器械动作” | 旧 schema 只能部分表达，`query` 不可作为 hard constraint | 通过 `filters.homeRequirements/equipment` 和 `candidateSetEvidence` 表达 |
| `searchArtifacts` | “找到上一套训练” | 只能搜候选，不能证明唯一 | 不再承担唯一解析 |
| `getUserMemory` | “查用户是否确认过无器械偏好” | snapshot 不能证明查询覆盖 | 交给 `queryUserMemory` |
| `generateRoutineDraft` | “用这些候选生成完整 routine，并保留用户指定动作” | 旧输入可表达候选 id，但不能证明候选集合来源满足合同 | 必须引用 satisfied candidate set |
| `proposeWorkoutPatch` | “把哑铃动作换成自重动作” | 可表达 patch，但 replacement 来源旧边界不够硬 | 必须引用 satisfied candidate set |
| `validateRoutineDraft` | “确认 routine 没有越过无器械候选边界” | 旧 validator 只校验 id 和训练结构 | 新增 candidate query boundary hard fail |
| `saveConversationArtifactRevision` | “保存已通过校验的训练卡片” | 可表达 validation/policy 引用 | 额外要求上游 ToolResult 可证明 satisfied |

## 必须新增或拆分的能力

- 新增 `resolveArtifactReference`，把唯一引用解析从 `searchArtifacts` 中拆出。
- 新增 `queryUserMemory`，把精确 memory query 从 `getUserMemory` snapshot 中拆出。
- 升级 `searchExercises` 为结构化候选集合构建工具，执行型请求必须传 `operation="build_exercise_candidate_set"`、`filters` 和必要 `resultRequirements`。
