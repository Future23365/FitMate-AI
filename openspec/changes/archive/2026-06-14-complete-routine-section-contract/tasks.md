## 1. 合同审查

- [x] 1.1 使用 agent-fix-abstraction-gate 完成抽象层级门禁，确认不把具体用户短句、具体 toolName 字段组合或本次 trace 升格成通用规则。
- [x] 1.2 使用 agent-prompt-contract-governance 检查模型可见分层，确认完整 routine 规则落在业务 tool description / schema description / tool result summary，而不是服务端语义分流。
- [x] 1.3 使用 agent-tool-change-governance 检查执行边界，确认不修改 LangChain runtime 主循环、provider payload、production response adapter 或 `/api/chat` 主链路。
- [x] 1.4 运行 `openspec validate complete-routine-section-contract --strict`，确保 proposal、design、spec 和 tasks 合法。

## 2. 模型可见合同实现

- [x] 2.1 更新 `submitVisibleTrainingProposal` 的 description 和 `payload` schema description，表达完整 `routine` 默认包含 `warmup`、`training`、`stretch`，且 `training` 承载用户主训练目标。
- [x] 2.2 更新 `searchExerciseResources` 的 description / schema description，表达 `suitabilities` 可查询 `warmup`、`training`、`stretch` 的动作事实，并明确 coverage facts 不指挥固定下一步。
- [x] 2.3 更新 `submitVisibleTrainingProposal` accepted model-visible summary / trace summary，加入 `sectionSummary`、`availableSections`、`missingSections`，并避免 `nextActionHints`、`recommendedNextStep` 或业务目标满足度字段。
- [x] 2.4 如需调整默认 prompt，只保留高层结构化交付边界，不写具体业务 toolName 触发条件、关键词分流或固定 section 补查流程。

## 3. 测试与验证

- [x] 3.1 更新 prompt / runtime 合同测试，断言完整 routine 规则在业务 tool 模型可见说明中，而不是默认 system prompt 的固定 workflow。
- [x] 3.2 更新 `submitVisibleTrainingProposal` tool-level 测试，覆盖 accepted summary 的 section 覆盖事实和禁止下一步提示字段。
- [x] 3.3 更新 `searchExerciseResources` tool-level 或 catalog 测试，覆盖 `suitabilities` section 查询能力说明和不强制固定下一步。
- [x] 3.4 增加回归测试：核心训练 `routine` 场景中，模型可见合同能支持 `warmup`、核心 `training`、`stretch` 三段；用户明确只要主训练时允许部分范围并可通过 `suggestedQuestions` 继续补齐。
- [x] 3.5 运行模型可见合同门禁测试，确认没有新增关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 3.6 运行相关自动化测试和 `npm run typecheck`。

## 4. 收尾

- [x] 4.1 检查最终 diff，确认未修改 runtime 主循环、response adapter 主流程、`/api/chat` route、数据库 schema 或前端事件协议。
- [x] 4.2 更新本 `tasks.md` 完成状态，并提交中文 commit message。
