## 分阶段执行约定

本 change 保持单一 OpenSpec 架构合同，不拆成多个独立 change。实现可以按多个 Codex 窗口分阶段推进，每个阶段必须完成对应代码、测试、`tasks.md` 状态更新和一次独立 commit。

任一阶段都不得长期保留新旧双主链。兼容字段只能由 `LegacyChatEventAdapter` 从 `AgentExecutionResult` 单向派生，不得继续参与工具选择、artifact 生成、patch、保存或最终回复决策。

切换 `/api/chat` 生产主链前，必须已完成 Agent 契约、tool registry、关键读写工具、Agent loop、Response Writer 和基础回归测试。切换后应尽快删除或废弃旧 intent-first 主路径，避免双主链成为新的长期架构。

## 分阶段边界与验收

### Phase 1：契约与运行时骨架

目标：建立 Agent 主链的类型、上下文、结果、工具注册和错误边界，不切换 `/api/chat` 生产主链。

范围：完成 1.x，并为 7.1、7.2、7.2.1 中与契约、context builder、registry 基础边界相关的测试打底。

完成标准：

- `AgentContextBuilder`、`ContextPackage`、`AgentExecutionState`、`AgentExecutionResult`、`AgentDependencyGraph`、`AgentToolRegistry` 和错误/blocked/checkpoint 合同已定义。
- `LegacyChatEventAdapter` 只声明单向兼容边界和退出条件，不反向驱动任何执行决策。
- Agent contract、context builder、registry 基础测试可运行。
- `openspec validate replace-chat-orchestrator-with-tool-first-agent --strict` 通过。

禁止事项：

- 不得删除旧 intent-first 主链。
- 不得让 `/api/chat` 生产路径依赖半成品 Agent 结果。
- 不得新增基于用户原始文本的服务端语义纠偏。

### Phase 2：只读工具与 registry 边界

目标：先把只读工具纳入统一 registry，稳定工具注册、权限、Schema、tool result id、失败返回和 trace 摘要边界。

范围：完成 2.1、2.2、2.6 中只读工具相关部分，以及 2.8 的 registry 合同校验基础。

完成标准：

- `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises`、`listRecentArtifacts`、`getUserMemory` 或等价只读工具已通过统一 registry 暴露。
- 每个只读工具都有 userId/sessionId 权限隔离、Zod 输入 Schema、输出摘要、失败码和 trace 摘要。
- registry 测试覆盖未知工具、非法参数、越权 artifact、tool result id 登记和工具注册合同缺失。

禁止事项：

- 不得在本阶段新增可持久化写工具。
- 不得让只读工具直接触发 artifact、patch 或回复承诺。

### Phase 3：训练生成、Patch 与写入前置工具

目标：把训练生成、Patch、Validator、Policy 和 artifact revision 保存串成受控工具闭环。

范围：完成 2.3 至 2.7、2.8 中写工具合同部分，以及 4.x。

完成标准：

- `proposeWorkoutEditPlan`、`generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch`、`askClarification`、`validateRoutineDraft`、`validatePlanDraft`、`validateWorkoutPatch`、`evaluatePolicy` 和 `saveConversationArtifactRevision` 或等价工具已接入 registry。
- 写工具必须引用合法 `draftId` / `patchId`、`candidateSetId`、`validationId`、`policyDecisionId` 和必要 `confirmationId` 后才能保存。
- routine / plan / patch 生成复用 DomainPlanEngine、候选集合、时长估算、Validator、Policy 和 validation recovery。
- Patch replacementExerciseId 来自当前 run 的 candidateSetId 和数据库，Patch target 来自真实 artifact payload。

禁止事项：

- 不得把 summary + 用户原文交给大模型自由生成可保存训练。
- 不得允许裸用户原句 query 作为可执行候选集合来源。
- 不得绕过候选集合、Validator、Policy 或权限隔离保存 revision。

### Phase 4：Agent loop、Response Writer、Trace 与 Prompt 迁移

目标：形成可测试的新 Agent 主链能力，但暂不急于切换 `/api/chat` 生产入口。

范围：完成 3.1、3.2、5.x、6.x，并补齐 7.x 中与 loop、Response Writer、trace、prompt/token budget 相关的自动化测试。

完成标准：

- `runAgentOrchestrator` 可执行 tool decision、工具调用、tool result 登记、dependency graph 更新、checkpoint/replay 和终止结果生成。
- Response Writer 只基于 `AgentExecutionResult` 投影回复，不重新解释用户语义，不承诺未执行写操作。
- AiRunTrace 可记录 ContextPackage、tool decision、tool result id、dependency graph、validator gate、policy gate、persistence、legacy path skip 和 final result。
- Agent tool decision、final result、Response Writer prompt module 和 token budget stage 已迁移到新观测合同。

禁止事项：

- 不得让 `conversationSummary`、旧 resolved intent 或旧 prompt module 继续作为执行事实源。
- 不得让 Response Writer 重新决定是否生成、patch、保存或澄清。

### Phase 5：切换 `/api/chat` 生产主链

目标：将 `/api/chat` 生产主链从 intent-first orchestrator 切换为 AgentOrchestrator，并保持前端消费合同稳定。

范围：完成 3.3、3.5、3.6，并覆盖 7.3、7.10、7.17 中与生产主链和流事件兼容相关的测试。

完成标准：

- `/api/chat` 生产主链由 AgentOrchestrator 驱动。
- 前端仍可消费稳定 stream event、artifact、patch、`assistantSuggestions` 和 done metadata。
- `assistant_action`、resolved intent、`workoutIntent` 只能由兼容 adapter 派生。
- 关闭旧兼容字段的测试路径仍能表达 artifact、patch、clarification、blocked 和 failed。
- 已运行 chat service、readonly tools、workout patch、conversation artifact 相关测试；如未执行真实模型黑盒测试，必须说明成本、环境和替代验证范围。

禁止事项：

- 不得让旧 intent-first 分支继续触发工具、卡片、artifact 生成、patch 或写入。
- 不得为了兼容前端而让旧字段重新成为事实源。

### Phase 6：旧路径清理、黑盒迁移与文档收尾

目标：删除或明确废弃旧 intent-first 主路径，迁移黑盒诊断和文档，完成 change 收尾。

范围：完成 3.4、7.4 至 7.16、8.x。

完成标准：

- 旧服务端高层语义 normalize、关键词 gate、ReferenceResolver-first 主路径、只读 tool loop 触发矩阵、pending replacement 字符串改写、旧 prompt module 主链依赖和 summary-only 上下文文档描述已删除或明确废弃。
- manual LLM 黑盒 runner、fixture expectation 和报告格式已改为优先记录用户可见闭环、AgentExecutionResult、tool dependency graph、artifact/patch/suggestion 事件和 legacy path skip。
- `docs/architecture.md`、`docs/chat-push-flow.md`、`docs/方案变更历史` 和 `docs/项目演变历程.md` 已同步记录 Tool-first AgentOrchestrator 主链。
- `npm run test -- tests/chat-service.test.ts tests/readonly-tools.test.ts tests/workout-patch-chat-service.test.ts tests/conversation-artifact-service.test.ts` 或对应更新后的测试集合通过。
- `npm run typecheck` 和 `openspec validate replace-chat-orchestrator-with-tool-first-agent --strict` 通过。

禁止事项：

- 不得为适配新诊断结构重写历史黑盒业务 flow 的用户输入和业务期望。
- 不得把兼容字段当作新黑盒验收的核心事实源。

## 1. 契约与模块边界

- [x] 1.1 新增 `lib/server/agent-orchestrator` 模块，定义 `AgentContextBuilder`、`ContextPackage`、`ContextProvenance`、`AgentExecutionState`、`AgentExecutionResult`、`AgentDependencyGraph` 和核心类型注释。
- [x] 1.2 定义统一 `AgentToolRegistry` 接口，覆盖工具名称、描述、读写级别、Zod 输入 Schema、输出摘要、trace 摘要、幂等 key、前置依赖和执行函数。
- [x] 1.3 定义 Agent tool decision / final result 的 Structured Outputs Schema，确保模型只能选择注册工具或返回合法终止结果。
- [x] 1.4 定义 `WorkoutEditPlan` / `WorkoutEditIntent`，覆盖目标 artifact、保留项、变更项、影响范围、策略、候选集合依赖和确认级别。
- [x] 1.5 定义工具错误码、step limit、timeout、checkpoint/resume、失败恢复、blocked 状态和硬失败分类。
- [x] 1.6 定义 `LegacyChatEventAdapter` 单向兼容层和旧 `assistant_action` / resolved intent 退出条件。
- [x] 1.7 定义通用 `completed_operation` AgentExecutionResult 分支，用于表达非训练 artifact 的受控写操作结果，并约束 operation 摘要、operationResultId、policyDecisionId、confirmationId 和 Response Writer 可见字段。

## 2. 工具注册与服务端硬边界

- [x] 2.1 将现有 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises` 迁入统一 Agent registry。
- [x] 2.2 新增 `listRecentArtifacts`、`getUserMemory` 或等价读工具，支持 Agent 主动查询当前会话事实。
- [x] 2.3 新增 `proposeWorkoutEditPlan`、`generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和 `askClarification` 工具，保持输出 Schema 可校验。
- [x] 2.4 新增 `validateRoutineDraft`、`validatePlanDraft`、`validateWorkoutPatch` 和 `evaluatePolicy` 工具，复用现有 Validator / Policy。
- [x] 2.5 新增 `saveConversationArtifactRevision` 或等价写工具，要求引用 draftId/patchId、candidateSetId、validationId、policyDecisionId 和必要 confirmationId 后才能保存。
- [x] 2.6 为所有工具补充 userId/sessionId 权限隔离、候选集合边界、tool result id 依赖、失败返回和 trace 摘要测试。
- [x] 2.7 确保生成工具复用 DomainPlanEngine、候选集合、时长估算、Validator、Policy 和 validation recovery，不退化为 summary + 用户原文的大模型自由生成。
- [x] 2.8 为 AgentToolRegistry 增加领域能力合同校验，要求新增写工具声明 OpenSpec 归属、可写资源、字段白名单、Schema、权限、确认、持久化、幂等 key、trace 摘要和 Response Writer 安全摘要。

## 3. Agent Loop 与 /api/chat 主链替换

- [x] 3.1 实现 `runAgentOrchestrator`，循环执行模型 tool decision、工具调用、工具结果登记、依赖图更新和下一步决策。
- [x] 3.2 实现 Agent loop 的完成条件：answered、needs_clarification、generated、patched、failed、blocked，并保存 checkpoint/replay 摘要。
- [x] 3.3 将 `/api/chat` 生产主链切换到 AgentOrchestrator，旧 resolved intent、`assistant_action` 和 `workoutIntent` 只从 Agent 结果派生兼容事件。
- [x] 3.4 删除或废弃旧服务端高层语义 normalize、关键词 gate、ReferenceResolver-first 触发矩阵、只读 tool loop 触发矩阵、pending replacement 字符串改写和黑盒补丁型 intent 纠偏。
- [x] 3.5 确保前端继续消费稳定流事件、artifact、patch、`assistantSuggestions` 和 done metadata，不参与 Agent 决策。
- [x] 3.6 为旧兼容事件提供关闭开关或测试路径，验证移除旧字段后主链仍通过。

## 4. 动作查询、生成、Patch 与保存闭环

- [x] 4.1 调整动作查询工具，支持 `equipmentRequired`、`equipmentAvoided`、`targetMuscles`、`level`、`sessionMinutes`、`preferences` 和 `avoidances` 结构化过滤。
- [x] 4.2 调整 artifact 搜索工具，支持 kind、sessionScope、目标、器械正负约束、时长和辅助 query。
- [x] 4.3 让 Agent 基于真实 artifact payload 先提出 `WorkoutEditPlan`，再决定局部 Patch、整套重新生成或澄清，不再由服务端关键词选择策略。
- [x] 4.4 确保 Patch 中的 replacementExerciseId 来自当前 run 的 candidateSetId 和数据库，Patch target 来自真实 artifact payload。
- [x] 4.5 确保 routine/plan draft 展示或保存前通过 Validator 和 Policy，失败后由 Agent 选择修复、重新查候选、澄清或失败恢复。
- [x] 4.6 确保所有生成或修订结果通过写工具保存为 `ConversationArtifact` revision，并保留来源关系、candidateSetId、validationId、policyDecisionId 和旧 artifact 可读性。
- [x] 4.7 拒绝裸用户原句 query 作为可执行候选集合来源；必要时要求 Agent 补结构化字段、读取更多上下文或澄清。

## 5. Response Writer、上下文与 Trace

- [x] 5.1 实现基于 `AgentExecutionResult` 的 Response Writer 投影层，禁止未执行写操作时承诺已生成或已更新。
- [x] 5.1.1 让 Response Writer 支持 `completed_operation` 投影，只能描述已登记 `operationResultId` 的安全摘要，不得伪造成 artifact、patch 或旧 intent 结果。
- [x] 5.2 移除 `/api/chat` 对 `conversationSummary` 的必需依赖，Agent 输入改为 `ContextPackage`、真实 recent messages、recent artifacts、用户记忆和 tool results。
- [x] 5.3 如保留 summary 生成，将其降级为可选后台摘要、会话标题或调试信息；如需长会话压缩，生成带 provenance 的 `ContextSnapshot`，不参与事实决策。
- [x] 5.4 扩展 AiRunTrace，记录 agent run、ContextPackage、tool decision、tool result id、dependency graph、validator gate、policy gate、persistence、legacy path skip 和 final result。
- [x] 5.5 更新 `/dev/ai-traces` 展示或摘要逻辑，使 Agent steps 可读并能关联最终回复使用的 ContextPackage、tool results、candidateSetId、validationId、revisionId 和 artifact events。
- [x] 5.6 生成 Agent replay fixture，支持复盘上下文、工具决策、依赖图、最终回复和旧路径未参与执行。

## 6. 模型调用、Prompt 与 Token Budget 迁移

- [x] 6.1 新增 Agent tool decision prompt module，明确模型只能基于 `ContextPackage`、registry 工具定义、已登记 tool results 和 dependency graph 选择下一步，不得读取 `conversationSummary` 或旧 resolved intent 作为执行事实。
- [x] 6.2 新增 Agent final result prompt module，要求模型只能返回 `AgentExecutionResult` 结构化终止结果，并用 `usedToolResultIds`、`revisionId`、`validationId`、`policyDecisionId` 或 blocking reason 解释结果来源。
- [x] 6.3 新增 Response Writer prompt module；如使用 LLM 润色最终回复，输入只能是 `AgentExecutionResult` 的只读投影、必要 tool result 摘要和 artifact summary，输出不得重新选择工具、重新解释语义或承诺未执行写入。
- [x] 6.4 从 `/api/chat` 生产路径移除 `chat_intent_resolution`、`chat_final_response`、`conversation_summary_context`、`reference_resolution_boundary` 等旧 prompt module 对执行决策的依赖；保留时只能用于兼容诊断、后台 summary 或已明确降级的非执行场景。
- [x] 6.5 更新 `aiPromptModuleRegistry` 和 token budget stage，新增 `agent_context_build`、`agent_tool_decision`、`agent_tool_execution`、`agent_response_writer`、`agent_summary_update` 或等价阶段，替换旧 `chat_intent_resolution` / `reference_resolution` / `chat_final_response` 作为 `/api/chat` 主链观测合同。
- [x] 6.6 将 `ModelVisibleContextSummary` 或等价调试摘要从 summary-only 语义改为 `ContextPackage` 可见性摘要，记录 recent messages、recent artifacts、用户记忆、tool result、ContextSnapshot 和截断策略。
- [x] 6.7 更新 `exerciseRecommendationGeneration`、`workoutPlanIntentExtraction`、`workoutPlanDraftGeneration` 等下游模型提示词和调用输入，使其接收 Agent 传入的结构化 intent/edit plan、candidateSetId、ContextPackage 摘要或 tool result，而不是继续声明只依赖 `conversationSummary + latestUserMessage`。
- [x] 6.8 为 Agent decision / final result / Response Writer 的解析失败、Schema 失败、空响应、未知工具、非法多工具请求和 retry/repair 结果补充 trace 与单元测试。

## 7. 测试与回归验证

- [ ] 7.1 增加 Agent context builder 单元测试，覆盖 recent messages、recent artifacts、用户记忆、ContextSnapshot、截断和 provenance。
- [ ] 7.2 增加 Agent tool registry 单元测试，覆盖未知工具、非法参数、越权 artifact、候选外 exerciseId、tool result id 不匹配和写工具前置校验缺失。
- [ ] 7.2.1 增加 Agent tool 扩展边界测试，断言缺少领域能力合同、字段白名单、权限上下文、确认策略、持久化服务或安全摘要的写工具无法注册。
- [ ] 7.3 增加 `/api/chat` Agent 主链测试，覆盖动作推荐、routine 生成、plan 生成、WorkoutEditPlan、局部 Patch、整套重新生成和澄清。
- [x] 7.4 增加多轮黑盒 flow：先生成哑铃上肢 routine，再输入“`不用哑铃了，换一个`”，断言读取最近 artifact、查询无哑铃动作并返回一致结果。
- [x] 7.5 增加“太难了”“不要跳跃动作”“改成在家练”“第二个动作换掉”等多轮调整测试，验证不依赖服务端关键词纠偏。
- [x] 7.6 更新 manual LLM 报告断言，优先检查 Agent tool trace、ExecutionResult、用户可见回复和 artifact 事件，而不是旧 `assistant_action` 字段。
- [x] 7.7 增加架构级防回归测试，断言旧 intent-first 分支、旧 normalize、summary-only 上下文、旧只读触发矩阵和裸 query RAG 不会触发执行结果。
- [x] 7.8 增加 Response Writer 事实引用测试，断言回复中动作、器械、artifact 状态和保存结果可映射到 tool result、validation 或 revision。
- [x] 7.9 增加 prompt / token budget 防回归测试，断言 `/api/chat` 主链不再启用旧 summary-only prompt modules，且 Agent stages、ContextPackage 可见性摘要和 tool result 引用可被 trace 复盘。
- [x] 7.10 增加流事件兼容测试，断言新 `AgentExecutionResult` 事件或 done metadata 可独立表达 artifact、patch、clarification、blocked 和 failed 状态，关闭旧 `assistant_action` / resolved intent 后前端消费路径仍可工作。
- [x] 7.11 增加通用受控写操作测试夹具，例如模拟 `updateUserProfile` 工具成功、需要确认和被拒绝三种结果，断言 Agent runtime 无需改动主链即可通过 `completed_operation`、Policy/Confirmation 和 Response Writer 表达结果。
- [x] 7.12 保留现有 basic/detail 黑盒 flow 的用户输入序列和业务期望，只在必要时补充 Agent 期望字段，不把业务 flow 重写成工具级白盒测试。
- [x] 7.13 扩展 `BlackboxTurnResult` 和 stream parser，记录 `AgentExecutionResult`、Agent stage、tool calls、tool results、dependency graph 摘要、legacy path skip、关键 tool/result id 和兼容字段状态。
- [x] 7.14 将 `BlackboxCardType` 从 `AssistantAction["action"]` 解耦为测试稳定枚举，并从 `AgentExecutionResult`、artifact/patch/suggestion 事件和 done metadata 推导实际结果类型。
- [x] 7.15 扩展 fixture expectation，支持预期 Agent status、必需工具、禁用工具、必需 candidateSetId、validationId、revisionId、引用解析和 legacy path 禁用断言。
- [x] 7.16 更新 manual LLM 报告格式，分层展示用户可见闭环、artifact/patch/suggestion 事件、Agent execution result、tool dependency graph、legacy path 是否未参与执行和失败分级。
- [x] 7.17 增加关闭旧 `assistant_action` / resolved intent 兼容字段的黑盒运行模式，验证用户可见回复、artifact 事件、assistantSuggestions 和 done metadata 仍能独立通过。

## 8. 文档、清理与验证命令

- [x] 8.1 更新 `docs/architecture.md` 和 `docs/chat-push-flow.md`，把 `/api/chat` 主链改为 Tool-first AgentOrchestrator。
- [x] 8.2 在 `docs/方案变更历史` 新增架构变更记录，并追加 `docs/项目演变历程.md`。
- [x] 8.3 删除或明确废弃旧 intent-first 主链中的服务端语义 normalize、关键词 gate、只读-only tool loop、ReferenceResolver-first 主路径、pending replacement 字符串改写、旧 prompt module 和 summary-only 上下文文档描述。
- [x] 8.4 运行 `npm run test -- tests/chat-service.test.ts tests/readonly-tools.test.ts tests/workout-patch-chat-service.test.ts tests/conversation-artifact-service.test.ts` 或对应更新后的测试集合。
- [x] 8.5 运行 `npm run typecheck`。
- [x] 8.6 运行 `openspec validate replace-chat-orchestrator-with-tool-first-agent --strict`。
- [x] 8.7 如执行真实模型黑盒测试，生成最新报告；如不执行，说明成本、环境和替代验证范围。
