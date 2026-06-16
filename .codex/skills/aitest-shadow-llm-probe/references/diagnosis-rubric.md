# Diagnosis Rubric

报告归因必须使用稳定合同类别，不把具体用户短句、trace 个例或字段组合升格成生产规则。

## 固定类别

- `prompt_conflict`：system prompt 或 planner policy 存在冲突。
- `tool_selection_ambiguous`：可见工具边界不足以稳定选择下一步。
- `schema_source_unclear`：字段来源、枚举或 ID/ref 来源不清。
- `tool_result_summary_insufficient`：ToolMessage summary 缺少下轮决策必需事实。
- `stop_condition_unclear`：停止查询、结构化收口或追问边界不清。
- `finalization_contract_unclear`：`fitmate_final_response` 或结构化终态合同不清。
- `debug_only_leakage`：Shadow input 混入模型不可见诊断事实。
- `case_specific_rule_smell`：把用户短句、字段组合或具体 case 写成通用生产规则。
- `runtime_budget_mismatch`：模型可见预算与 runner / runtime 实际预算不一致。
- `contamination_risk`：Shadow 决策使用了 input 外部知识。

## 分段要求

Shadow 决策报告只引用 run 目录内的 input、decision 和 tool result summary。

开发者诊断建议可以引用源码、测试或 OpenSpec，但必须标注“不是 Shadow 决策依据”。

