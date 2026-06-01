## 1. 旧架构引用审计

- [ ] 1.1 审计生产 `/api/chat` 路径中对 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、`action.shouldTrigger`、`responseMode`、`assistant_action` 和 `intent_resolved` 的引用，标记生产执行引用、历史迁移引用和测试夹具引用。
- [ ] 1.2 审计 `lib/server/ai/tools/*` 中独立只读-only tool loop、`ENABLE_READONLY_LLM_TOOLS`、`ReadonlyToolDecision`、`runReadonlyToolLoop` 和旧触发矩阵的生产引用。
- [ ] 1.3 审计 `conversationSummary` 在 Agent context、prompt、下游生成服务、trace 和黑盒 runner 中的使用，区分后台摘要、标题、调试材料和非法执行事实源。
- [ ] 1.4 审计 docs、OpenSpec 主规格和方案历史中仍描述旧 intent-first、summary-only、只读-only tool loop 或前端 `assistant_action` 二次触发的段落。

## 2. 删除旧聊天意图主链

- [ ] 2.1 从生产 `/api/chat` 主链删除旧 intent resolution、resolved intent repair、旧 action gate、旧 fallback intent 和旧语义归一化执行路径。
- [ ] 2.2 删除或迁移 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent` 相关生产类型、schema、helper 和 guard；确需保留的历史解析逻辑必须移动到测试夹具或离线迁移边界。
- [ ] 2.3 删除 `LegacyChatEventAdapter` 在生产流事件中的输出，确保新运行不再输出 `assistant_action`、`intent_resolved` 或旧 trigger JSON。
- [ ] 2.4 确保前端只消费 `agent_execution_result`、artifact / patch / suggestion 事件和 done metadata，不再依赖旧 action 事件触发训练卡片。
- [ ] 2.5 删除服务端基于关键词、正则、短句模板或历史摘要推断用户高层语义的旧补丁逻辑，确保短指令只由 Agent 通过工具读取事实后决策。

## 3. 迁移只读工具与上下文边界

- [ ] 3.1 将旧只读工具的 Schema、权限、摘要、预算和 trace 边界迁入统一 `AgentToolRegistry`，删除独立只读 registry 或将其降级为 Agent registry 的内部读工具定义。
- [ ] 3.2 删除 `runReadonlyToolLoop`、只读 decision prompt、只读 context bundle formatter、只读 feature flag 触发矩阵和旧 fallback 到固定编排的路径。
- [ ] 3.3 确保 Agent context 不包含 `conversationSummary` 作为执行事实源；需要 artifact payload、exerciseId、Patch target 或训练参数时必须通过工具读取。
- [ ] 3.4 保留 `conversationSummary` 的后台摘要、标题、历史迁移和调试用途，并在代码注释和 trace 摘要中明确它不是执行事实源。

## 4. 下游领域服务输入迁移

- [ ] 4.1 将长期计划生成、`PlanStrategy` 和 `DomainPlanEngine` 的聊天入口改为消费 Agent 结构化计划输入、tool result、candidateSetId、字段来源和 active artifact payload。
- [ ] 4.2 将 routine 生成入口改为消费 Agent routine draft 输入、候选集合、Validator、Policy 和 revision 结果，删除旧 `workout_routine` intent 独立触发路径。
- [ ] 4.3 将动作推荐入口改为消费 Agent 动作检索 tool result 和 `AgentExecutionResult`，删除旧内部推荐事件触发路径。
- [ ] 4.4 将 Patch、动作替换和动作讲解入口统一到 Agent `WorkoutEditPlan`、artifact payload tool result、candidateSetId 和 validation / policy 结果。
- [ ] 4.5 确保默认经验、默认周期、默认时长和字段来源都来自 Agent 输入或领域服务默认策略，而不是旧 `workoutIntent` 字段。

## 5. Trace、黑盒和自动化测试迁移

- [ ] 5.1 更新 AiRunTrace，记录 Agent context、tool decision、tool execution、dependency graph、final result、Response Writer 和旧路径缺席证据。
- [ ] 5.2 更新黑盒 runner、stream parser 和报告格式，移除对 `assistant_action`、resolved intent、`workoutIntent` 和旧 trigger JSON 的核心断言。
- [ ] 5.3 增加架构级防回归测试，断言旧 intent resolution、旧 normalize、`runReadonlyToolLoop`、旧 trigger parser 和 `LegacyChatEventAdapter` 不参与生产 `/api/chat` 执行。
- [ ] 5.4 迁移只读工具测试到 Agent registry，覆盖未知工具、非法参数、越权 artifact、摘要截断、tool result id 和 trace 摘要。
- [ ] 5.5 更新 plan、routine、动作推荐、Patch 和动作讲解相关测试，断言执行事实来自 `AgentExecutionResult` 和 tool dependency graph。
- [ ] 5.6 更新手动 LLM 黑盒 fixture expectation，保留用户输入和业务期望，但把执行证据字段迁移为 Agent status、必需工具、candidateSetId、validationId、revisionId 和 legacy path absence。

## 6. 文档与 OpenSpec 收尾

- [ ] 6.1 更新 `docs/architecture.md`、`docs/chat-push-flow.md`、`docs/manual-llm-consistency-tests.md` 和相关调试文档，删除旧 intent-first、summary-only、只读-only tool loop 和 `assistant_action` 二次触发描述。
- [ ] 6.2 在 `docs/方案变更历史` 新增一份上海时间精确到秒的架构清理记录，说明旧架构为什么不合适、清理思路、关键改动和验证结果。
- [ ] 6.3 在 `docs/项目演变历程.md` 末尾追加本次旧架构清理记录，说明从双主链迁移到 Agent-only 主链的原因和结果。
- [ ] 6.4 实现完成后更新本 change 的 `tasks.md` 勾选状态，并运行 `openspec validate remove-legacy-intent-architecture --strict`。

## 7. 验证命令

- [ ] 7.1 运行与 Agent 主链、聊天服务、只读工具迁移、plan/routine/Patch 相关的自动化测试，例如 `npm run test -- tests/agent-orchestrator.test.ts tests/chat-service.test.ts tests/readonly-tools.test.ts tests/workout-patch-chat-service.test.ts tests/ai-workout-plan-service.test.ts` 或更新后的对应测试集合。
- [ ] 7.2 运行 `npm run typecheck`。
- [ ] 7.3 影响构建、路由、服务端/客户端模块边界或删除旧导出后，运行 `npm run build`；如无法运行，必须记录原因和替代验证。
- [ ] 7.4 如执行真实模型黑盒测试，运行基础套件和详细套件并更新报告；如不执行，必须说明成本、环境和已执行的替代验证范围。
