## 1. 合同治理

- [x] 1.1 完成 Agent 修复方案抽象层级门禁审查，确认没有把具体 trace、用户原话、字段组合或业务实例升格为通用服务端规则。
- [x] 1.2 完成 Agent prompt/model-visible 合同检查，确认 plan composition 规则分别落在 Planner Policy、flow example、tool description 和 schema description 的正确层级。
- [x] 1.3 运行 `openspec validate compose-plan-from-routine-template --strict`。

## 2. 模型可见合同实现

- [x] 2.1 更新 `lib/server/langchain-agent/prompt.ts` 的 plan Planner Policy，表达 `plan = reusable routine template + schedule`，并要求候选事实足够时进入 `submitVisibleTrainingProposal(payload.kind="plan")`。
- [x] 2.2 更新 `lib/server/langchain-agent/prompt.ts` 的多天计划 flow example，表达先构造同一套 `exerciseItems[]` / `prescription`，再补 `schedule.assignments`。
- [x] 2.3 更新 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts` 的 `payload` schema description，表达 `kind=plan` 的 `exerciseItems[]` 是可重复 routine template，`schedule` 是周期安排。
- [x] 2.4 更新 `submitVisibleTrainingProposal` tool description，补充 `Plan Composition` 边界，并继续说明 content 不能替代结构化 plan。

## 3. 测试

- [x] 3.1 更新 prompt / production tool catalog 合同测试，覆盖 composition-first plan 规则、`routine template + schedule` 文案和不依赖服务端关键词分流。
- [x] 3.2 更新 `submitVisibleTrainingProposal` tool description / schema description 测试，覆盖 plan composition 说明。
- [x] 3.3 增加或更新合法 `payload.kind="plan"` 的 validator / tool-level 测试，覆盖同一套 `exerciseItems[]` 加 7 天 `schedule.assignments`。
- [x] 3.4 增加等价语义回归样例，覆盖“一周、每天 20 分钟、徒手、全身、包含热身拉伸”的请求应一次性进入 `payload.kind="plan"`，而不是只用 content 描述计划。

## 4. 验证和收尾

- [x] 4.1 运行与本次改动相关的最窄测试。
- [x] 4.2 按需运行 `npm run typecheck`，或说明无法运行原因。
- [x] 4.3 检查 diff，确认未新增服务端关键词规则、自然语言模板路由、phrasing 特判、runtime 业务 `toolName` 分支或 response adapter 代生成 plan。
