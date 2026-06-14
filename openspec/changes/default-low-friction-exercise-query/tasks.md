## 1. 合同与门禁

- [x] 1.1 使用 `agent-prompt-contract-governance` 完成模型可见合同分层检查，确认默认规则属于 Planner policy，字段来源说明属于 `searchExerciseResources` tool description / schema description。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁检查，确认没有把具体 trace 用户原话、字段组合或 toolName 调用顺序升格成生产通用规则。
- [x] 1.3 运行 `openspec validate default-low-friction-exercise-query --strict`，修正 proposal / design / specs / tasks 中的格式或合同问题。

## 2. Prompt 与 Tool 说明

- [x] 2.1 更新 `lib/server/langchain-agent/prompt.ts` 的保守默认规则：宽泛动作推荐、动作筛选或结构化训练候选缺少器械 / 场地偏好时，默认按低门槛 `no_equipment` 口径继续，并说明该默认只服务当前请求。
- [x] 2.2 更新 `prompt.ts` 的动作推荐决策示例：第一次动作候选查询就使用低门槛 `no_equipment` 口径，不先做无执行场景的宽泛查询再补查。
- [x] 2.3 更新 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 中 `executionProfile` 的 schema description 和 tool description，说明 `no_equipment` 是缺少执行条件时的默认低门槛口径，`home_support` 只在用户明确可用居家支撑时使用。

## 3. 测试与验证

- [x] 3.1 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，覆盖默认 prompt、tool description 和 schema description 中的低门槛无器械合同，并确认没有服务端关键词 / phrasing 特判文案。
- [x] 3.2 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖 `searchExerciseResources` 模型可见说明中 `no_equipment` 与 `home_support` 的输入来源边界。
- [x] 3.3 运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/search-exercise-resources.test.ts`。
- [x] 3.4 运行 `npm run typecheck`。
- [x] 3.5 最终 diff 检查，确认没有修改 LangChain runtime、tool wrapper、provider payload、handler、repository、response adapter 或新增服务端自然语言分流。
