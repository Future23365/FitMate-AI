## 1. 边界与文档

- [x] 1.1 检查当前 OpenSpec change 状态、Git 工作区状态和 Agent tool 架构文档第 24、25、26 节。
- [x] 1.2 更新 `AGENTS.md`，新增模型可见描述性 prompt 默认中文、技术标识保持英文的全局规则。
- [x] 1.3 更新 `agent-prompt-contract-governance` Skill，要求审查所有模型可见描述字段的中文规则。
- [x] 1.4 更新 `agent-tool-change-governance` Skill，要求新增或修改 Agent tool 时检查 manifest / schema / examples 描述语言。
- [x] 1.5 更新 `docs/agent-tool-orchestrator-design.md`，记录 prompt/model input 合同的语言边界。

## 2. 模型可见描述中文化

- [x] 2.1 中文化生产业务 tool `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse` 和 examples description。
- [x] 2.2 中文化生产业务 tool `readRecentExerciseRecommendationFact` 的 `description`、`whenToUse`、`whenNotToUse`、examples description 和模型可见失败说明。
- [x] 2.3 中文化 fixture tool 的模型可见 `description`、`whenToUse`、`whenNotToUse` 和 examples description。
- [x] 2.4 中文化测试中临时定义的 tool manifest 描述字段，保证测试 Planner manifest 也符合规则。

## 3. 回归测试

- [x] 3.1 更新 manifest hardening linter 或等价测试，检查 manifest 描述字段默认包含中文。
- [x] 3.2 更新 `tests/agent-core/tool-registry-manifest.test.ts`，验证 production registry 的模型可见描述字段已中文化。
- [x] 3.3 更新相关 manifest / contract helper / fixture 测试断言，适配中文描述。

## 4. 验证与收尾

- [x] 4.1 运行 `openspec validate localize-agent-model-visible-descriptions --strict`。
- [x] 4.2 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts tests/agent-core/manifest-hardening.test.ts tests/agent-core/contract-helper.test.ts`。
- [x] 4.3 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`。
- [x] 4.4 运行 `npm run typecheck`。
- [x] 4.5 检查最终 diff，确认没有修改 Agent runtime、PlannerPort、Executor、Policy Guard、ResourceStore、Response Renderer 或 `/api/chat` 主链路。
