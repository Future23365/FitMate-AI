## 1. Artifact Revision 读取

- [x] 1.1 调整 Agent `getArtifactPayload` 工具，使用 active revision 恢复入口读取当前用户 artifact payload。
- [x] 1.2 在 `getArtifactPayload` 工具输出与模型摘要中增加 requested/active artifact id 和 revision resolution 状态。
- [x] 1.3 补充 artifact payload 工具单测，覆盖 active 直读、superseded 恢复和跨用户/跨 lineage 失败。

## 2. Artifact-bound Routine 生成

- [x] 2.1 调整 `generateRoutineDraft` 来源 artifact 校验，使用 active revision 恢复入口读取推荐 payload。
- [x] 2.2 保持 `requiredExerciseIds` 必须来自 active recommendation payload 的校验，并记录恢复后的来源摘要。
- [x] 2.3 补充 routine 工具单测，覆盖旧 recommendation revision 恢复后继续生成 routine，以及 required 动作不属于 active payload 时失败。

## 3. Agent Tool Loop 稳定性

- [x] 3.1 在 Agent runtime 中增加本轮工具失败索引，按工具名、归一化输入和失败码识别不可重试重复失败。
- [x] 3.2 对重复不可重试工具失败返回结构化熔断结果，引用首次失败 tool result id，避免再次执行底层工具。
- [x] 3.3 压缩模型可见 tool result 上下文中的重复失败摘要，保留失败码、原因、首次/最新 tool result id 和重复次数。
- [x] 3.4 补充 runtime 单测，覆盖重复失败熔断、不同输入不熔断和重复失败上下文压缩。

## 4. Trace 与诊断

- [x] 4.1 在 Agent tool trace 中记录 artifact revision 恢复字段。
- [x] 4.2 在 Agent tool trace 中记录重复失败熔断字段，并区分底层工具失败和 runtime 熔断。
- [x] 4.3 补充 trace/view-model 或诊断测试，确保 requested/active id、duplicate failure 证据可被读取。

## 5. 验证与文档

- [x] 5.1 运行相关自动化测试，至少覆盖 Agent 工具、runtime 和 trace 变更。
- [x] 5.2 运行 `npm run typecheck`，确认 TypeScript 类型边界通过。
- [x] 5.3 在 `docs/方案变更历史` 新增本次方案变更记录，并按需更新 `docs/项目演变历程.md`。
- [x] 5.4 更新本 change 的任务勾选状态，确认 OpenSpec 状态可进入归档前检查。
