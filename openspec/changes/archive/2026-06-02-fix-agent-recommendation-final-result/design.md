## Context

当前 `/api/chat` 生产入口已经固定使用 Tool-first Agent。动作推荐链路由模型先调用 `searchExercises(candidateUse="recommendation")` 获取受控候选，再以 `AgentExecutionResult.status="answered"` 结束，Response Writer 根据引用的 `toolResultId` 投影 `exercise_recommendation` 卡片。

本次 trace 的真实失败点不在动作库检索。`searchExercises` 已按 `bodyRegions=["lower_body"]`、`equipment=["弹力带"]`、`level="beginner"`、`avoidances=["跳跃"]` 返回 6 个候选；失败发生在第二轮模型 final result 缺少顶层 `reason` 字段，导致 `parseAgentToolDecision()` 判定 `invalid_decision`，整轮降级为 `model_output_invalid`。

同时，推荐请求里的 `query="臀腿训练"` 是泛化自然语言。结构化筛选字段已经给出了可执行候选边界，`query` 应保留为排序提示，而不是在已有结构化边界时继续成为硬召回条件。

## Goals / Non-Goals

**Goals:**

- 让已检索成功的动作推荐不会因为缺少非语义诊断字段而丢失推荐卡片。
- 保持 `AgentExecutionResult` 的结构校验，不容忍缺少 `result`、非法 `status`、伪造 `toolResultId` 或写入型资源引用。
- 让 recommendation 搜索与 routine / plan 一样，在已有结构化候选边界时不被泛化 `query` 清空候选。
- 让模型可见的 `searchExercises` 工具定义更清楚地列出受控 facet，减少传入数据库不存在筛选项的概率。

**Non-Goals:**

- 不新增服务端关键词识别、同义词匹配或基于用户原文的语义纠偏。
- 不改变动作库数据、embedding 算法、权限隔离或发布态过滤。
- 不把非法 final result 一律伪装成成功；只有 `result` 本身已合法且缺少顶层 `reason` 的情况允许结构容错。
- 不启动 dev server 或引入浏览器验证。

## Decisions

1. 在 Agent decision 解析层补齐缺失的顶层 `reason`。

   `reason` 是运行时解释字段，不参与用户语义、工具引用或写入边界。模型返回的 `result` 已通过 `agentExecutionResultSchema` 时，服务端可以补一个固定诊断原因，例如“模型返回合法终止结果但缺少 reason，runtime 已补齐诊断原因。”。这样不会改变 `result.status`、`replyContext`、`usedToolResultIds` 或任何资源 id。

   备选方案是只加强 prompt，要求模型必须带 `reason`。该方案仍会受模型稳定性影响；而本次字段缺失不涉及业务语义，解析层兜底更稳定。

2. 只对已有结构化边界的可执行搜索降级 `query` 召回门槛。

   `searchExercisesInMemory()` 已经有 `shouldUseQueryAsHybridRecallGate()`。将其适用范围从 `routine` / `plan` 扩展到 `recommendation`：当请求包含 `bodyRegions`、`targetMuscles`、`equipmentRequired`、`equipment`、`allowedSections`、`goal` 或 `sessionMinutes` 等结构化边界时，`query` 只用于排序，不用于过滤掉零分候选。

   没有结构化边界的普通 `answer_only` 或裸 query 搜索继续要求 query 命中，避免过宽召回。

3. 用确定性动作库 facet 摘要增强工具定义。

   `searchExercises` 的模型可见定义可以暴露稳定枚举和常见真实 facet 样例，例如 `bodyRegions`、`allowedSections`、`level`、常用 `equipment` 和下肢肌群。该摘要来自工具合同和动作库字段，不读取用户原文，不做语义判断。

   备选方案是在模型传错 facet 后由服务端根据用户原文重写。该方案违反“LLM 负责语义理解、服务端只校验契约”的边界，不采用。

## Risks / Trade-offs

- [Risk] 补齐 `reason` 可能掩盖其他非法 final result。→ Mitigation：只在 `action="final_result"`、`result` 可通过 `agentExecutionResultSchema`、且仅缺少顶层 `reason` 时补齐；其他解析失败仍失败。
- [Risk] recommendation 搜索降级 query 召回后返回文本相关性较低的动作。→ Mitigation：仅在结构化边界存在时生效，候选仍受 published、equipment、bodyRegions、level、avoidances 等硬过滤限制。
- [Risk] 工具描述过长影响 token。→ Mitigation：只暴露短枚举和常见 facet 样例，不把完整动作库 facets 注入 prompt。
- [Risk] 真实模型仍可能漏字段。→ Mitigation：用单元测试覆盖解析容错和推荐卡片投影；真实黑盒测试作为手动或用户确认后执行。
