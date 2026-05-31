## 1. Artifact 读取稳定性

- [x] 1.1 在 artifact service 中实现按当前用户解析 active revision 的受控 payload 读取能力。
- [x] 1.2 保持 active artifact 直读、superseded lineage 解析、不可访问/归档失败三类边界清晰。

## 2. 长期计划编排接入

- [x] 2.1 让 `/api/ai/workout-plan` 的 DomainPlanEngine 分支使用当前 active artifact payload。
- [x] 2.2 在 trace 中记录原始引用 id、最终 active id、是否发生 revision 解析和失败原因。

## 3. 测试与验证

- [x] 3.1 补充 artifact service 单测，覆盖旧 revision 解析到 active revision、active 直读和无法解析失败。
- [x] 3.2 补充 AI workout plan 单测，覆盖旧 revision 仍能展开长期计划且不调用模型自由生成。
- [x] 3.3 运行相关测试，并按需运行 `npm run typecheck`。
