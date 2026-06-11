# Tasks

- [x] 1.1 使用 `agent-prompt-contract-governance` 确认本 change 主类型为模型可见 prompt / tool description 合同变更。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 审查方案，确认没有把具体 trace、用户原话、业务 `toolName` 或字段组合升格成通用生产规则。
- [x] 1.3 更新 OpenSpec proposal / design / specs，明确允许触碰的 prompt、schema description 和 tool description 边界。
- [x] 1.4 运行 `openspec validate harden-langchain-training-finalization-prompt --strict`。

- [x] 2.1 更新 `buildLangChainAgentSystemPrompt()`，补训练结构交付必须走结构化收口的通用决策规则。
- [x] 2.2 更新 `buildLangChainAgentSystemPrompt()`，补 `content` 禁止 Markdown 水平分割线和装饰性分隔行的输出格式规则。
- [x] 2.3 更新 `LangChainFinalResponseJsonSchema.content.description`，同步字段级分隔线禁用说明。
- [x] 2.4 更新 `submitVisibleTrainingProposal` description / schema description，说明它用于训练动作集合、routine 和 plan 的结构化 finalization / validator 收口。

- [x] 3.1 更新 prompt 测试，覆盖结构化训练交付规则、普通文本回答边界、分隔线禁用规则和无旧 Agent Core 术语。
- [x] 3.2 更新 `submitVisibleTrainingProposal` tool description 测试，覆盖动作集合 / routine / plan 收口边界和禁止固定 workflow。
- [x] 3.3 运行相关自动化测试：`npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`。
- [x] 3.4 运行 `npm run typecheck`。

- [x] 4.1 更新 `docs/方案变更历史` 中本次 prompt 合同调整记录。
- [x] 4.2 在 `docs/项目演变历程.md` 末尾追加本次调整摘要。
- [x] 4.3 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
