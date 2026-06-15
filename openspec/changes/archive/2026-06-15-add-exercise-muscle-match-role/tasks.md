## 1. 治理与边界

- [x] 1.1 使用 `agent-tool-change-governance` 完成执行边界检查：确认稳定 resource type 为 `Exercise`，能力族为 query/list，本 change 只调整 `searchExerciseResources` 的输入 schema、repository filter、模型可见 summary、projection、trace 和测试，不新增 tool、不迁移 runtime。
- [x] 1.2 使用 `agent-prompt-contract-governance` 检查模型实际可见输入：确认目标肌群推荐和宽泛参与查询的策略放在默认 prompt 的 Planner Policy；`muscleMatchRole` 字段语义放在 `searchExerciseResources` description / schema description / result summary。
- [x] 1.3 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁：确认具体失败用户输入和 trace 条件只作为证据或回归测试样例，不写入通用 prompt、runtime、服务端 route 或业务 handler。
- [x] 1.4 实现前运行 `git status --short`，确认不混入当前工作区已有无关改动。
- [x] 1.5 确认禁止触碰模块：LangChain runtime 主循环、model factory provider payload、production response adapter 主流程、`/api/chat` 主链路、服务端关键词 / 正则 / 同义词 / phrasing 路由、provider `tool_calls` 改写。

## 2. OpenSpec 合同

- [x] 2.1 运行 `openspec validate add-exercise-muscle-match-role --strict`，确认 proposal、design、tasks 和三个 spec delta 均合法。
- [x] 2.2 对照 `docs/llm-prompt-guidance.md` 检查本 change 的分层：Prompt 定策略，Schema 定形状，Tool 定能力和字段语义，Validator 守边界。
- [x] 2.3 确认 OpenSpec 文档没有把“今天我要减肥，想多练练核心，有没有推荐的动作”这类具体用户输入写成生产触发规则；具体输入只允许出现在测试样例说明中。

## 3. `searchExerciseResources` 执行合同

- [x] 3.1 更新 `lib/server/langchain-agent/tools/exercise-resource-tools.ts`，新增 `muscleMatchRole` schema 字段，合法值为 `primary` 和 `any`，默认值为 `primary`。
- [x] 3.2 更新 `lib/server/exercises/exercise-repository.ts` 的肌群查询过滤：`primary` 只匹配 `primaryMuscles` / `primaryMusclesZh`；`any` 匹配 `primaryMuscles` / `primaryMusclesZh` / `secondaryMuscles` / `secondaryMusclesZh`。
- [x] 3.3 检查 `lib/server/exercises/exercise-service.ts` 或其他复用 repository 查询输入的入口，确保新字段不会破坏现有 public 查询；如需同步类型或默认值，按同一执行合同更新。
- [x] 3.4 确认不修改 Prisma schema、migration、动作数据回填，不把主练肌群压缩为单值字段，不删除辅助肌群字段。

## 4. 模型可见说明与投影

- [x] 4.1 更新 `searchExerciseResources` tool description，表达目标肌群动作推荐默认 `muscleMatchRole = "primary"`，宽泛参与 / 带到 / 辅助刺激 / 稳定参与查询使用 `muscleMatchRole = "any"`。
- [x] 4.2 更新 `muscleMatchRole` schema description，说明字段来源、默认值、两个枚举的业务含义，以及 `any` 不代表每个候选都适合作为目标肌群主练推荐。
- [x] 4.3 更新 `toModelVisibleSummary`，在成功结果的 query 中回填 `muscleMatchRole`，并保持候选池事实等级为 candidate。
- [x] 4.4 更新 `toUserProjection` 和 `toTraceSummary`，让前端投影和 trace 能看到当前肌群匹配角色。
- [x] 4.5 确认 model-visible summary 不输出 `satisfied`、`nextActionHints`、固定下一步 workflow 或“必须继续查 / 必须提交结构化结果”的业务目标满足度判断。

## 5. 默认 Prompt 策略

- [x] 5.1 更新 `lib/server/langchain-agent/prompt.ts`，在默认 prompt 中补充目标肌群推荐默认按主练肌群理解、宽泛参与查询才使用主/辅任意参与口径的 Planner Policy。
- [x] 5.2 确认 prompt 文案只使用稳定抽象，例如目标肌群推荐、主练、参与、辅助刺激、候选池、停止条件，不包含具体用户短句、关键词、具体 `toolName` 触发规则或字段组合触发规则。
- [x] 5.3 确认已有“候选池可选择子集、不要为移除未选候选重复查询”的规则仍保留，并与 `muscleMatchRole` 的主练默认口径一致。

## 6. 测试与门禁

- [x] 6.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖默认 `muscleMatchRole = "primary"` 不返回只在 `secondaryMusclesZh` 命中的候选。
- [x] 6.2 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖显式 `muscleMatchRole = "any"` 可以返回辅助肌群命中的候选，并保留主/辅肌群事实。
- [x] 6.3 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖非法 `muscleMatchRole` 被 schema 拒绝。
- [x] 6.4 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，覆盖 tool description 和 schema description 暴露 `primary` / `any` 的中文业务含义和默认值。
- [x] 6.5 更新 `tests/langchain-agent-runtime/runtime.test.ts`，断言默认 prompt 包含目标肌群推荐默认主练口径、宽泛参与查询才使用任意匹配口径、成功候选后停止同类重复查询的规则。
- [x] 6.6 更新 `lib/server/langchain-agent/model-visible-contract-gate.ts` 或其测试 fixture，覆盖肌群匹配角色合同的风险类别：用户短句触发、具体字段组合触发、固定补查 workflow、业务目标满足度和服务端语义分流文案。
- [x] 6.7 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，证明允许稳定的 `primary` / `any` 语义说明，同时拒绝 case-specific 生产规则和固定下一步 tool 文案。
- [x] 6.8 增加或更新回归样例，覆盖原始失败语义“目标肌群动作推荐”及至少一个等价变体；验证期望是第一次查询默认主肌群匹配，并在已有候选足够时收口，而不是连续扩大候选池。

## 7. 验证

- [x] 7.1 运行 `openspec validate add-exercise-muscle-match-role --strict`。
- [x] 7.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [x] 7.3 修改 TypeScript、schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`。
- [x] 7.4 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支、runtime 主循环改动或 `/api/chat` 主链路分流。
