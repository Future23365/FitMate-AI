# Agent Tool Diagnostic Grounding 补漏

时间：2026-06-03 15:57:06 CST

## 背景

M2 已经阻止 `final_answer.usedResourceRefs` 显式引用 diagnostic resource 作为成功依据，但 `usedToolResultIds` 只校验了 tool result 是否存在。这样在 diagnostic fixture 返回 `ok=true` 且 `fulfillment.satisfied=false` 时，模型仍可能只引用该 toolResultId 输出成功 final answer，绕过 resource role 校验。

## 调整思路

这次补漏仍只做结构化合同校验，不判断用户自然语言语义。`final_answer` 引用的 tool result 必须是当前 run 内存在、执行成功且 `fulfillment.satisfied=true` 的结果；failed 或 unsatisfied tool result 只能用于 `ask_user`、失败解释或后续 repair。

## 关键改动

- `Action Validator` 对 `final_answer.usedToolResultIds` 增加 `ok` 和 `fulfillment.satisfied` 校验。
- 保留 `ask_user.usedToolResultIds` 引用 unsatisfied / diagnostic tool result 的能力，用于解释阻断和追问。
- 增加 validator、M1 runtime 和 DeepSeek fixture adapter 回归测试，覆盖只引用 diagnostic toolResultId 的成功回答逃逸场景。

## 结果

diagnostic resource 和 diagnostic/unsatisfied tool result 现在都不能支撑成功 final answer。terminal grounding 的成功依据统一收敛为 consumable resource 或 satisfied tool result，避免接真实业务 tool 前留下诊断结果伪装成成功结果的边界缝隙。
