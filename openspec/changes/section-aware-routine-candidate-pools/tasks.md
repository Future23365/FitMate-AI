## 1. 候选搜索合同归一化

- [ ] 1.1 在 `searchExercises(candidateUse="routine")` 的服务端归一化层补全三段式 `sectionCoverage`，确保缺失 `warmup` / `stretch` 时默认补为 `{ min: 1 }`。
- [ ] 1.2 增加 routine section candidate plan 构造逻辑，将输入拆为 `trainingPool`、`warmupPool`、`stretchPool` 三类服务端搜索边界。
- [ ] 1.3 确保 `trainingPool` 继续使用用户主训练的肌群、区域、器械、难度、强度和风险边界。
- [ ] 1.4 确保 `warmupPool` 默认筛选无器械或自重、且适合 `warmup` 的动作，并保留发布态、风险排除和必要安全边界。
- [ ] 1.5 确保 `stretchPool` 默认筛选无器械或自重、且适合 `stretch` 的动作，并保留发布态、风险排除和必要安全边界。
- [ ] 1.6 支持结构化输入明确指定 warmup / stretch 器械时，把该器械 hard constraint 只应用到对应 section pool。

## 2. 候选证据与恢复提示

- [ ] 2.1 扩展 `candidateSetEvidence`，加入 `sectionPools.warmup`、`sectionPools.training`、`sectionPools.stretch` 及每个 pool 的候选 id 和应用过滤证据。
- [ ] 2.2 保持同一个 `candidateSetId` 作为后续 `generateRoutineDraft`、validation、policy 和 save 的可消费资源。
- [ ] 2.3 调整 diagnostics，明确输出每个 section pool 的候选数量、覆盖证明和缺失原因。
- [ ] 2.4 调整 `recoveryOptions` 和 `generateRoutineDraft` 失败 guidance，禁止再提示“用同一 hard filters 重新查询”，改为 section-aware routine candidate set。
- [ ] 2.5 更新 `searchExercises` 工具说明和 Agent prompt，明确 LLM 只需调用一次 routine 搜索，服务端负责内部分池。

## 3. Routine draft 消费分段证据

- [ ] 3.1 调整 `generateRoutineDraft` 的候选分段逻辑，优先读取 `candidateSetEvidence.sectionPools`。
- [ ] 3.2 保留现有 `controlledSupplementalCandidates` 兼容路径，作为没有 `sectionPools` 时的次级分段证据。
- [ ] 3.3 保证 draft 输出、validation candidate boundary、policy 和 artifact 保存链路继续包含最终使用的 warmup / training / stretch 动作 id。
- [ ] 3.4 确保 section pool evidence 与动作通用元数据冲突时，以本轮 evidence 为准，并在 trace 中保留可诊断信息。

## 4. 测试与验证

- [ ] 4.1 增加 `exercise-service` 测试：模型只传 `training.sectionCoverage` 时，routine 搜索自动补齐 warmup / stretch 覆盖，并返回无器械 section pools。
- [ ] 4.2 增加 `exercise-service` 测试：用户主训练有哑铃时，`trainingPool` 可用哑铃，`warmupPool` / `stretchPool` 默认仍为无器械或自重。
- [ ] 4.3 增加 `exercise-service` 测试：明确指定热身或拉伸也使用某器械时，对应 section pool 保留该 hard constraint，且不会静默放宽。
- [ ] 4.4 增加 `agent-orchestrator` 或 `readonly-tools` 测试：最新日志场景“无器械、高强度、胸背腿”不得因 `candidate_set_missing_warmup` 转为 `needs_clarification`。
- [ ] 4.5 增加 `generateRoutineDraft` 测试：存在 `sectionPools` 时按 evidence 分段，不因动作通用元数据返回 `candidate_set_missing_warmup` / `candidate_set_missing_stretch`。
- [ ] 4.6 运行 `npm test` 或相关定向测试，至少覆盖 `tests/exercise-service.test.ts`、`tests/agent-orchestrator.test.ts` 或 `tests/readonly-tools.test.ts` 中本次新增用例。
- [ ] 4.7 运行 `npm run typecheck`。
- [ ] 4.8 运行 `openspec validate section-aware-routine-candidate-pools --strict`。
