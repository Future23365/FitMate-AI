## 1. 合同与证据

- [x] 1.1 调整 routine draft 构造输入，使 `generateRoutineDraft` 能读取 `candidateSetEvidence.controlledSupplementalCandidates`。
- [x] 1.2 明确受控补充 section evidence 优先级：命中 evidence 的动作按 evidence section 放入 routine，未命中时继续使用动作元数据。

## 2. Routine 生成实现

- [x] 2.1 修改 `buildRoutineDraftFromCandidates()` / `buildRoutineSectionBuckets()`，消费受控补充 section evidence。
- [x] 2.2 修改 warmup / stretch 缺失阶段补齐逻辑，默认优先无器械或自重候选，training 仍优先匹配 intent equipment。
- [x] 2.3 更新 `searchExercises` 工具说明或 prompt 文案，提醒模型普通器械只默认约束 training，不默认约束 warmup / stretch。

## 3. 测试

- [x] 3.1 补充 `agent-orchestrator` 回归测试：候选 evidence 标记动态拉伸为 warmup supplement 时，`generateRoutineDraft` 不得返回 `candidate_set_missing_warmup`。
- [x] 3.2 补充 warmup / stretch 无器械优先测试：用户 routine intent 有哑铃时，缺失阶段补齐不应优先选择哑铃动作。
- [x] 3.3 按需补充 `exercise-service` 测试，确认三段式 section coverage 的受控补充证据仍可证明候选满足要求。

## 4. 验证与文档

- [x] 4.1 运行相关测试子集，至少覆盖 `tests/agent-orchestrator.test.ts` 和 `tests/exercise-service.test.ts` 的相关用例。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `openspec validate relax-routine-phase-equipment-boundaries --strict`。
- [x] 4.4 若本次改动属于核心链路修复，更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`。
