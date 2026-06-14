## 1. 变更边界与门禁

- [ ] 1.1 完成 Agent tool 变更治理检查：任务类型为已有业务 tool 合同调整，允许触碰 `searchExerciseResources` wrapper、repository、projection、trace summary 和相关 tests，禁止触碰 LangChain runtime 主循环、model factory provider payload、production response adapter 主流程和 `/api/chat` 主链路。
- [ ] 1.2 完成 Tool 抽象层级检查：稳定 resource type 为 `Exercise`，能力族为 `query`，本次限制属于内部 filter / sort 策略，不新增 toolName、自然语言路由或 runtime 分支。
- [ ] 1.3 完成 Agent 修复方案抽象层级门禁：确认未新增关键词规则、自然语言模板路由、phrasing 特判、用户原话触发规则或具体 `toolName` runtime 语义分支。
- [ ] 1.4 如修改 `searchExerciseResources` description、schema description、examples、失败反馈或 tool result summary，使用 `agent-prompt-contract-governance` 检查模型可见合同，确认内部低门槛默认没有被暴露成模型应复制的 tool input。

## 2. Tool 单测先行

- [ ] 2.1 在 `tests/langchain-agent-tools/search-exercise-resources.test.ts` 增加宽泛 `muscles = ["腹肌"]` 且未传 `equipment` 的回归用例，断言 repository 使用既有无外部器械兼容筛选口径，而不是严格匹配单一 `no_equipment` 字面值。
- [ ] 2.2 增加点名动作查询回归用例，覆盖 `exerciseNames` 存在且未传 `equipment` 时不得应用内部低门槛默认，器械类点名动作不能被默认无外部器械口径过滤。
- [ ] 2.3 增加 `requiredExerciseIds` 回归用例，覆盖未传 `equipment` 时 required 动作仍优先纳入，内部低门槛默认不挤占或过滤受控动作锚点。
- [ ] 2.4 增加显式 `equipment` 回归用例，覆盖 Planner 显式输入必须覆盖内部默认，显式 `equipment = "no_equipment"` 继续复用既有无外部器械兼容映射。
- [ ] 2.5 增加肌群优先排序回归用例，覆盖主肌群命中优先于辅助肌群命中，多肌群按输入顺序和代表性覆盖返回，`requiredExerciseIds` 优先于肌群排序。
- [ ] 2.6 增加模型可见 summary 回归用例，断言内部低门槛默认不出现在模型可见 `query.equipment`、Planner 显式 `appliedFilters.equipment` 或可复制输入字段中。

## 3. 实现查询策略

- [ ] 3.1 在 `lib/server/exercises/exercise-repository.ts` 或等价查询策略 helper 中实现宽泛候选查询的内部低门槛默认，复用当前无外部器械兼容筛选条件。
- [ ] 3.2 保持 `equipment = "no_equipment"` 的既有兼容语义：映射到自重或等价无外部器械数据库字段，不自动添加 `homeRequirement`。
- [ ] 3.3 将内部低门槛默认限制为未传 `equipment`、未传 `exerciseNames`、未传 `requiredExerciseIds` 的宽泛候选查询。
- [ ] 3.4 实现 `muscles` 查询的主肌群优先候选选择：按输入肌群顺序、主肌群命中优先、原 `sort` 和 `id` tie-breaker 返回候选，并保持多肌群代表性覆盖。
- [ ] 3.5 确保 `requiredExerciseIds`、`excludeExerciseIds`、section hard filter policy、`candidateCountPerSection` 和既有 diagnostics 行为不被默认低门槛策略破坏。

## 4. 投影、模型可见和 trace 边界

- [ ] 4.1 更新 `searchExerciseResources` 的 model-visible summary，确保只表达候选动作事实和显式查询输入事实，不暴露内部低门槛默认为 `query.equipment` 或可复制 tool input。
- [ ] 4.2 如需要调试可见性，在 trace summary 或服务端安全摘要中记录内部低门槛默认是否生效，但不得回灌到 Planner 下一轮可见 observation。
- [ ] 4.3 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，确认模型可见说明不出现“用户没说器械就必须传 `equipment`”或固定自然语言短句规则。
- [ ] 4.4 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，确认新增模型可见文本不暴露业务目标满足度、固定 workflow、内部默认参数或继续查询暗示。

## 5. 验证

- [ ] 5.1 运行 `openspec validate prefer-low-friction-exercise-candidates --strict`。
- [ ] 5.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts`。
- [ ] 5.3 如修改 tool description、schema description 或 production catalog，运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [ ] 5.4 如修改 AI 编排、Schema 或共享 TypeScript 逻辑，运行 `npm run typecheck`。
- [ ] 5.5 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` runtime 分支、LangChain runtime 主循环改动、provider payload 改动、production response adapter 主流程改动或 `/api/chat` 主链路改动。
