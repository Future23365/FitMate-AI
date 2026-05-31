## Why

引用解析和 Patch 能定位并修改对象，但系统还需要判断“是否允许这样改”以及“是否需要用户确认”。批量修改未来 schedule、覆盖已保存 routine、改变周频率、写入长期健康限制或大幅调整强度都可能产生高影响，不能由 AI 一步写入。

## What Changes

- 新增 `PolicyEngine`，判断 artifact、routine、schedule、用户记忆和 Patch 操作是否允许。
- 新增 `ConfirmationGate`，对批量未来安排、覆盖已保存 routine、改变频率、重排日历、长期记忆写入和大幅强度变化要求用户确认。
- 明确默认安全范围：未保存聊天草稿和单动作替换可直接生成 revision；已完成训练历史默认不可修改。
- `PolicyCheckResult` 输出 allowed、requiresConfirmation、reasons 和 safeScope。
- 写操作必须先经过 Policy、Confirmation、Validator 和权限校验，再持久化。

## Capabilities

### New Capabilities
- `policy-confirmation`: 定义写操作 Policy、确认门、默认安全范围、已完成历史保护和确认 token 要求。

### Modified Capabilities
- `workout-patch`: 扩展 saved routine、future schedule 和批量修改的策略边界。
- `user-feedback-memory`: 长期偏好和健康/不适信号写入需要 confirmation 控制。
- `domain-plan-engine`: schedule preview 写入未来日历前必须经过确认。

## Impact

- 影响 PatchEngine、Schedule Service、Artifact Service、User Memory Service、PlanEngine、聊天编排和持久化入口。
- 需要补充 PolicyCheckResult schema、ConfirmationToken、确认状态管理和写操作测试。
