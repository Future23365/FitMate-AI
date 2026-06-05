## 1. 合同建模与提示词

- [ ] 1.1 梳理当前 `agent-llm-prompt-configuration` 中可见资源、引用对象、输出结构和 repair 相关说明，标出需要统一到资源消费合同的位置。
- [ ] 1.2 在默认 prompt / model input 合同中补充 `reuse`、`derive`、`modify`、`replace`、`clarify` 的资源操作语义，并明确这些分类由模型基于可见事实推理，不由服务端根据用户原文分流。
- [ ] 1.3 在默认 prompt / model input 合同中补充结构覆盖边界：`routine` / `plan` 需要 `warmup`、`training`、`stretch` 可消费事实；仅有部分 section 时只能输出被事实支撑的结构、继续获取事实、澄清或失败收口。
- [ ] 1.4 审查 prompt examples / grounding 说明，删除或改写会把具体用户短句、具体 toolName + 字段组合升级为生产规则的描述。

## 2. Tool Observation 与资源投影

- [ ] 2.1 增强 `visibleTrainingProposal` / `read_recent` 的模型可见 observation，表达正向可消费事实、`availableSections`、`missingSectionsForRoutineOrPlan` 和 `supportsOutputKinds`。
- [ ] 2.2 确保 `read_recent` observation 明确区分导入历史事实与生成最终输出，最终展示仍只能通过 `final_answer.visibleOutputs[]`。
- [ ] 2.3 增强 `searchExerciseResources` 的模型可见说明和 observation，明确 `requiredExerciseIds` 是正向锚点，`excludeExerciseIds` 只表示明确负向排除，不用于保留、复用、派生或修改。
- [ ] 2.4 确保动作检索 observation 表达 section-scoped 事实边界，避免 Planner 将只支撑 `training` 的资源误当作完整 `routine` / `plan`。

## 3. 校验与 Repair Feedback

- [ ] 3.1 增强 `visibleTrainingProposal` 校验失败的结构化诊断，至少包含失败 code、path、exerciseId、section、allowedSections、当前可用 coverage 和缺失 section。
- [ ] 3.2 确保首次校验失败以 recoverable observation 返回给 Planner，repair budget 耗尽后不保存训练事实、不生成不可验证的 visible output，并返回安全中文错误。
- [ ] 3.3 检查 route、runtime、validator、tool handler、renderer，确认没有新增基于用户原文、关键词、短句模板或具体 phrasing 的语义分流。

## 4. 回归测试

- [ ] 4.1 增加 prompt / model input 合同测试，断言资源消费、结构覆盖、正向锚点、负向排除和禁止服务端语义分流的说明对模型可见。
- [ ] 4.2 增加 tool observation 单元测试，覆盖历史 `training` facts 导入后只支撑 `exercise_selection` 或继续补齐 section，不支撑完整 `routine` 的场景。
- [ ] 4.3 增加 `searchExerciseResources` 合同测试，覆盖 `requiredExerciseIds` 和 `excludeExerciseIds` 的语义边界，避免“保留一批动作”被转成排除同一批动作。
- [ ] 4.4 增加 validator / repair 测试，覆盖 section 不匹配、缺少 `warmup` / `stretch`、repair budget 耗尽时的可恢复诊断和失败收口。
- [ ] 4.5 增加 production trace replay 或 manual LLM 黑盒样例，覆盖“从已展示动作中取若干个”和“指出问题后重新生成”两类等价语义变体；具体原话只放在测试样例中，不写入生产规则。

## 5. 验证与文档

- [ ] 5.1 运行与 Agent prompt、tool observation、validator 和 trace replay 相关的测试。
- [ ] 5.2 按改动范围运行 `npm test`，必要时运行 `npm run typecheck`。
- [ ] 5.3 更新相关 OpenSpec 任务状态，并运行 `openspec validate harden-visible-training-resource-consumption-contract --strict`。
- [ ] 5.4 若实现阶段改变核心链路或架构边界，按项目规则补充 `docs/方案变更历史` 和 `docs/项目演变历程.md`。
