## 1. 资源合同与类型

- [ ] 1.1 在 Agent runtime 合同中定义可消费资源、诊断资源和 partial resource 的稳定类型与摘要字段。
- [ ] 1.2 调整 `AgentToolResultRecord` 或等价内部结构，使 tool result 能表达 `consumable`、`diagnostic`、`partial`、`feedback` 等资源角色。
- [ ] 1.3 更新资源收集逻辑，将 `availableResources` 拆分为可用于后续工具依赖的资源和仅可用于解释/澄清的诊断资源。
- [ ] 1.4 补充类型注释，说明资源角色在 Agent loop、工具依赖、final result 和 Response Writer 中的业务边界。

## 2. Runtime 引用校验与澄清收口

- [ ] 2.1 重构 `validateFinalResultReferences()`，按 `generated`、`patched`、`completed_operation`、`answered`、`blocked`、`failed`、`needs_clarification` 分层校验引用。
- [ ] 2.2 保持写入类终止结果只接受可消费 producer，禁止 failed、partial 或 feedback tool result 冒充成功依赖。
- [ ] 2.3 允许 `answered`、`blocked`、`failed`、`needs_clarification` 引用本轮已登记诊断型 tool result 作为说明证据。
- [ ] 2.4 实现 `askClarification` 成功后的 `needs_clarification` runtime 投影，保留 `question`、`assistantSuggestions` 和 `blockingReasons`。
- [ ] 2.5 处理模型把澄清结果包装为 `answered` 的情况，确保用户看到澄清问题而不是 `model_output_invalid`。
- [ ] 2.6 更新 Response Writer 和 projection validation，使诊断引用可以展示为引用证据但不被当作 artifact / revision 成功证明。

## 3. searchExercises partial candidate 合同

- [ ] 3.1 调整 `searchExercises` 工具执行逻辑：候选非空但 `resultRequirements` 未满足时返回 partial candidate 诊断，而不是只返回不可消费失败。
- [ ] 3.2 在 partial 输出中保留 `candidateSetId`、候选摘要、`resultRequirementProof`、`unmetResultRequirements` 和恢复建议。
- [ ] 3.3 确保 partial candidate set 不进入可消费 candidate set registry。
- [ ] 3.4 调整 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和相关 validation 工具，引用 partial candidate set 时返回结构化依赖失败。
- [ ] 3.5 更新 trace summary，使 partial candidate 的候选数量、缺失 section 和诊断角色可读。

## 4. Routine 器械与 section 边界

- [ ] 4.1 修正 routine 请求中的器械约束解释：默认把用户可用器械作为 `training` 主训练候选边界，不默认压到 warmup / stretch。
- [ ] 4.2 支持 warmup / stretch 使用无器械或受控补充候选补足三段式结构，并把补充动作纳入 candidate evidence。
- [ ] 4.3 保留用户明确“全程使用指定器械”时的硬约束，无法满足时返回 `needs_clarification` 或 `blocked`。
- [ ] 4.4 确保补充候选仍来自数据库，并在 validation 中证明 routine 动作属于原始候选或受控补充候选。

## 5. Routine / plan 防逃逸

- [ ] 5.1 在 runtime 中识别本轮是否已经进入 routine、plan 或 patch 执行型工具链。
- [ ] 5.2 当本轮已生成 draft、已通过 validation / policy 或已进入 save 前状态时，拒绝模型用普通 `answered` 声称已生成、已修改或稍后展示训练结果。
- [ ] 5.3 当 routine / plan 候选不足或 partial 时，引导模型返回 `needs_clarification`、`blocked` 或 `failed`，而不是自由文本训练编排。
- [ ] 5.4 保持普通动作讲解、非执行问答和推荐场景仍可合法使用 `answered`。

## 6. Prompt、模型输入与 Trace

- [ ] 6.1 更新 `agent_tool_decision` prompt，明确 `consumable` 与 `diagnostic` 的区别，以及 failed / partial 只能用于解释、澄清或阻断。
- [ ] 6.2 更新 `agent_final_result` prompt，要求 `askClarification` 后以 `needs_clarification` 收口，并禁止 routine / plan 链路用 `answered` 冒充生成。
- [ ] 6.3 更新 Agent decision model input，向模型暴露可消费资源、诊断资源、partial candidate 摘要和最近澄清工具结果。
- [ ] 6.4 更新 `/dev/ai-traces` view model 或诊断摘要，展示资源角色、partial candidate、澄清投影和防逃逸拒绝原因。
- [ ] 6.5 更新手动 LLM 黑盒 runner 的诊断字段，使报告能区分 `failed`、`partial`、`needs_clarification`、`model_output_invalid` 和 routine 防逃逸。

## 7. 测试与验证

- [ ] 7.1 补充 Agent runtime 单测：failed / partial tool result 可被 `needs_clarification`、`blocked`、`failed` 引用，但不能被 `generated` 消费。
- [ ] 7.2 补充 `askClarification` 单测：工具成功后稳定投影 `needs_clarification`，并保留建议按钮。
- [ ] 7.3 补充 `searchExercises` / exercise-service 单测：候选非空但缺 warmup / stretch 时返回 partial 诊断，且 partial 不可用于 draft。
- [ ] 7.4 补充 routine 工具链单测：上肢哑铃 30 分钟请求不再因 warmup / stretch 缺哑铃动作退成 `model_output_invalid`。
- [ ] 7.5 补充 routine 防逃逸单测：draft 或 policy 已成功后，模型返回 `answered` 声称已生成时被拒绝或进入 repair。
- [ ] 7.6 补充 Response Writer / chat-service 测试，确认诊断引用不会推送错误 artifact，澄清结果不会输出通用失败文案。
- [ ] 7.7 运行 `npm test` 或相关测试子集，覆盖 Agent runtime、exercise-service、chat-service 和 Response Writer。
- [ ] 7.8 运行 `npm run typecheck`。
- [ ] 7.9 运行 `openspec validate stabilize-agent-runtime-resource-contract --strict`。
- [ ] 7.10 按需运行不触发真实模型费用的黑盒 fixture / runner 子集，验证报告能读取 partial、diagnostic 和 clarification 证据。
