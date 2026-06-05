## 1. 范围与治理

- [x] 1.1 读取基础黑盒报告和相关测试定义，确认失败证据是明确 routine 目标在缺 section 后停止为安全错误、动作列表或用户自行组合建议。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 审查方案，确认 F04、F17、F18 只作为回归样例，不进入生产触发规则。
- [x] 1.3 使用 `agent-prompt-contract-governance` 检查本 change 以模型实际可见 prompt、manifest、schema description、examples 和 observation 为主。
- [x] 1.4 使用 `agent-tool-change-governance` 检查不修改 `/api/chat` 主链路、Agent runtime、Policy Guard、ResourceStore、Response Renderer 或 tool handler 语义。
- [x] 1.5 运行 `git status --short`，确认不混入无关改动。

## 2. 模型可见 routine 组合合同

- [x] 2.1 更新 `lib/server/config/agent-llm-prompt-config.ts`，表达明确 routine 目标在已有 `training` 动作事实且可补查缺失 section 时，应继续获取 `warmup` / `stretch` 并输出完整 `routine`。
- [x] 2.2 明确禁止把 routine 目标降级为 `exercise_selection`、正文动作列表或“用户自行组合”的成功回复。
- [x] 2.3 保持信息不足边界：目标或关键约束不足时仍使用 `ask_user` 或不带 `visibleOutputs` 的可选方向，不恢复随机卡片。
- [x] 2.4 确认 prompt 未新增固定业务 `toolName` 调用流程、固定调用次数、用户原文关键词规则、旧 `generateRoutineDraft` 或隐藏训练生成服务。
- [x] 2.5 更新 prompt / production manifest 相关测试，断言新合同进入模型实际可见 system message。

## 3. `searchExerciseResources` 模型可见合同

- [x] 3.1 更新 `searchExerciseResources` 的 `whenToUse`、`whenNotToUse`、schema description 或 examples，说明 routine 目标下缺 `warmup` / `stretch` 时应带当前目标约束继续查询。
- [x] 3.2 更新 `toModelObservation` 的 `routinePlanCompositionBoundary`，区分“可补查缺口”和“候选不足 / 约束冲突”的可恢复收口。
- [x] 3.3 确认 handler、input schema、output schema 和数据库查询语义不改变，tool 仍只提供动作事实。
- [x] 3.4 更新 tool-level / manifest / observation 测试，覆盖 training-only 查询提示继续补查，以及缺失 section 无候选时不让用户自行组合。

## 4. 回归测试

- [x] 4.1 增加 production ReplayPlanner 成功路径：明确 routine 请求先查询 `training`，再查询 `warmup` / `stretch`，最终输出三段式 `routine`。
- [x] 4.2 增加降级负例：Planner 在明确 routine 目标下只输出 `exercise_selection` 或正文动作列表时，测试应证明这不是完整 routine 成功路径。
- [x] 4.3 增加同类语义变体回归，至少覆盖“居家背部 30 分钟训练”和“胸部 20 分钟无器械训练”或等价表达。
- [x] 4.4 如不运行真实 LLM 黑盒，最终总结说明未消耗模型调用和剩余风险。

## 5. 验证与边界扫描

- [x] 5.1 运行 `openspec validate stabilize-complete-routine-composition --strict`。
- [x] 5.2 运行相关自动化测试：`tests/chat-service.test.ts`、`tests/agent-tools/search-exercise-resources.test.ts` 或实际修改触达的最窄测试文件。
- [x] 5.3 修改 TypeScript 后运行 `npm run typecheck`。
- [x] 5.4 用 `rg` 检查本 change 没有在 `/api/chat`、Agent runtime、tool handler、validator 或 renderer 中新增用户原文关键词、正则、同义词表、短句模板或服务端语义分流。
- [x] 5.5 最终 diff 检查确认没有混入无关 OpenSpec change、日志报告或测试报告更新。
