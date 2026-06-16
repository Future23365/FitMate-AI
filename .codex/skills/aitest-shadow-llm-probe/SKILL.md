---
name: aitest-shadow-llm-probe
description: 在 AITest 中执行 dev-only Codex Shadow LLM Probe。用于让 Codex 只基于 runner 导出的模型可见输入文件，逐轮写出结构化 tool/final/contract_gap 决策，并配合项目 CLI 推进真实 dev-safe tool 与报告生成。
---

# AITest Shadow LLM Probe

## 触发场景

当开发者要求诊断生产 LangChain Agent 的 prompt、tool description、schema description、tool result summary、finalization 或停止条件是否清晰时，使用本 skill。

本 skill 只服务本地开发诊断，不是生产 LLM provider，也不替代 `/api/chat`、DeepSeek、LangChain runtime 或业务 tool handler。

## 硬边界

- 只能读取当前轮 `round-xxx-input.json` 和该文件内引用的上一轮模型可见 `toolResultSummaries`。
- 不读取仓库源码、OpenSpec 文档、Codex memory、历史 trace、debug-only 字段、数据库 raw payload 或开发者解释来决定下一步。
- 无法从当前 shadow input 可靠推出的判断，必须输出 `decision = "contract_gap"`。
- 不根据用户原话、关键词、正则、同义词、短句模板或历史经验替生产模型选择工具。
- 不伪造工具已执行，不编造 `exerciseId`、resource id、schema 字段或 tool result。

## 每轮流程

1. 打开 runner 输出的 `round-xxx-input.json`。
2. 按 `references/shadow-input-contract.md` 检查可见事实、工具目录、finalization tool 和预算。
3. 只基于 input 内部 `sourceRefs`、`messages`、`tools`、`toolResultSummaries` 和 `budget` 判断下一步。
4. 写出同轮 `round-xxx-decision.json`，结构必须符合 `references/decision-output-schema.md`。
5. 在 `evidence[]` 和 `fieldRationale[]` 中引用 input 内部 JSON path，例如 `$.messages[0].content`。
6. 填写 `contaminationAudit`；如果某个判断来自外部记忆或源码知识，标记污染风险并改为 `contract_gap`。
7. 让开发者运行 `npm run shadow:llm-probe -- --continue <runId>` 推进。

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

runner 生成的 `report.md` 分为 Shadow 决策报告和开发者诊断建议。Shadow 决策报告只引用 run 目录内的 input、decision 和 tool result summary。开发者诊断建议可以在报告冻结后由开发者另行补充源码或测试依据，但不得倒灌为 Shadow 决策依据。

