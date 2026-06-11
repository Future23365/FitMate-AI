# 2026-06-01 23:32:39 CST Agent Routine Draft 误传字段兜底

## 当前真实问题

前一版 `Agent Routine Draft 资源合同修复` 已经把完整 routine draft 存入服务端 tool result，并让 `validateRoutineDraft` 在执行阶段通过 `draftId` 解析完整 draft。但最新 trace 显示，模型在调用 `validateRoutineDraft` 时仍额外提交了一个不完整的 `draft` 对象。

由于 `validateRoutineDraftAgentToolInputSchema` 仍声明了可选 `draft` 字段，Zod 会先按完整 `WorkoutRoutineDraft` 合同校验这个 partial payload。执行函数还没进入 `resolveRoutineDraftResource()`，工具调用就已经因 `schema_validation_failed` 中断，导致 Agent 退回纯文本回答，没有继续执行 Policy 和 artifact 写入。

## 调整思路

这次问题仍然不是让 prompt 再强调“不要传 draft”可以稳定解决的类型。模型可见工具合同里只要存在 `draft` 字段，就有机会诱导模型复写一个字段漂移的 payload。

因此本次把 validation 工具输入彻底收紧为“资源引用 + 边界字段”：模型只提交 `draftId`、`candidateSetId`、可选候选动作 id 和 intent；完整 draft 只能来自当前 Agent run 的服务端 tool result。模型误传的 `draft` 作为未知字段被 Zod 丢弃，不参与校验事实源。

## 关键改动

- 移除 `validateRoutineDraft` 的模型可见 `draft` 输入字段。
- 同步移除 `validatePlanDraft` 的模型可见 `draft` 输入字段，保持 plan/routine 的资源引用合同一致。
- 补充 OpenSpec 场景：模型误传 partial `draft` 时，服务端不得使用该 payload，也不得因此返回 `schema_validation_failed`。
- 新增 Agent 工具回归测试，复现 trace 中 `sectionType` / `exercises` 这类 partial draft 输入，并确认系统仍按 `draftId` 解析服务端完整 draft 校验成功。

## 验证结果

- `npm test -- tests/agent-orchestrator.test.ts`：1 个测试文件、35 个测试通过。
- `npm run typecheck`：通过。
- `openspec validate fix-agent-routine-draft-resource-contract --strict`：通过。
