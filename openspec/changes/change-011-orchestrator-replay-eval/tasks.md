## 1. Orchestrator 与工具边界

- [ ] 1.1 新增 `AiTaskOrchestrator` 或等价模块，定义 step graph、step input/output schema、状态枚举和 finalDecision 结构。
- [ ] 1.2 将 `/api/chat` 中引用解析、受控工具、Patch、PlanEngine、Policy、Confirmation、Validator、Repair、Persistence 和 Response Writer 串接到 Orchestrator。
- [ ] 1.3 为 artifact、exercise、memory、schedule 和 persistence 工具补齐 guardrails：userId 权限、schema 校验、数量限制、字段摘要和 trace 输出。
- [ ] 1.4 实现 confirmation checkpoint，绑定目标、scope、diff、policy result、validator 摘要、toolVersions 和过期时间。
- [ ] 1.5 补充 Orchestrator 单元测试，覆盖成功、ambiguous、not_found、requiresConfirmation、policy_blocked、validation_failed 和 tool_failed 分支。

## 2. future schedule Patch 执行

- [ ] 2.1 扩展 Patch schema 和 PatchEngine，支持 `future_schedules` scope 下的 `move_training_day`、`mark_rest_day`、`change_weekly_frequency` 和批量 `replace_exercise`。
- [ ] 2.2 扩展 Schedule Service，提供只写未来安排的移动、取消、顺延、重排和批量替换接口。
- [ ] 2.3 写入前统一执行 Policy、Confirmation checkpoint 校验、Validator 和 userId 权限隔离。
- [ ] 2.4 写入结果记录来源 artifact、Patch operation、confirmation checkpoint、trace runId、受影响 schedule 和 diff 摘要。
- [ ] 2.5 补充测试覆盖未来动作批量替换、明天休息、移动训练日冲突、改变 weeklyFrequency、已完成历史不变和确认 token 过期拒绝。

## 3. Repair Orchestrator

- [ ] 3.1 新增统一 Repair Orchestrator，接收 ValidationResult、原始草稿/Patch/plan preview、候选池和用户约束。
- [ ] 3.2 实现确定性修复策略：压缩训练时长、调整组数/次数/休息、替换候选外动作、插入恢复日、缩小 Patch scope。
- [ ] 3.3 在需要语义选择时调用受控 LLM 修复，限制模型只能从服务端候选集合内选择。
- [ ] 3.4 将 `/api/ai/workout-plan` 现有训练草稿失败恢复迁移到 Repair Orchestrator。
- [ ] 3.5 补充修复测试，覆盖 `session_too_long`、候选外动作、section 不合法、连续负荷过高、修复后仍失败和修复需要确认。

## 4. HealthRiskClassifier

- [ ] 4.1 新增健康风险分类类型、Zod schema 和服务端分类器，输出 `none`、`minor_discomfort`、`pain_or_injury`、`high_risk_symptom` 与训练约束摘要。
- [ ] 4.2 只在用户主动表达疼痛、不适、伤病或高风险信号时触发分类，普通训练目标不得被默认健康问询阻断。
- [ ] 4.3 将分类结果接入候选过滤、PatchValidator、DomainPlanEngine、UserMemory pending 写入和 Response Writer。
- [ ] 4.4 补充测试覆盖普通目标不阻断、轻微不适降强度、疼痛伤病保守替代、高风险症状不生成训练计划和长期健康记忆确认。

## 5. Response Writer

- [ ] 5.1 新增 Response Writer 输入/输出 schema，统一消费 Orchestrator final state、diff、policy result、validation result、repair result 和 health risk result。
- [ ] 5.2 实现成功变更摘要、确认问题、候选不足、policy blocked、validation failed、repair failed、ambiguous、not_found 和健康边界回复类型。
- [ ] 5.3 确保 Response Writer 不直接读取数据库、不重建 payload、不绕过 Policy 或 Validator。
- [ ] 5.4 补充 Response Writer 测试，断言不同失败类型输出不同引导，确认文案展示真实影响范围，健康文案不提供医疗诊断。

## 6. Replay Runner 与 Eval Suite

- [ ] 6.1 定义 replay/eval fixture schema，包含用户消息、artifact 摘要、必要 payload 快照、用户画像/记忆摘要、promptVersion、toolVersions、model 和期望断言。
- [ ] 6.2 新增 Replay Runner，支持从 `AiRunTrace` 或 fixture 复盘 reference、tool_call、patch、policy、validation、repair、persistence 和 finalDecision。
- [ ] 6.3 新增 Eval Suite，覆盖“三周都练这个”、“俯卧撑太难换一个”、“后面都别安排俯卧撑”、“明天休息”、“改成一周四练但别太累”、ambiguous reference 和健康风险边界。
- [ ] 6.4 Eval 断言优先检查结构化决策、scope、候选来源、Policy、Validator、Confirmation 和 finalDecision，不依赖完整自然语言相似度。
- [ ] 6.5 补充 replay/eval 隐私测试，确认 fixture 和报告会截断长文本、大 payload，并只包含当前 userId 可访问数据。

## 7. UI 与文档接入

- [ ] 7.1 调整训练日历读取逻辑，确保 AI 修改 future schedule 后展示真实服务端安排，而不是 artifact preview。
- [ ] 7.2 调整训练执行入口，确保被 AI 移动、取消或重排后的 schedule 使用最新 active 状态，已完成历史保持不变。
- [ ] 7.3 更新 `/dev/ai-traces` 展示 repair、checkpoint、replay/eval 相关摘要；未知 step 保留 Raw JSON。
- [ ] 7.4 更新 `docs/architecture.md`、`docs/AI上下文与训练计划架构改进方案.md`、`docs/项目演变历程.md` 和 `docs/方案变更历史`，记录 `011` 的第二阶段闭环。

## 8. 验证

- [ ] 8.1 运行 `npm test`，覆盖 Orchestrator、Schedule Patch、Repair、HealthRiskClassifier、Response Writer 和 Replay/Eval 的自动化测试。
- [ ] 8.2 运行 `npm run typecheck` 和 `npm run lint`。
- [ ] 8.3 如果修改路由、服务端/客户端边界、trace 页面或日历页面，运行 `npm run build` 或说明无法运行原因。
- [ ] 8.4 运行独立手动 LLM 一致性测试，覆盖 011 多步链路，并在报告中汇总 token usage、结构化验收结果和失败原因。
- [ ] 8.5 运行 `npx openspec validate change-011-orchestrator-replay-eval --strict`。
