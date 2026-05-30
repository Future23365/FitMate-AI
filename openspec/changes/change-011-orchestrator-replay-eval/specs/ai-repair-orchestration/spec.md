## ADDED Requirements

### Requirement: 可恢复校验失败必须进入统一 Repair Orchestrator
系统 SHALL 将训练草稿、Patch、长期计划和 schedule 写入中的可恢复校验失败交给统一 Repair Orchestrator 处理。

#### Scenario: 训练草稿时长超限
- **WHEN** Validator 返回 `session_too_long` 或等价可恢复错误
- **THEN** Repair Orchestrator MUST 优先尝试确定性压缩组数、次数、休息或动作数量
- **AND** 修复后 MUST 重新运行 Validator
- **AND** 修复失败时 Response Writer MUST 返回可继续对话的引导

### Requirement: Repair 必须优先使用确定性规则
系统 SHALL 优先使用服务端规则修复训练内容，只有语义选择必要时才调用受控 LLM。

#### Scenario: 替代动作不合法
- **WHEN** PatchValidator 拒绝 replacementExerciseId
- **THEN** Repair Orchestrator MUST 先从合法候选池选择同 section、同器械和低风险替代动作
- **AND** 如果需要 LLM 判断，LLM MUST 只能在候选集合内选择
- **AND** 系统 MUST 拒绝候选外动作

### Requirement: Repair 不得静默扩大修改范围
系统 SHALL 保证修复不会改变用户未确认的目标、scope 或高影响训练边界。

#### Scenario: 修复需要大幅改变计划
- **WHEN** 修复会改变 weeklyFrequency、删除多个动作、重排多个日期或大幅调整强度
- **THEN** Repair Orchestrator MUST 转入 ConfirmationGate
- **AND** 用户确认前系统 MUST NOT 持久化该修复

### Requirement: Repair 过程必须可追踪
系统 SHALL 在 AiRunTrace 中记录 repair step、修复策略、变更 diff 和修复后校验结果。

#### Scenario: 修复成功
- **WHEN** Repair Orchestrator 成功修复训练草稿、Patch 或 schedule preview
- **THEN** trace MUST 记录原始错误 code、repair strategy、diff 摘要和新 validation result
- **AND** 用户可见回复 MUST 能说明系统做了哪些关键调整
