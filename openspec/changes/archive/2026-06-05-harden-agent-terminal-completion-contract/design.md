## Context

当前 `/api/chat` 生产链路使用 `AgentAction` 作为 Planner 输出合同，runtime 会在 Action Validator 通过后将 `final_answer` 视为当前 run 的终态。现有校验已经覆盖 `usedToolResultIds` 存在性、failed / unsatisfied tool result 不能支撑成功 `final_answer`、diagnostic resource 不能支撑成功 `final_answer`，也已经覆盖 `visibleTrainingProposal` 的结构化 terminal output 校验。

这次 trace 暴露的是另一个边界：Planner 已经执行过 tool 并看到事实不足，却返回没有 `usedToolResultIds`、没有 `usedResourceRefs`、没有 `visibleOutputs` 的成功 `final_answer`，正文还承诺后续需要继续查询。Action Validator 当前不会把这种“工具执行后的无 grounding 成功终态”当作非法 action，因此 Response Renderer 正常输出 content / done，事实桥也因为没有 `visibleOutputs` 跳过保存。

## Goals / Non-Goals

**Goals:**

- 把 `final_answer` 明确为当前 run 的终态完成 / 阻断 / 失败收口动作，而不是“稍后继续”的中间状态。
- 在 tool 已执行后，要求成功 `final_answer` 具备当前 run 内可校验 grounding：`usedToolResultIds`、`usedResourceRefs` 或 `visibleOutputs[]`。
- 保留普通文本聊天：没有 tool result 的基础问答仍允许直接自然语言 `final_answer`。
- 让模型实际可见的 prompt、tool manifest 和 observation 都表达同一个终态合同。
- 用 tests 覆盖原始失败类别和等价语义变体，避免只修当前 phrasing。

**Non-Goals:**

- 不新增业务 tool，不恢复 `generatePlanDraft` / `generateRoutineDraft`。
- 不修改 `/api/chat` 请求 / 响应外部契约。
- 不修改 `PlannerPort`、Executor 主流程、Policy Guard 主流程或 Response Renderer 主流程。
- 不通过用户原文关键词、正则、同义词表、短句模板或具体 phrasing 改写模型的 action、toolName、调用顺序或 `payload.kind`。
- 不让服务端自动选择 warmup / stretch 动作，也不把训练编排逻辑下沉到 tool handler。

## Decisions

### 1. 将问题归类为 core contract 变更

选择：在 `Action Validator` 的 terminal action 校验中新增通用 grounding 兜底：当当前 run 已有 tool result，成功 `final_answer` 不能同时缺少 `usedToolResultIds`、`usedResourceRefs` 和 `visibleOutputs[]`。

理由：该问题不是 `inspectVisibleTrainingProposals` 或 `searchExerciseResources` 的 handler bug，而是所有 tool-calling 链路都可能出现的“执行过 tool 后无引用成功收口”漏洞。已有架构文档也要求 `final_answer` 基于 satisfied tool result 或 consumable resource。

替代方案：

- 只改 prompt：风险是模型仍可能输出空 grounding `final_answer`，runtime 继续成功投影。
- 在业务 tool observation 中写固定下一步：会把单个业务流程写成模型固定流程，且无法覆盖其他 tool。
- 在 `/api/chat` 根据正文“请稍等”做拦截：违反服务端不读用户自然语言做语义分流的边界。

### 2. grounding guard 只使用结构化 action 和当前 run 状态

选择：guard 只读取 `action.type`、`toolResults.length`、`visibleOutputs.length`、`usedToolResultIds.length` 和 `usedResourceRefs.length`，不读取用户输入、assistant 正文或具体 `toolName`。

理由：这能修复终态合同漏洞，同时保持服务端只校验结构、resource 和 grounding，不判断自然语言语义。

细节：

- 没有 tool result 的普通 `final_answer` 继续允许。
- 有 `visibleOutputs[]` 时继续走业务 terminal output validator。
- 有 `usedToolResultIds` 时继续沿用现有 satisfied 校验。
- 有 `usedResourceRefs` 时继续沿用现有 resource role 校验。
- 如果全部为空，返回可 repair 的 `terminal_reference_invalid` 或等价稳定错误，repair feedback 说明如何合法收口或继续 tool_call。

### 3. Prompt 说明终态语义，不写固定业务流程

选择：默认 Agent prompt 补充 `final_answer` 是当前 run 终态；如果还需要 tool 事实，必须继续 `tool_call`；不能用 `content` 承诺尚未执行的查询、生成、保存或异步继续。

理由：模型必须在首轮可见输入里看到终态合同，而不是只依赖 validation failure 的 repair。

边界：

- 通用 prompt 不写“必须调用 `searchExerciseResources`”。
- 业务 tool 的能力边界留在各自 manifest / observation。
- 技术标识保持英文，描述性自然语言使用中文。

### 4. 业务 tool 只补事实边界和终态边界

选择：`inspectVisibleTrainingProposals` 说明 read/import 只导入当前 run 可消费事实，不代表最终方案已生成；`searchExerciseResources` 说明查询结果只提供动作事实，最终结构仍由 `final_answer.visibleOutputs[]` 或 grounded terminal action 承载。

理由：这能帮助模型区分“事实已获得”和“最终训练输出已完成”，但不把业务 tool 升格为隐藏编排器。

### 5. 回归测试覆盖类别而不是当前短句

选择：使用 ReplayPlanner 覆盖原始失败类别和至少一个等价表达。测试允许出现具体用户输入和 tool 结果，但这些只能作为测试样例，不进入生产规则。

需要覆盖：

- 有 tool result 后空 grounding `final_answer` 被 Action Validator 拒绝。
- 普通无 tool 问答 `final_answer` 仍合法。
- 生产聊天中 `read_recent -> 空 grounding final_answer` 进入 repair，不提前渲染“请稍等”正文。
- repair 后模型可继续查询缺失 section 并输出合法 visible output，或明确失败收口。
- architecture scan 证明没有新增关键词分流、phrasing 特判或具体业务 `toolName` 语义分支。

## Risks / Trade-offs

- [Risk] 某些事实查询后的普通解释回答以前没有显式 `usedToolResultIds`，新 guard 会要求模型补 grounding。
  → Mitigation：prompt 和 repair feedback 明确说明查询后普通回答应使用 `usedToolResultIds`；补生产聊天回归覆盖 0 条查询和普通事实回答。

- [Risk] 过度收紧会影响没有 tool 的基础聊天。
  → Mitigation：guard 只在当前 run 存在 tool result 时触发，不影响空 tool result 的 `final_answer`。

- [Risk] 模型 repair 后仍重复输出空 grounding `final_answer`。
  → Mitigation：沿用现有 repair budget 和 terminal failure fallback，确保不会成功投影不可验证结果；测试覆盖 repair exhausted 安全收口。

- [Risk] 将业务 tool 名写进 core 造成耦合。
  → Mitigation：core guard 不依赖 `toolName`、resource type 或用户原文；业务名只出现在 tool manifest / observation / tests。

## Migration Plan

本 change 不涉及数据库迁移、数据回填或外部 API 迁移。实现可按以下顺序落地：

1. 更新 OpenSpec specs / tasks 并通过 strict validate。
2. 补 core validator 测试，先复现空 grounding terminal action。
3. 更新 Action Validator 通用 guard 和 repair feedback。
4. 更新默认 prompt 和业务 tool 模型可见说明。
5. 补生产聊天 replay 回归和 architecture scan。
6. 运行相关自动化测试和 `npm run typecheck`。

回滚策略：若新 guard 导致生产中过多合法回答被拒绝，可临时回滚 Action Validator guard；prompt/tool 说明仍可保留为模型能力强化，但最终上线应以测试修正合法 grounding 输出为目标，不长期放宽终态合同。

## Open Questions

- 是否需要为 `ask_user` 也增加“有 tool result 后必须 grounding”的强制规则？本 change 暂不强制，因为 `ask_user` 常用于未满足、诊断或澄清收口，现有 resource / tool result 存在性校验已经覆盖显式引用。
- 生产 fallback 文案是否需要新增专门分类，例如 `terminal_completion_grounding_fallback`？实现阶段可优先复用现有 terminal validation fallback；只有用户体验或 trace 分类需要时再新增稳定 projection type。
