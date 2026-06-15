## Context

生产 `/api/chat` 当前使用 LangChain Agent Runtime、DeepSeek native `tool_calls` 和 `toolStrategy` 提交 `fitmate_final_response`。当主 Agent 结束后，runtime 会读取 `state.structuredResponse` 并用 `parseLangChainFinalResponse()` 校验。如果该结构缺失或不合法，当前实现直接返回 `structured_output_validation_failed`，随后 `/api/chat` 进入 terminal failure finalizer。

最近 trace 显示：动作查询工具已成功返回 warmup / training / stretch 候选事实，但主 Agent 最后一轮没有调用 `submitVisibleTrainingProposal`，也没有产出合法 `fitmate_final_response`。系统因此直接进入 terminal failure finalizer。这个失败属于“可恢复的结构化终态缺失”，不应直接等同于最终不可恢复失败。

本变更同时触碰 LangChain runtime 执行合同和 terminal failure finalizer 的模型可见失败收口说明。实现必须遵守现有 Agent 边界：不在服务端按用户原文做关键词分流，不在 response adapter 中补业务 plan，不在 runtime 中写具体业务 `toolName` 语义分支。

## Goals / Non-Goals

**Goals:**

- 在 `fitmate_final_response` 缺失或不合法时，先给主 Agent 一次受限 repair 机会。
- repair 必须复用当前工具目录、当前消息和当前已验证 tool facts，让模型自己完成原任务或围绕原任务追问一个关键条件。
- repair 成功时走正常 response adapter 投影；repair 失败时才进入 terminal failure finalizer。
- terminal failure finalizer 的建议问题必须服务原始任务，不再引导用户换成无关动作解释、区别说明或其他任务。
- 增加最窄回归测试，覆盖结构化终态缺失 repair、repair 失败降级和 finalizer 提示词边界。

**Non-Goals:**

- 不让服务端根据用户自然语言、关键词、短句模板或 phrasing 生成或改写 provider tool call。
- 不在 runtime 中按 `searchExerciseResources`、`submitVisibleTrainingProposal` 或具体字段组合写业务分支。
- 不让 response adapter 生成、修补或渲染未通过 finalization tool / validator 的训练方案。
- 不改变 `submitVisibleTrainingProposal` 的业务 validator、数据库事实校验或可见训练卡片 schema。
- 不恢复旧 `AgentAction`、旧 PlannerPort、旧 ToolRegistry 或旧 response renderer。

## Decisions

### 1. 将 repair 放在 LangChain runtime 的结构化最终回答校验失败分支

当 `parseLangChainFinalResponse(readStructuredResponseFromState(state))` 失败时，runtime 调用一个独立 helper 尝试修复。helper 重新运行一次受控 LangChain Agent 请求，输入包括当前消息、已生成消息、当前工具列表和结构化最终回答 schema 修复反馈。

选择这个位置的原因：它是最早能确定“主 Agent 没有合法终态”的位置，也保留了当前 run 的工具事实、provider tool call trace 和 wrapper 校验边界。相比在 `/api/chat` 或 response adapter 中处理，runtime repair 更接近执行合同，不会把 UI 投影层变成业务编排层。

备选方案：

- 直接放宽 final response 校验：不可取。前端和 persistence 仍需要稳定 `{ content, suggestedQuestions }` 结构。
- 在 response adapter 看到失败后生成普通正文：不可取。adapter 不应理解或修补业务任务。
- 在服务端检测“用户要 plan”后强制调用 `submitVisibleTrainingProposal`：不可取，会引入自然语言语义分流和业务 tool 特判。

### 2. repair 只修复终态结构，不替模型规划业务语义

repair feedback 只说明上一轮缺少合法 `fitmate_final_response`，并给出当前合法出口：

- 如果原任务需要结构化训练卡片、routine 或 plan，模型必须通过当前可用 finalization tool 提交并接受服务端 validator。
- 如果当前事实不足，模型必须输出合法 `fitmate_final_response.content`，围绕原任务追问一个关键条件。
- 如果只需要普通训练知识回答，模型可以输出合法 `fitmate_final_response.content`。
- 不允许建议用户换成无关任务，不允许把未通过 finalization 的结构化训练事实只写入正文。

该反馈不包含具体用户短句触发规则，不包含固定业务 `toolName` 分支，也不根据 tool result 的具体字段组合决定下一步。

### 3. repair 预算固定为一次

本次只新增一次 repair 尝试。repair 成功即返回正常结果；repair 失败则保持原有失败路径进入 terminal failure finalizer。这样可以避免无限修复循环，也不会绕过现有 `maxModelCalls`、tool 执行预算和 terminal failure 安全兜底。

后续如果需要多轮 repair，应另行设计集中配置、trace 投影和预算策略。

### 4. terminal failure finalizer 只做任务内失败收口

terminal failure finalizer 不再允许“把问题改成普通动作解释/区别说明”。它可以建议用户补充训练目标、身体限制、器械、时间、强度等与原始任务直接相关的条件，也可以给出继续完成原任务的自然下一步，但不得引导用户换到无关任务。

这个修改属于 failure prompt 收口，不让 finalizer 继续执行原任务，也不让它调用工具或输出 visible output。

## Risks / Trade-offs

- Repair 可能增加一次模型调用和少量 token 成本。缓解：只在结构化最终回答缺失或不合法时触发，并固定一次。
- 模型在 repair 中仍可能失败。缓解：失败后保留 terminal failure finalizer 和确定性 fallback。
- Repair 成功时 trace 需要能复盘。缓解：复用现有 model call recorder / trace summary，并在测试中覆盖 provider tool call 与 final response。
- Prompt 过强可能被理解成固定 workflow。缓解：repair feedback 只列合法出口，不写具体用户短句、业务字段组合或强制下一步 tool。

## Migration Plan

1. 新增结构化最终回答 repair helper 和 runtime 接线。
2. 收窄 terminal failure finalizer prompt。
3. 补 runtime / finalizer 单测和模型可见合同测试。
4. 运行 `openspec validate repair-structured-final-response-before-terminal-failure --strict`、相关 `npm test` 和 `npm run typecheck`。

该变更不涉及数据库迁移、环境变量或前端路由变更。若上线后 repair 导致异常，可通过回滚本次 runtime 接线恢复原有 terminal failure 行为。
