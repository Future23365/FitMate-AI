## 1. 范围与治理

- [x] 1.1 读取最新 `codex_logs/ai_trace_log.js` 和必要的 `ai_trace_texts.jsonl` 片段，确认本 change 的失败证据是“tool 已执行后，Planner 用无 grounding 的成功 `final_answer` 承诺后续继续”。
- [x] 1.2 使用 `agent-tool-change-governance` 完成 core contract 变更边界审查，确认主类型是 `core contract`，不是单个业务 tool bug 或 production route 分流。
- [x] 1.3 使用 `agent-prompt-contract-governance` 检查模型实际可见输入来源，确认需要同步默认 prompt、tool manifest / observation 和 repair feedback。
- [x] 1.4 使用 `agent-fix-abstraction-gate` 审查方案，确认没有把 trace 原话、assistant 正文、具体 `toolName` 或字段组合升格为服务端语义分流规则。
- [x] 1.5 运行 `git status --short`，确认不混入已有无关改动。

## 2. Core Terminal Grounding

- [x] 2.1 在 `tests/agent-core/planner-validator.test.ts` 先补回归：当前 run 已有 tool result 时，无 `usedToolResultIds`、无 `usedResourceRefs`、无 `visibleOutputs[]` 的成功 `final_answer` 必须被拒绝。
- [x] 2.2 补充正例回归：没有 tool result 的普通自然语言 `final_answer` 仍合法。
- [x] 2.3 补充正例回归：有 satisfied `usedToolResultIds`、consumable `usedResourceRefs` 或合法 `visibleOutputs[]` 的 `final_answer` 仍合法。
- [x] 2.4 更新 `lib/server/agent-core/action-validator.ts`，在 terminal action 校验中增加工具执行后的无 grounding 成功 `final_answer` guard；guard 只读取结构化 action 和当前 run 状态，不读取用户原文、assistant 正文或具体业务 `toolName`。
- [x] 2.5 更新 invalid terminal completion 的 repair feedback，说明合法恢复方式包括继续 `tool_call`、引用已满足 tool result/resource、输出合法 `visibleOutputs[]`、`ask_user` 澄清或明确失败收口。

## 3. 模型可见 Prompt 合同

- [x] 3.1 更新 `lib/server/config/agent-llm-prompt-config.ts`，说明 `final_answer` 是当前 run 终态，不会触发回复后的自动 tool 调用。
- [x] 3.2 在默认 prompt 中明确禁止：不得用 `final_answer.content` 承诺尚未执行的查询、生成、保存、等待或后续内部动作。
- [x] 3.3 在默认 prompt 中明确：当前 run 已有 tool result 后，成功 `final_answer` 应通过 `usedToolResultIds`、`usedResourceRefs` 或合法 `visibleOutputs[]` grounding。
- [x] 3.4 保持普通聊天边界：prompt 必须继续允许不需要 tool 的普通问答、能力说明、训练原则解释使用自然语言 `final_answer`。
- [x] 3.5 bump `agentLlmPromptVersion`，并更新 `tests/agent-core/agent-llm-prompt-config.test.ts` 断言新终态合同进入模型实际可见 system message。

## 4. 业务 Tool 模型可见说明

- [x] 4.1 更新 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 `description`、`whenToUse`、`whenNotToUse` 或 `toModelObservation`，说明 `read_recent` 只导入事实，不代表最终训练结构已生成。
- [x] 4.2 更新 `inspectVisibleTrainingProposals` 的模型可见说明，表达需要后续事实时应继续合法 `tool_call`、`ask_user` 澄清或明确失败收口；不得承诺 `final_answer` 后自动继续。
- [x] 4.3 更新 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 manifest / observation，说明查询结果只提供 section-scoped 动作事实，最终训练输出仍由合法 `final_answer.visibleOutputs[]` 或 grounded terminal action 承载。
- [x] 4.4 更新 `searchExerciseResources` 的模型可见说明，表达若最终结构仍缺事实，应继续合法 `tool_call`、澄清或明确失败收口，不能用成功 `final_answer.content` 承诺异步继续。
- [x] 4.5 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`、`tests/agent-tools/search-exercise-resources.test.ts` 和 `tests/agent-core/tool-registry-manifest.test.ts`，断言相关描述性自然语言默认中文且不要求固定 tool 调用顺序。

## 5. 生产聊天回归

- [x] 5.1 在 `tests/chat-service.test.ts` 增加 ReplayPlanner 回归：`read_recent` 成功后，Planner 输出无 grounding 的 `final_answer`，Runtime 必须进入 repair，且不得提前渲染该被拒绝 content。
- [x] 5.2 在同一回归中覆盖 repair 后 Planner 可继续调用 `searchExerciseResources` 查询缺失 section，并最终输出合法 `visibleTrainingProposal`。
- [x] 5.3 增加至少一个等价语义变体测试，覆盖同类“用户确认上一轮动作后要求继续编排”的失败类别；具体用户输入只出现在测试样例中，不进入生产规则。
- [x] 5.4 增加 repair exhausted 回归：Planner 重复输出无 grounding terminal completion 时，production adapter 输出安全中文失败收口，不显示内部错误，也不渲染被拒绝 content。
- [x] 5.5 保留现有 0 条动作查询、普通事实回答、基础聊天和 section readiness 回归，确认新 guard 不打破合法 `final_answer`。

## 6. 架构与边界检查

- [x] 6.1 更新或补充 `tests/agent-core/architecture-boundary.test.ts`，扫描确认 `/api/chat`、Agent core、business tool handler 没有新增用户原文关键词、正则、同义词表、短句模板、assistant 正文匹配或具体 phrasing 特判。
- [x] 6.2 扫描确认 `agent-core` 没有新增具体业务 `toolName` 语义分支。
- [x] 6.3 扫描确认默认 prompt 和生产模型可见合同没有恢复 `generatePlanDraft`、`generateRoutineDraft`、隐藏训练生成服务或绕过 `ToolRegistry` 的能力说明。
- [x] 6.4 确认 `/api/chat` 请求 / 响应外部契约、`PlannerPort`、Executor 主流程、Policy Guard 主流程和 Response Renderer 主流程未被修改。

## 7. 验证

- [x] 7.1 运行 `openspec validate harden-agent-terminal-completion-contract --strict`。
- [x] 7.2 运行 `npm test -- tests/agent-core/planner-validator.test.ts`。
- [x] 7.3 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`。
- [x] 7.4 运行 `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 7.5 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 7.6 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 7.7 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 7.8 修改 TypeScript、Schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`。
- [x] 7.9 如无法运行真实 LLM 黑盒验证，在实现总结中说明原因和剩余风险；不得把未验证黑盒结果写成已完成。

## 8. 文档与收尾

- [x] 8.1 若实现改变核心 Agent 终态合同或生产聊天失败收口，在 `docs/方案变更历史/` 新增上海时间记录。
- [x] 8.2 若实现改变核心链路行为，在 `docs/项目演变历程.md` 末尾追加简要演变记录。
- [x] 8.3 最终 diff 检查，确认没有混入 `features/chat/lib/agent-activity.ts`、`tests/chat-agent-activity.test.ts` 或其他无关用户改动。
- [x] 8.4 完成后总结改了什么、为什么优于局部 prompt 补丁、如何验证、剩余风险。
