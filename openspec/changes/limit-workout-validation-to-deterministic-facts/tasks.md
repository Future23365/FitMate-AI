## 1. 服务端校验边界

- [ ] 1.1 梳理 `workout-plan-validation-service.ts` 中 hard fail 与 warning 的问题类型，明确确定性失败集合。
- [ ] 1.2 将 `section_exercise_mismatch` 从 hard fail 路径移出，或降级为不影响 `valid` 的 warning / trace 诊断。
- [ ] 1.3 保留动作 ID 存在、候选集合、Schema、必要 section、用户限制、权限、安全、时长和训练量的硬校验。
- [ ] 1.4 检查候选分池逻辑，确保 `allowedSections` 只影响候选优先级或 prompt 提示，不阻断总候选集合中的合法动作被 LLM 使用。

## 2. 恢复与 Trace

- [ ] 2.1 调整 `workout-plan-validation-recovery-service.ts`，避免 section 语义分歧进入终止型失败或要求用户补目标/器械/时长。
- [ ] 2.2 在 AI Trace 中区分确定性 hard fail 与 section 语义 warning，保留 `exerciseId`、AI section 和本地元数据 section 诊断信息。
- [ ] 2.3 确认自动修复 prompt 仍只处理结构、候选、时长、训练量等确定性问题，不要求 LLM 迎合错误的 section 硬编码。

## 3. 测试与验证

- [ ] 3.1 更新 `tests/workout-plan-validation.test.ts`，覆盖 `Knee_Circles` 和 `Wrist_Circles` 放入 `warmup` 不再触发 hard fail。
- [ ] 3.2 保留并补充确定性失败测试，覆盖非法动作 ID、候选外动作、缺少必要 section、Schema 无效和时长/训练量明显异常。
- [ ] 3.3 更新 `tests/ai-workout-plan-service.test.ts` 或相关服务测试，覆盖“30分钟，练这个”这类基于推荐动作生成 routine 的成功路径。
- [ ] 3.4 运行 `npm test -- --run tests/workout-plan-validation.test.ts tests/ai-workout-plan-service.test.ts`。
- [ ] 3.5 运行 `npm run typecheck`；若改动影响构建边界，再运行 `npm run build` 或说明无法运行原因。

## 4. 文档记录

- [ ] 4.1 在 `docs/方案变更历史` 新增变更记录，说明服务端校验从“通用语义硬编码”收敛为“确定性事实边界”。
- [ ] 4.2 如实现改变开发者排查方式，在相关文档中说明 hard fail 与 trace warning 的区别。
