## Why

当前 LangChain 主 Agent 在最后一轮没有产出合法 `fitmate_final_response` 时，会直接返回 `structured_output_validation_failed` 并进入 terminal failure finalizer。这样会把“可恢复的终态结构缺失”提前升级为失败兜底，导致用户已经给出足够训练计划条件时仍看不到 `plan`，甚至被建议改问无关动作解释问题。

本变更要把 terminal failure 恢复为最后兜底：主 Agent 结构化最终回答无效时，先执行一次受限 repair；repair 仍失败时才进入 terminal failure finalizer。

## What Changes

- 为 LangChain runtime 增加结构化最终回答 repair 分支：当 `fitmate_final_response` 缺失或不合法时，先基于当前消息、成功 tool facts、当前 tool catalog 和 schema 错误尝试一次修复。
- repair 成功时返回正常 LangChain run 结果；如果模型需要继续交付训练卡片、routine 或 plan，仍必须通过对应 finalization tool 和服务端 validator。
- repair 失败后才返回 `structured_output_validation_failed`，再由 `/api/chat` 进入 terminal failure finalizer。
- 收窄 terminal failure finalizer 的模型可见规则：失败兜底只能围绕原始健身任务补充必要条件或说明可继续方向，不得建议用户改问无关动作解释、区别说明或其他任务。
- 补充 runtime、finalizer 和回归测试，覆盖结构化终态缺失 repair、repair 失败兜底以及 plan 请求不应直接进入 terminal failure。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `langchain-agent-runtime`: 增加结构化最终回答无效时的受限 repair 行为，避免直接进入 terminal failure。
- `agent-terminal-failure-finalizer`: 收窄 failure finalizer 的下一步建议范围，确保失败回复不引导用户换成无关任务。

## Impact

- 影响 `lib/server/langchain-agent/runtime.ts` 及新增的结构化最终回答 repair helper。
- 影响 `lib/server/langchain-agent/terminal-failure-finalizer.ts` 的模型可见 prompt。
- 影响 LangChain runtime 和 terminal failure finalizer 的单元测试。
- 不修改 `/api/chat` 业务路由，不新增服务端自然语言关键词分流，不在 runtime 中写具体业务 `toolName` 语义分支，不让 response adapter 生成业务 plan。
