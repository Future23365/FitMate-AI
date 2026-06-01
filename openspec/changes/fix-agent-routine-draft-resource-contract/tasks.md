## 1. Runtime 资源合同

- [x] 1.1 扩展 `AgentToolResultRecord` 或等价运行时结构，保存服务端可解析的完整 tool output，且不改变模型可见的压缩 summary。
- [x] 1.2 增加本轮 tool result 资源解析能力，支持按 `draftId`、`validationId`、`policyDecisionId` 找回对应输出并校验工具类型。

## 2. Routine 工具链修复

- [x] 2.1 调整 `validateRoutineDraft` 输入合同，允许仅通过 `draftId` 引用上游 routine draft，并在服务端解析完整 draft 后校验。
- [x] 2.2 调整 Policy / artifact revision 写入链路，确保保存 routine 卡片时使用已登记 draft、validation 和 policy 结果。
- [x] 2.3 对缺失资源、工具类型不匹配、候选集合不一致等情况返回结构化失败并记录 trace。
- [x] 2.4 移除 `validateRoutineDraft` / `validatePlanDraft` 的模型可见 `draft` 输入字段，避免模型误传 partial draft 时先于服务端资源解析触发 Schema 失败。

## 3. 验证

- [x] 3.1 增加或更新 Agent runtime / workout tools 测试，覆盖模型不回传完整 `draft` 也能完成 validation、policy 和 artifact revision。
- [x] 3.2 运行相关自动化检查，至少覆盖本次改动涉及的测试和 `npm run typecheck`。
- [x] 3.3 增加回归测试覆盖模型误传 partial `draft` 时仍按 `draftId` 解析服务端资源，并重新运行相关检查。
