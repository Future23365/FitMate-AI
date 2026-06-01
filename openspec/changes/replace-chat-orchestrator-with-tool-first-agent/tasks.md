## 1. 契约与模块边界

- [ ] 1.1 新增 `lib/server/agent-orchestrator` 模块，定义 `AgentContextBuilder`、`ContextPackage`、`ContextProvenance`、`AgentExecutionState`、`AgentExecutionResult`、`AgentDependencyGraph` 和核心类型注释。
- [ ] 1.2 定义统一 `AgentToolRegistry` 接口，覆盖工具名称、描述、读写级别、Zod 输入 Schema、输出摘要、trace 摘要、幂等 key、前置依赖和执行函数。
- [ ] 1.3 定义 Agent tool decision / final result 的 Structured Outputs Schema，确保模型只能选择注册工具或返回合法终止结果。
- [ ] 1.4 定义 `WorkoutEditPlan` / `WorkoutEditIntent`，覆盖目标 artifact、保留项、变更项、影响范围、策略、候选集合依赖和确认级别。
- [ ] 1.5 定义工具错误码、step limit、timeout、checkpoint/resume、失败恢复、blocked 状态和硬失败分类。
- [ ] 1.6 定义 `LegacyChatEventAdapter` 单向兼容层和旧 `assistant_action` / resolved intent 退出条件。

## 2. 工具注册与服务端硬边界

- [ ] 2.1 将现有 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises` 迁入统一 Agent registry。
- [ ] 2.2 新增 `listRecentArtifacts`、`getUserMemory` 或等价读工具，支持 Agent 主动查询当前会话事实。
- [ ] 2.3 新增 `proposeWorkoutEditPlan`、`generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch` 和 `askClarification` 工具，保持输出 Schema 可校验。
- [ ] 2.4 新增 `validateRoutineDraft`、`validatePlanDraft`、`validateWorkoutPatch` 和 `evaluatePolicy` 工具，复用现有 Validator / Policy。
- [ ] 2.5 新增 `saveConversationArtifactRevision` 或等价写工具，要求引用 draftId/patchId、candidateSetId、validationId、policyDecisionId 和必要 confirmationId 后才能保存。
- [ ] 2.6 为所有工具补充 userId/sessionId 权限隔离、候选集合边界、tool result id 依赖、失败返回和 trace 摘要测试。
- [ ] 2.7 确保生成工具复用 DomainPlanEngine、候选集合、时长估算、Validator、Policy 和 validation recovery，不退化为 summary + 用户原文的大模型自由生成。

## 3. Agent Loop 与 /api/chat 主链替换

- [ ] 3.1 实现 `runAgentOrchestrator`，循环执行模型 tool decision、工具调用、工具结果登记、依赖图更新和下一步决策。
- [ ] 3.2 实现 Agent loop 的完成条件：answered、needs_clarification、generated、patched、failed、blocked，并保存 checkpoint/replay 摘要。
- [ ] 3.3 将 `/api/chat` 生产主链切换到 AgentOrchestrator，旧 resolved intent、`assistant_action` 和 `workoutIntent` 只从 Agent 结果派生兼容事件。
- [ ] 3.4 删除或废弃旧服务端高层语义 normalize、关键词 gate、ReferenceResolver-first 触发矩阵、只读 tool loop 触发矩阵、pending replacement 字符串改写和黑盒补丁型 intent 纠偏。
- [ ] 3.5 确保前端继续消费稳定流事件、artifact、patch、`assistantSuggestions` 和 done metadata，不参与 Agent 决策。
- [ ] 3.6 为旧兼容事件提供关闭开关或测试路径，验证移除旧字段后主链仍通过。

## 4. 动作查询、生成、Patch 与保存闭环

- [ ] 4.1 调整动作查询工具，支持 `equipmentRequired`、`equipmentAvoided`、`targetMuscles`、`level`、`sessionMinutes`、`preferences` 和 `avoidances` 结构化过滤。
- [ ] 4.2 调整 artifact 搜索工具，支持 kind、sessionScope、目标、器械正负约束、时长和辅助 query。
- [ ] 4.3 让 Agent 基于真实 artifact payload 先提出 `WorkoutEditPlan`，再决定局部 Patch、整套重新生成或澄清，不再由服务端关键词选择策略。
- [ ] 4.4 确保 Patch 中的 replacementExerciseId 来自当前 run 的 candidateSetId 和数据库，Patch target 来自真实 artifact payload。
- [ ] 4.5 确保 routine/plan draft 展示或保存前通过 Validator 和 Policy，失败后由 Agent 选择修复、重新查候选、澄清或失败恢复。
- [ ] 4.6 确保所有生成或修订结果通过写工具保存为 `ConversationArtifact` revision，并保留来源关系、candidateSetId、validationId、policyDecisionId 和旧 artifact 可读性。
- [ ] 4.7 拒绝裸用户原句 query 作为可执行候选集合来源；必要时要求 Agent 补结构化字段、读取更多上下文或澄清。

## 5. Response Writer、上下文与 Trace

- [ ] 5.1 实现基于 `AgentExecutionResult` 的 Response Writer 投影层，禁止未执行写操作时承诺已生成或已更新。
- [ ] 5.2 移除 `/api/chat` 对 `conversationSummary` 的必需依赖，Agent 输入改为 `ContextPackage`、真实 recent messages、recent artifacts、用户记忆和 tool results。
- [ ] 5.3 如保留 summary 生成，将其降级为可选后台摘要、会话标题或调试信息；如需长会话压缩，生成带 provenance 的 `ContextSnapshot`，不参与事实决策。
- [ ] 5.4 扩展 AiRunTrace，记录 agent run、ContextPackage、tool decision、tool result id、dependency graph、validator gate、policy gate、persistence、legacy path skip 和 final result。
- [ ] 5.5 更新 `/dev/ai-traces` 展示或摘要逻辑，使 Agent steps 可读并能关联最终回复使用的 ContextPackage、tool results、candidateSetId、validationId、revisionId 和 artifact events。
- [ ] 5.6 生成 Agent replay fixture，支持复盘上下文、工具决策、依赖图、最终回复和旧路径未参与执行。

## 6. 测试与回归验证

- [ ] 6.1 增加 Agent context builder 单元测试，覆盖 recent messages、recent artifacts、用户记忆、ContextSnapshot、截断和 provenance。
- [ ] 6.2 增加 Agent tool registry 单元测试，覆盖未知工具、非法参数、越权 artifact、候选外 exerciseId、tool result id 不匹配和写工具前置校验缺失。
- [ ] 6.3 增加 `/api/chat` Agent 主链测试，覆盖动作推荐、routine 生成、plan 生成、WorkoutEditPlan、局部 Patch、整套重新生成和澄清。
- [ ] 6.4 增加多轮黑盒 flow：先生成哑铃上肢 routine，再输入“`不用哑铃了，换一个`”，断言读取最近 artifact、查询无哑铃动作并返回一致结果。
- [ ] 6.5 增加“太难了”“不要跳跃动作”“改成在家练”“第二个动作换掉”等多轮调整测试，验证不依赖服务端关键词纠偏。
- [ ] 6.6 更新 manual LLM 报告断言，优先检查 Agent tool trace、ExecutionResult、用户可见回复和 artifact 事件，而不是旧 `assistant_action` 字段。
- [ ] 6.7 增加架构级防回归测试，断言旧 intent-first 分支、旧 normalize、summary-only 上下文、旧只读触发矩阵和裸 query RAG 不会触发执行结果。
- [ ] 6.8 增加 Response Writer 事实引用测试，断言回复中动作、器械、artifact 状态和保存结果可映射到 tool result、validation 或 revision。

## 7. 文档、清理与验证命令

- [ ] 7.1 更新 `docs/architecture.md` 和 `docs/chat-push-flow.md`，把 `/api/chat` 主链改为 Tool-first AgentOrchestrator。
- [ ] 7.2 在 `docs/方案变更历史` 新增架构变更记录，并追加 `docs/项目演变历程.md`。
- [ ] 7.3 删除或明确废弃旧 intent-first 主链中的服务端语义 normalize、关键词 gate、只读-only tool loop、ReferenceResolver-first 主路径、pending replacement 字符串改写和 summary-only 上下文文档描述。
- [ ] 7.4 运行 `npm run test -- tests/chat-service.test.ts tests/readonly-tools.test.ts tests/workout-patch-chat-service.test.ts tests/conversation-artifact-service.test.ts` 或对应更新后的测试集合。
- [ ] 7.5 运行 `npm run typecheck`。
- [ ] 7.6 运行 `openspec validate replace-chat-orchestrator-with-tool-first-agent --strict`。
- [ ] 7.7 如执行真实模型黑盒测试，生成最新报告；如不执行，说明成本、环境和替代验证范围。
