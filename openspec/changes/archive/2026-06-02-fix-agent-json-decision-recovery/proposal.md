## Why

当前 `/api/chat` Tool-first Agent 在同一提问下会出现随机失败：模型已经选择了正确的下一步工具，但偶发在 JSON 对象末尾多输出一个 `}`，导致严格解析直接返回 `model_output_invalid`。这会让已成功生成的 routine draft 无法继续进入 Validator / Policy / Save 闭环，用户只能看到“这次执行没有完成”。

## What Changes

- 为 Agent decision 模型输出增加非语义 JSON 恢复：仅处理尾随非空白字符、fenced JSON 或包裹文本中可提取出唯一 JSON object 的格式问题。
- 恢复后的对象仍必须通过 `JSON.parse`、`AgentToolDecision` Schema、registry 工具名和工具输入 Schema 校验；服务端不得基于用户原文或关键词改写 action、toolName、intent 或训练语义。
- 当格式恢复成功时，trace 必须记录原始解析失败、恢复方式和后续校验结果，便于调试“模型格式波动”与“真正 schema 失败”。
- 当恢复失败或恢复后 schema 仍不合法时，继续走现有可诊断失败路径，不恢复旧 intent-first、旧 `assistant_action`、summary-only payload reconstruction 或服务端自然语言兜底。
- 补充单元测试覆盖尾随 `}` 的 `validateRoutineDraft` 决策、fenced JSON、无法恢复的坏 JSON 和恢复后仍非法的决策。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `chat-intent-decision-flow`: Agent decision 解析失败时必须优先使用非语义格式恢复或可诊断失败处理，不能直接调用旧意图架构或服务端语义兜底。
- `ai-run-trace`: trace 必须记录 Agent decision JSON 恢复的失败来源、恢复方式和恢复后校验结果。

## Impact

- 影响 `lib/server/chat/chat-service.ts`、`lib/server/agent-orchestrator/tool-registry.ts`、`lib/server/agent-orchestrator/runtime.ts`。
- 影响 `tests/chat-service.test.ts`、`tests/agent-orchestrator.test.ts`。
- 需要新增 `docs/方案变更历史/` 记录，并追加 `docs/项目演变历程.md`。
- 不修改数据库 Schema、HTTP API 契约、前端 UI 或训练领域生成规则。
