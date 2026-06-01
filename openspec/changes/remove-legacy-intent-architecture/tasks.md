## 1. 旧架构引用审计

- [ ] 1.1 审计生产 `/api/chat` 路径中对 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、`action.shouldTrigger`、`responseMode`、`assistant_action` 和 `intent_resolved` 的引用，标记生产执行引用、历史迁移引用和测试夹具引用。
- [ ] 1.2 审计 `lib/server/ai/tools/*` 中独立只读-only tool loop、`ENABLE_READONLY_LLM_TOOLS`、`ReadonlyToolDecision`、`runReadonlyToolLoop` 和旧触发矩阵的生产引用。
- [ ] 1.3 审计 `conversationSummary` 在 Agent context、prompt、下游生成服务、trace 和黑盒 runner 中的使用，区分后台摘要、标题、调试材料和非法执行事实源。
- [ ] 1.4 审计 docs、OpenSpec 主规格和方案历史中仍描述旧 intent-first、summary-only、只读-only tool loop 或前端 `assistant_action` 二次触发的段落。
- [ ] 1.5 建立 legacy allowlist：逐项标记仍需保留的旧解析代码、旧类型、旧报告兼容和旧 fixture 的合法边界；未进入 allowlist 的旧架构代码必须删除，进入 allowlist 的代码必须证明生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析和领域服务均不可导入。

## 2. 删除旧聊天意图主链

- [ ] 2.1 从生产 `/api/chat` 主链删除旧 intent resolution、resolved intent repair、旧 action gate、旧默认 intent 类型和旧语义归一化执行路径。
- [ ] 2.2 删除或迁移 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent` 相关生产类型、schema、helper 和 guard；确需保留的历史解析逻辑必须移动到测试夹具或离线迁移边界。
- [ ] 2.3 删除 `LegacyChatEventAdapter` 在生产流事件中的输出，确保新运行不再输出 `assistant_action`、`intent_resolved` 或旧 trigger JSON。
- [ ] 2.4 确保前端只消费 `agent_execution_result`、artifact / patch / suggestion 事件和 done metadata，不再依赖旧 action 事件触发训练卡片。
- [ ] 2.5 删除服务端基于关键词、正则、短句模板或历史摘要推断用户高层语义的旧补丁逻辑，确保短指令只由 Agent 通过工具读取事实后决策。
- [ ] 2.6 删除所有调用旧 intent-first 的第二执行路径；Agent 失败、工具失败、候选不足、引用不可解析、校验失败或 Response Writer 失败时，只能进入 Agent repair、tool retry、`needs_clarification`、`blocked`、`failed`、validation / policy failure handling 或用户确认。
- [ ] 2.7 删除旧 prompt module 和 repair prompt 中面向 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、旧 action contract 或 `conversationSummary + latestUserMessage` 执行协议的生产调用；如 prompt 文本仅用于历史 fixture，必须移出生产 prompt 配置边界。

## 3. 迁移只读工具与上下文边界

- [ ] 3.1 将旧只读工具的 Schema、权限、摘要、预算和 trace 边界迁入统一 `AgentToolRegistry`，删除独立只读 registry 或将其降级为 Agent registry 的内部读工具定义。
- [ ] 3.2 删除 `runReadonlyToolLoop`、只读 decision prompt、只读 context bundle formatter、只读 feature flag 触发矩阵和旧固定编排路径。
- [ ] 3.3 确保 Agent context 不包含 `conversationSummary` 作为执行事实源；需要 artifact payload、exerciseId、Patch target 或训练参数时必须通过工具读取。
- [ ] 3.4 保留 `conversationSummary` 的后台摘要、标题、历史迁移和调试用途，并在代码注释和 trace 摘要中明确它不是执行事实源。
- [ ] 3.5 检查 token budget、context formatter 和 trace formatter，确保它们只处理 Agent `ContextPackage`、tool result 摘要和 Response Writer 输入，不再构造旧只读 context bundle 或 summary-only prompt。

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
- [ ] 5.7 增加生产 stream contract 测试，覆盖 `agent_execution_result`、artifact / patch / suggestion 事件、tool evidence metadata 和 done metadata；断言新运行不输出 `assistant_action`、`intent_resolved`、旧 trigger JSON 或可作为执行事实源的 `workoutIntent`。
- [ ] 5.8 增加 Agent-only failure handling 矩阵测试，覆盖 routine、plan、动作推荐、Patch、动作讲解和短指令场景中的工具失败、候选不足、引用失败、validation 失败和 policy blocked，断言不会调用旧 intent-first 架构。
- [ ] 5.9 增加 legacy allowlist 防回归测试，扫描生产入口或模块依赖，确保 allowlist 外的旧架构模块不可被 `/api/chat`、Agent runtime、Response Writer、前端新流解析和领域服务引用。

## 6. 架构文档同步与 OpenSpec 收尾

- [ ] 6.1 更新 `docs/architecture.md`、`docs/chat-push-flow.md`、`docs/manual-llm-consistency-tests.md` 和相关调试文档，删除旧 intent-first、summary-only、只读-only tool loop 和 `assistant_action` 二次触发描述。
- [ ] 6.2 在 `docs/方案变更历史` 新增一份上海时间精确到秒的架构清理记录，说明旧架构为什么不合适、清理思路、关键改动和验证结果。
- [ ] 6.3 在 `docs/项目演变历程.md` 末尾追加本次旧架构清理记录，说明从双主链迁移到 Agent-only 主链的原因和结果。
- [ ] 6.4 实现完成后更新本 change 的 `tasks.md` 勾选状态，并运行 `openspec validate remove-legacy-intent-architecture --strict`。
- [ ] 6.5 历史方案文档和归档 change 默认只作为演进记录保留；除非用户明确要求，清理工作不得通过删除历史文档来替代当前生产合同、主规格、测试和代码的迁移。

## 7. 验证命令

- [ ] 7.1 运行与 Agent 主链、聊天服务、只读工具迁移、plan/routine/Patch 相关的自动化测试，例如 `npm run test -- tests/agent-orchestrator.test.ts tests/chat-service.test.ts tests/readonly-tools.test.ts tests/workout-patch-chat-service.test.ts tests/ai-workout-plan-service.test.ts` 或更新后的对应测试集合。
- [ ] 7.2 运行 `npm run typecheck`。
- [ ] 7.3 影响构建、路由、服务端/客户端模块边界或删除旧导出后，运行 `npm run build`；如无法运行，必须记录原因和替代验证。
- [ ] 7.4 如执行真实模型黑盒测试，运行基础套件和详细套件并更新报告；如不执行，必须说明成本、环境和已执行的替代验证范围。
