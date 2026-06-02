## 1. Agent JSON 恢复实现

- [x] 1.1 在 Agent JSON 解析层实现非语义 JSON object 提取与恢复，覆盖尾随 `}`、fenced JSON 和包裹文本。
- [x] 1.2 确保恢复后的对象继续通过 `AgentToolDecision` Schema、registry 和工具输入 Schema 校验。
- [x] 1.3 在 DeepSeek Agent decision trace 中记录严格解析失败、恢复方式、恢复后 parse status 和恢复后的 action/toolName。

## 2. 回归测试

- [x] 2.1 补充 `parseAgentJsonObject` 单测，覆盖尾随多余 `}` 可恢复和无法唯一恢复的坏 JSON 仍失败。
- [x] 2.2 补充 `parseJsonObject` / Agent decision trace 单测，覆盖 `validateRoutineDraft` 决策尾随 `}` 后仍能恢复出合法工具调用。
- [x] 2.3 补充恢复后 schema 不合法仍失败的单测，防止 JSON 恢复绕过 Agent 合同。

## 3. 文档收尾

- [x] 3.1 在 `docs/方案变更历史/` 新增本次 Agent JSON decision 恢复记录。
- [x] 3.2 在 `docs/项目演变历程.md` 末尾追加本次核心链路修复记录。

## 4. 验证

- [x] 4.1 运行 `openspec validate fix-agent-json-decision-recovery --strict`。
- [x] 4.2 运行相关 Vitest 用例。
- [x] 4.3 运行 `npm run typecheck`。
