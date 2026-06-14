## 1. 合同治理

- [x] 1.1 使用 `agent-prompt-contract-governance` 确认本次变更只修改模型可见 prompt、tool description、schema description 和相关测试，不修改 runtime / route / handler / validator / response adapter。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 确认方案没有把具体 trace、用户原话、toolName 或字段组合升格成服务端语义规则。
- [x] 1.3 明确排除 `repair feedback` 修改，避免把自然语言策略放入服务端失败反馈。

## 2. 模型可见说明实现

- [x] 2.1 更新 `lib/server/langchain-agent/prompt.ts`，让动作推荐集合的 `content` 只解释推荐理由、目标肌群、动作注意事项、适用场景和动作差异，不主动输出组数、次数、时长、休息、训练频率或日程。
- [x] 2.2 更新 `submitVisibleTrainingProposal` 的 input schema description，明确 `exercise_selection`、`routine`、`plan` 的处方 / 日程边界。
- [x] 2.3 更新 `submitVisibleTrainingProposal` 的 tool description，明确 `exercise_selection` 的正文不能绕过结构合同输出处方参数。

## 3. 测试与验证

- [x] 3.1 更新或新增 prompt / tool description contract tests，覆盖动作推荐正文边界和 `exercise_selection` 不承载处方参数。
- [x] 3.2 运行 `openspec validate tighten-exercise-selection-text-contract --strict`。
- [x] 3.3 运行与本次改动相关的自动化测试。
- [x] 3.4 检查最终 diff，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、repair feedback 修改或具体业务 `toolName` 语义分支。
