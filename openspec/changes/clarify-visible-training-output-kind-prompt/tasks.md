## 1. 范围与治理

- [x] 1.1 使用 `agent-prompt-contract-governance` 确认本 change 的 primary 范围是模型实际可见 prompt、tool manifest / examples 和 judge prompt。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 审查 prompt 片段，确认代表性语义范式没有变成服务端关键词规则、自然语言模板路由或具体 phrasing 特判。
- [x] 1.3 运行 `git status --short`，确认不混入无关工作区改动。
- [x] 1.4 实现前确认是否存在正在进行的 `harden-agent-terminal-completion-contract` 或 `unify-agent-semantic-slot-fields` 改动，避免重复改同一合同。

## 2. 默认 Agent prompt

- [x] 2.1 更新 `lib/server/config/agent-llm-prompt-config.ts`，加入产品训练输出能力地图。
- [x] 2.2 加入 `visibleTrainingProposal.payload.kind` 选择指南，明确 `exercise_selection`、`routine`、`plan` 的目标边界。
- [x] 2.3 加入输出类型优先级：多天 / 频次 / 周期目标优先 `plan`，单次可执行训练目标优先 `routine`，动作清单目标才是 `exercise_selection`。
- [x] 2.4 加入代表性语义范式，并明确这些示例不是固定触发词、关键词规则或服务端分流依据。
- [x] 2.5 加入 terminal 前完成度检查：如果目标需要 `routine` / `plan`，当前只拿到 `training` 且可补查缺失 section，应继续 tool_call，而不是降级为 `exercise_selection`。
- [x] 2.6 加入候选不足的可恢复收口：说明缺口和下一步，不让用户自行组合动作列表。
- [x] 2.7 更新 prompt config 测试，断言上述文案进入模型实际可见 system prompt。

## 3. `searchExerciseResources` 模型可见说明

- [x] 3.1 更新 `searchExerciseResources` examples，包含 routine / plan 目标下补查 `suitabilities = ["warmup", "stretch"]` 的合法 input。
- [x] 3.2 按需微调 `whenToUse` / `whenNotToUse`，让 tool loop 说明与新的 `payload.kind` 选择指南一致。
- [x] 3.3 确认不修改 tool handler、input schema、output schema、数据库查询语义或 `suitabilities` 执行合同。
- [x] 3.4 更新 tool manifest / examples 测试。

## 4. 基础黑盒 judge prompt

- [x] 4.1 更新 `manual-tests/llm/basic-chat-judge.ts`，继续把 routine 目标降级为动作推荐、`exercise_selection`、正文动作列表或下一轮再生成判失败。
- [x] 4.2 增加 plan 目标失败边界：期望多天 / 周期 / 每周安排时，只给动作列表、`exercise_selection`、无 schedule 的单次 routine 或下一轮再生成计划应判失败。
- [x] 4.3 更新 `tests/manual-llm-basic-blackbox.test.ts` 或等价测试，断言 judge prompt 包含 routine 和 plan 降级失败规则。

## 5. 回归测试

- [x] 5.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖能力地图、输出类型选择指南和代表性语义范式。
- [x] 5.2 更新 `tests/agent-tools/search-exercise-resources.test.ts` 或 manifest 快照测试，覆盖 warmup / stretch 补查 example。
- [x] 5.3 更新 `tests/chat-service.test.ts` 或等价 production replay，覆盖含单次训练语义的请求最终需要 `routine`，含每周频次 / 周期语义的请求最终需要 `plan`。
- [x] 5.4 回归样例可以包含“居家背部 30 分钟训练”“胸部 20 分钟无器械训练”“循环胸部训练”“每周 3 练，每次 25 分钟”等，但这些样例只能用于测试，不得进入服务端分流。

## 6. 验证

- [x] 6.1 运行 `openspec validate clarify-visible-training-output-kind-prompt --strict`。
- [x] 6.2 运行相关自动化测试：prompt config、tool manifest / examples、manual LLM judge contract、production replay。
- [x] 6.3 修改 TypeScript 后运行 `npm run typecheck`。
- [x] 6.4 用 `rg` 检查没有在 `/api/chat`、Agent runtime、tool handler、validator 或 renderer 中新增用户原文关键词、正则、同义词表、短句模板或服务端语义分流。
- [x] 6.5 如不运行真实 LLM 黑盒，最终总结说明未消耗模型调用和剩余风险。
