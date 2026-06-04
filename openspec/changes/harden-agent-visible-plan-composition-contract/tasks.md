## 1. 范围确认

- [x] 1.1 读取最新 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`，确认原始失败链路中模型已看到新版 prompt / manifest，但只查询 `training` 并最终降级为动作推荐。
- [x] 1.2 运行 `git status --short`，识别已有无关改动；本 change 实现和提交只纳入 prompt / model-visible contract 相关文件。
- [x] 1.3 确认本 change 不新增 `generatePlanDraft`、`generateRoutineDraft` 或等价旧式 draft tool。
- [x] 1.4 确认本 change 不触碰 `/api/chat` route、`PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、Response Renderer 或 terminal validator 的业务语义判断。
- [x] 1.5 确认实现方案不新增服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判。

## 2. Prompt 合同调整

- [x] 2.1 更新 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`，在 `visibleTrainingProposal` 说明中新增 `plan` 的结构选择边界：多天、周期、频次、训练日 / 休息日安排或跨天训练计划应优先使用 `payload.kind = "plan"`。
- [x] 2.2 在 prompt 中明确上述规则是训练输出结构选择规则，不是固定词语触发；服务端不会根据用户原文替模型改写 `kind`。
- [x] 2.3 在 prompt 中补充 `plan` 生成顺序：确认目标 / 限制 / 器械 / 时间 / 难度，查询或复用 `training` 动作事实，补齐 `warmup` / `stretch` 动作事实，绑定 `prescription`，最后输出 `schedule.assignments`。
- [x] 2.4 在 prompt 中明确 `schedule` 只表达周期内 `training` / `rest` 日，不得内嵌每天不同的完整动作编排。
- [x] 2.5 在 prompt 中收紧降级边界：当模型判断目标需要 `routine` 或 `plan` 且可见 tools 可继续补缺失 section 时，不得因为只查到 `training` 动作就输出 `exercise_selection`。
- [x] 2.6 确认 prompt 仍保留只需要一批可选训练动作时使用 `exercise_selection` 的合法出口。

## 3. searchExerciseResources 模型可见合同调整

- [x] 3.1 更新 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 `description`、`whenToUse`、`whenNotToUse` 和 input schema description，表达该 tool 只查询动作事实原料，不生成最终 `visibleTrainingProposal`、`routine`、`plan`、`prescription` 或 `schedule`。
- [x] 3.2 在 manifest 中明确 `groups.<section>.exercises[*].exerciseId` 在 `fulfillment.satisfied = true` 时可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的受控事实来源。
- [x] 3.3 在 manifest 中明确当模型目标需要 `routine` 或 `plan`，且当前 run 只有 `training` 动作事实时，应优先使用 `suitabilities = ["warmup", "stretch"]` 或等价缺失 section 查询补齐热身和拉伸候选。
- [x] 3.4 在 manifest 中明确不得把 `groups.training` 中且 `allowedSections` 不包含 `warmup` / `stretch` 的动作写入其他 section。
- [x] 3.5 在 manifest 和 examples 中保留“非固定调用次数 / 非固定调用顺序”的边界，但去掉允许 `routine` / `plan` 目标直接降级为 `exercise_selection` 的宽泛出口。
- [x] 3.6 更新 `toModelObservation` 或等价 observation builder，确保只查到 `training` 时模型可见摘要表达缺少 `warmup` / `stretch` 事实以及可继续查询的方式。

## 4. 自动化测试

- [x] 4.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖 prompt 包含 `plan` 结构选择、生成顺序、`schedule.assignments`、禁止降级边界和“不是固定词语触发”说明。
- [x] 4.2 删除或改写当前阻止 prompt 出现“多天安排结构选择规则”的反向断言，避免测试继续锁死错误合同。
- [x] 4.3 更新 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖 `searchExerciseResources` manifest 中的 `routine` / `plan` 缺 section 继续查询说明、不可生成最终方案说明和非服务端分流边界。
- [x] 4.4 更新 `tests/agent-core/contract-helper.test.ts` 或相关 observation 测试，覆盖只返回 `groups.training` 时模型可见 observation 会提示 `warmup` / `stretch` 事实缺口。
- [x] 4.5 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 manifest / observation 不把 `training` 动作伪装成 `warmup` / `stretch`，且不把 tool result 当作最终训练方案。
- [x] 4.6 更新或新增 `tests/chat-service.test.ts` 的 ReplayPlanner 场景，模拟先查 `training`、再查 `warmup` / `stretch`、最终输出合法 `payload.kind = "plan"`。
- [x] 4.7 增加架构扫描或断言，确认 `/api/chat`、Agent core、renderer、tool handler 和 prompt / manifest 中没有新增服务端关键词、正则、同义词表或短句模板分流。
- [x] 4.8 增加旧式 tool 残留检查，确认生产 registry、prompt、manifest、examples 和 observation 中没有引入 `generatePlanDraft` 或 `generateRoutineDraft`。

## 5. 验证

- [x] 5.1 运行 `openspec validate harden-agent-visible-plan-composition-contract --strict`。
- [x] 5.2 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [x] 5.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 5.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 5.5 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 5.6 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 5.7 运行 `npm run typecheck`。
- [x] 5.8 如具备真实模型环境，基于原始失败表达“我想在家减脂，没有器械，每周 3 练，每次 25 分钟，动作简单一点”和至少一个等价表达执行黑盒验证，确认最终回答不再只输出动作推荐。（本轮未默认消耗真实模型调用，已在最终总结说明剩余风险。）
- [x] 5.9 最终检查 diff，确认只包含本 change 范围内的 prompt、tool manifest / observation、测试和 OpenSpec 文档改动，并说明是否存在未提交无关文件。
