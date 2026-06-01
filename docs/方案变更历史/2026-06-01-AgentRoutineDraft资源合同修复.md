# 2026-06-01 22:52:59 CST Agent Routine Draft 资源合同修复

## 当前真实问题

`/api/chat` 的 Tool-first Agent 已经能正确识别“安排一套训练”，并调用 `searchExercises(candidateUse="routine")` 与 `generateRoutineDraft`。最新 trace 显示 `generateRoutineDraft` 成功产出 `draftId` 和通过校验的 routine draft，但下一步 `validateRoutineDraft` 要求模型再次提交完整 `draft` 对象。

模型下一轮可见的 tool result 只有压缩 summary，没有完整 draft payload，因此实际调用只带了 `draftId`、候选集合和 intent，最终触发 `schema_validation_failed`。Agent 随后退回纯文本 `answered`，没有继续执行 Policy 和 `saveConversationArtifactRevision`，聊天页面也就没有 routine 编排卡片可展示。

## 调整思路

这不是 prompt 细节问题，而是工具合同边界不清：LLM 应该选择工具和引用资源 id，完整训练 payload 应由服务端 runtime 持有并传递。让模型复写完整 draft 会增加 token、放大字段漂移风险，也会把服务端已验证事实重新交给模型加工。

因此本次改为：`generateRoutineDraft` 的完整 output 保存到本轮 `AgentToolResultRecord.output`，后续 validation、policy 和 artifact revision 工具通过 `draftId`、`validationId`、`policyDecisionId` 从当前 Agent run 的 tool results 解析结构化事实。

## 关键改动

- `AgentToolResultRecord` 增加服务端内部 `output`，模型输入仍只使用压缩 summary。
- `AgentToolExecutionContext` 携带当前 run 的 `toolResults`，供后续工具解析上游资源。
- `validateRoutineDraft` 不再要求模型提交完整 `draft`，而是通过 `draftId` 找回 routine draft。
- `saveConversationArtifactRevision` 在有 `draftId` 时使用已登记 draft payload 写入 artifact revision。
- 对缺失资源、资源类型不匹配、候选集合不一致、validation/policy 不匹配返回结构化失败。
- Agent prompt 补充要求：draft 生成后只能引用已登记资源 id，不得复写完整 payload。

## 验证结果

- `npm test -- tests/agent-orchestrator.test.ts`：32 个测试通过。
- `npm run typecheck`：通过。
- `npm test`：42 个测试文件、257 个测试通过。
- `openspec validate fix-agent-routine-draft-resource-contract --strict`：通过。
