## 1. 范围与治理

- [x] 1.1 读取最新 `codex_logs/ai_trace_log.js` 和必要的 `ai_trace_texts.jsonl` 片段，确认失败证据仍是“模型已看到 `missingSectionsForRoutineOrPlan` 但提交缺 section 的 `routine` / `plan`”。
  - 结果：当前导出为 `2026-06-05 16:00:08 +08:00` 的成功 trace，已不再复现 `section_coverage_missing` / `repair_limit_exceeded`；长文本仍证明模型可见输入包含 section readiness 合同，本实现按 OpenSpec 证据和当前合同缺口推进。
- [x] 1.2 使用 `agent-prompt-contract-governance` 检查本 change 只修改 prompt、model input、tool manifest、schema description、examples、observation 或 repair feedback。
- [x] 1.3 使用 `agent-fix-abstraction-gate` 审查实现方案，确认没有把用户原话、固定短句、具体 trace 或字段组合升格成服务端语义分流。
- [x] 1.4 运行 `git status --short`，确认本 change 不混入已有无关改动。

## 2. 默认 Prompt 合同

- [x] 2.1 更新 `lib/server/config/agent-llm-prompt-config.ts`，把 `routine` / `plan` 的 `warmup` / `training` / `stretch` section coverage 写成 `final_answer.visibleOutputs[]` 的前置条件。
- [x] 2.2 在默认 prompt 中明确 forbidden action：`missingSectionsForRoutineOrPlan` 非空时不得输出 `payload.kind = "routine"` 或 `"plan"` 的 `visibleOutputs`，不得正文解释缺口后仍提交不完整结构。
- [x] 2.3 在默认 prompt 中明确 allowed next actions：继续调用当前可见合法 tool 获取缺失 section、`ask_user` 澄清，或不输出 `visibleOutputs` 并说明事实不足。
- [x] 2.4 检查默认 prompt 未新增固定业务 `toolName` 调用流程、固定 tool 调用次数、服务端自动补齐承诺、`generatePlanDraft` 或 `generateRoutineDraft`。
- [x] 2.5 更新 prompt 配置或 model input builder 相关测试 / snapshot，断言新合同进入模型实际可见 system message。

## 3. `searchExerciseResources` 模型可见合同

- [x] 3.1 更新 `searchExerciseResources` 的 `whenToUse`、`whenNotToUse`、input schema description 或 examples，说明缺 `warmup` / `stretch` 时可用缺失 section 的 `suitabilities` 查询候选。
- [x] 3.2 收紧 `toModelObservation` 中的 `routinePlanCompositionBoundary`，让 `availableSections`、`sectionSummary`、`missingSectionsForRoutineOrPlan` 和 forbidden final 边界同时可见。
- [x] 3.3 确认 `searchExerciseResources` handler、input schema、output schema 和数据库查询行为不改变，tool 仍只提供动作事实，不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription` 或 `schedule`。
- [x] 3.4 补充 tool manifest / observation 测试，覆盖只有 `training` 结果时 observation 明确禁止缺 section 的 `routine` / `plan` final，并提示 `suitabilities = ["warmup", "stretch"]` 或等价缺失 section 查询。

## 4. Validator 兜底反馈

- [x] 4.1 评估是否需要调整 `visibleTrainingProposal` validator 的 `section_coverage_missing` recovery 文案；如调整，只表达兜底修正方向，不把 repair 当成主成功路径。
- [x] 4.2 若调整 repair feedback，补充测试确认该反馈不会要求固定 tool 调用顺序，也不会承诺服务端生成缺失动作。

## 5. 回归验证

- [x] 5.1 增加 ReplayPlanner 回归：上一轮 `visibleTrainingProposal` 只有 `training`，用户要求组成一次训练时，Planner 必须先补 `warmup` / `stretch` 事实，或选择 `ask_user` / 无 `visibleOutputs` 的事实不足说明。
- [x] 5.2 增加 ReplayPlanner 负例：Planner 在 `missingSectionsForRoutineOrPlan` 非空时直接提交 `payload.kind = "routine"` 或 `"plan"`，必须被 validator 拒绝且不会渲染 / 保存。
- [x] 5.3 增加同类语义变体回归，覆盖“把这些动作组成 30 分钟训练”和至少一个不使用原始失败短句的等价表达。
- [x] 5.4 在具备真实模型环境时执行 `/api/chat` 黑盒验证，确认真实 LLM 在 training-only facts 下会先查询缺失 section，或不输出非法 `routine` / `plan`。
  - 结果：本次未确认可用真实模型黑盒环境，且不主动消耗真实模型调用；按 5.5 记录剩余风险。
- [x] 5.5 若无法运行真实 LLM 黑盒验证，在实现总结中明确记录原因和剩余风险。

## 6. 合同边界与自动化检查

- [x] 6.1 运行 `openspec validate harden-routine-plan-section-readiness-contract --strict`。
- [x] 6.2 运行相关 prompt / manifest / observation / Agent runtime 测试；修改 TypeScript 后按需运行 `npm run typecheck`。
- [x] 6.3 用 `rg` 检查本 change 没有在 `/api/chat`、Agent runtime、Executor、Policy Guard、ResourceStore、Response Renderer 或 tool handler 中新增用户原文关键词、正则、同义词表、短句模板或服务端语义分流。
- [x] 6.4 用 `rg` 检查生产模型可见合同没有恢复 `generatePlanDraft` / `generateRoutineDraft`，也没有描述未注册 tool 或隐藏训练生成服务。
- [x] 6.5 最终 diff 检查确认没有混入 `next-env.d.ts`、其他未完成 OpenSpec change 或无关文件。
