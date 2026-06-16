---
name: aitest-shadow-llm-probe
description: 仅当用户明确点名使用 aitest-shadow-llm-probe、$aitest-shadow-llm-probe 或该 skill 路径时使用；不要因普通 Agent 诊断、prompt/tool 合同排查或 Shadow Probe 相关问题自动触发。该 skill 用于在 AITest 中执行 dev-only Codex Shadow LLM Probe。
---

# AITest Shadow LLM Probe

## 触发场景

只有当开发者明确说“使用 `aitest-shadow-llm-probe`”、点名 `$aitest-shadow-llm-probe`，或提供本 skill 路径时，才使用本 skill。

不要因为用户只是要求诊断生产 LangChain Agent 的 prompt、tool description、schema description、tool result summary、finalization、停止条件或 Shadow Probe 实现，就自动加载本 skill。普通 Agent 诊断仍按项目默认治理规则处理。

本 skill 只服务本地开发诊断，不是生产 LLM provider，也不替代 `/api/chat`、DeepSeek、LangChain runtime 或业务 tool handler。

## 硬边界

- 只能读取当前轮 `round-xxx-input.json` 和该文件内引用的上一轮模型可见 `toolResultSummaries`。
- 不读取仓库源码、OpenSpec 文档、Codex memory、历史 trace、debug-only 字段、数据库 raw payload 或开发者解释来决定下一步。
- 无法从当前 shadow input 可靠推出的判断，必须输出 `decision = "contract_gap"`。
- 不根据用户原话、关键词、正则、同义词、短句模板或历史经验替生产模型选择工具。
- 不伪造工具已执行，不编造 `exerciseId`、resource id、schema 字段或 tool result。

## 每轮流程

1. 运行 `npm run shadow:llm-probe -- --message "<用户原话>"` 创建 run；CLI 会自动加载项目根目录 `.env.local`。
2. 打开 runner 输出的 `round-xxx-input.json`。
3. 按 `references/shadow-input-contract.md` 检查可见事实、工具目录、finalization tool 和预算。
4. 只基于 input 内部 `sourceRefs`、`messages`、`tools`、`toolResultSummaries` 和 `budget` 判断下一步。
5. 写出同轮 `round-xxx-decision.json`，结构必须符合 `references/decision-output-schema.md`。
6. 在 `evidence[]` 和 `fieldRationale[]` 中引用 input 内部 JSON path，例如 `$.messages[0].content`。
7. 填写 `contaminationAudit`；如果某个判断来自外部记忆或源码知识，标记污染风险并改为 `contract_gap`。
8. 运行 `npm run shadow:llm-probe -- --continue <runId>` 推进；如果生成下一轮 input，重复第 2-8 步。
9. run 进入 `final_answer`、`contract_gap`、`budget_exhausted`、`decision_validation_failed` 或 `tool_execution_failed` 后，运行 `npm run shadow:llm-probe -- --report <runId>`。
10. 读取 `report.md`，用中文告诉开发者诊断结论、命中的合同类别、运行阻断和不可判断项；不要只返回文件路径。

## 允许的决策

- `call_tool`：调用当前 input 中 `tools[]` 暴露的业务 tool。
- `final_answer`：当前可见事实足以通过 `fitmate_final_response` 或等价终态收口。
- `contract_gap`：模型可见合同不足、证据不够、污染风险过高或停止条件不清。

首版可用工具范围固定为：

- `inspectVisibleTrainingProposals`
- `searchExerciseResources`
- `submitVisibleTrainingProposal`
- `fitmate_final_response` 作为 `final_answer` 终态，不作为业务 tool 执行

## 污染审计

每轮必须回答：

- 是否只使用了当前 `round-xxx-input.json`？
- 是否引用了 input 外的源码、历史经验、OpenSpec、memory、debug trace 或开发者说明？
- 如果使用了外部知识，该知识影响了哪个判断？
- 是否存在 case-specific rule smell，例如把具体用户短句、具体字段组合或具体 `toolName` 条件当成通用规则？

污染风险无法排除时，输出 `contract_gap`，不要继续推进看似正确的 tool call。

## 报告使用

runner 生成的 `report.md` 分为诊断结论、Shadow 决策报告和开发者诊断建议。Shadow 决策报告只引用 run 目录内的 input、decision 和 tool result summary。开发者诊断建议默认只基于 shadow run 文件做固定类别归因；如果后续另行引用源码、测试或 OpenSpec，必须明确标注“不是 Shadow 决策依据”，且不得倒灌为 Shadow 决策依据。

最终回复必须覆盖这些稳定类别的结论或不可判断原因：

- `prompt_conflict`：system prompt 或 planner policy 是否存在过多或互相打架的规则。
- `tool_selection_ambiguous`：tool description 是否讲清什么时候该调用。
- `schema_source_unclear`：schema description 是否讲清字段来源、枚举和 ref 来源。
- `tool_result_summary_insufficient`：tool result summary 是否把关键事实投影给模型。
- `stop_condition_unclear`：预算、重复调用、停止条件是否放在模型可操作的位置。
- `finalization_contract_unclear`：finalization tool 的完成条件是否清楚。
- `debug_only_leakage`：Shadow input 是否泄漏 debug-only 或模型不可见事实。
- `case_specific_rule_smell`：规则是否把具体 case 升格成生产通用规则。
- `runtime_budget_mismatch`：模型可见预算是否与 runner / runtime 实际预算一致。
- `contamination_risk`：Shadow 决策是否使用了 input 外部知识。

如果 runner 因数据库、环境变量或 tool handler 异常进入 `tool_execution_failed`，先说明“诊断未完成”，再说明已能判断的输入/决策阶段结论，以及 tool result summary、finalization 和后续停止条件为什么不可判断。
