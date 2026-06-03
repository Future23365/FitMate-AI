## 1. OpenSpec 边界

- [x] 1.1 新增 change 文档，说明 prompt 修改类型、允许触碰入口、禁止触碰 runtime/core 模块和验证计划。
- [x] 1.2 增加 `agent-text-chat-flow` 规格 delta，要求默认 prompt 包含 AI 健身助手业务边界和非医疗边界。
- [x] 1.3 运行 `openspec validate harden-agent-fitness-business-boundary-prompt --strict`。

## 2. Prompt 实现

- [x] 2.1 更新 `agent-llm-prompt-config.ts`，把 AI 健身助手业务定位加入默认 system prompt。
- [x] 2.2 更新 `agent-llm-prompt-config.ts`，把不提供医疗诊断、治疗建议、伤病判断或康复处方加入默认 system prompt。
- [x] 2.3 递增 `agentLlmPromptVersion`，便于 trace 区分新旧 prompt。
- [x] 2.4 确认 prompt 不包含具体业务 toolName、动作库查询流程、训练计划保存流程或服务端关键词分流规则。

## 3. 测试与验证

- [x] 3.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖健身助手业务定位和非医疗边界。
- [x] 3.2 运行相关 prompt 配置测试。
- [x] 3.3 运行 `npm run typecheck`。

## 4. 文档记录

- [x] 4.1 在 `docs/方案变更历史` 新增本次 prompt 边界调整记录。
- [x] 4.2 在 `docs/项目演变历程.md` 追加本次核心 prompt 合同调整摘要。
