## Why

用户要求“把俯卧撑换掉”“平板支撑太难，换简单点”时，系统应只修改被点名对象并保留其余训练内容。当前缺少 WorkoutPatch / PlanPatch 语义，容易重新生成整份计划或误改未被点名的动作、训练日和参数。

## What Changes

- 新增 `WorkoutPatch` / `PlanPatch` 结构，明确修改目标、范围、操作类型、保留字段和原因。
- 新增 `PatchEngine`，第一版只对聊天 artifact 草稿应用局部修改并创建新 revision。
- 新增 Patch 专用校验，确保目标动作存在、未点名内容保持不变、替代动作满足 section / 器械 / 难度 / 风险约束。
- artifact 修改默认创建新 revision；已保存 routine、未来 schedule 和已完成训练历史默认不可被本 change 直接修改。
- 第一版只覆盖单动作替换、难度降低、动作移除后的必要替换和未保存草稿修改，不实现复杂日历批量重排。

## Capabilities

### New Capabilities
- `workout-patch`: 定义训练卡片、routine 和未来 schedule 的局部 Patch 结构、应用规则、校验和版本要求。

### Modified Capabilities

## Impact

- 依赖 `conversation-artifact` 和 `reference-resolver` 提供可定位目标。
- 影响 AI 编排层、动作候选检索、训练草稿校验、artifact revision 和保存流程。
- 需要新增 Patch schema、PatchEngine、PatchValidator 和相关测试。
- 后续 `change-009-policy-confirmation` 会扩展批量修改、覆盖已保存 routine 和长期记忆写入确认；本 change 只保留基础安全边界。
