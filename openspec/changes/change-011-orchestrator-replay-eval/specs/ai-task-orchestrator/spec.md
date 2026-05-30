## ADDED Requirements

### Requirement: AI 任务必须通过服务端 Orchestrator 编排
系统 SHALL 使用服务端 `AiTaskOrchestrator` 或等价编排层执行跨 artifact、工具、Patch、计划、确认和持久化的多步骤 AI 任务。

#### Scenario: 多步骤计划修改
- **WHEN** 用户要求“把之前那个练胸计划改成一周四练，保留动作但强度别太高”
- **THEN** Orchestrator MUST 按顺序执行 intent、reference_resolution、payload_read、plan_strategy、policy_check、validation、persistence 或 confirmation 分支
- **AND** 每个 step MUST 记录结构化输入、输出、状态和 trace 摘要
- **AND** 系统 MUST NOT 让 LLM 自由跳过 Policy、Validator 或 Confirmation

### Requirement: 工具调用必须受 schema 和 guardrails 约束
系统 SHALL 通过受控工具执行 artifact、exercise、memory、schedule 和 persistence 读写，且每个工具调用必须有 schema、权限过滤和数量限制。

#### Scenario: 工具读取训练对象
- **WHEN** Orchestrator 需要读取 artifact、routine 或 schedule
- **THEN** 系统 MUST 调用受控工具
- **AND** 工具 MUST 校验 `userId`、目标状态、访问范围和 payload schema
- **AND** 工具输出 MUST 只包含后续 step 必需的字段或摘要

### Requirement: 确认类任务必须支持 checkpoint 续跑
系统 SHALL 在需要用户确认时保存或签名 checkpoint，并在用户确认后从 checkpoint 继续执行。

#### Scenario: 用户确认 future schedule 批量修改
- **WHEN** ConfirmationGate 要求用户确认未来安排修改
- **THEN** Orchestrator MUST 生成绑定目标、scope、diff、policy result、validator 摘要和过期时间的 checkpoint
- **AND** 用户确认后系统 MUST 重新校验 checkpoint、Policy 和 Validator
- **AND** 系统 MUST NOT 在确认后重新生成不同 diff 再执行

### Requirement: Orchestrator 失败必须可恢复或可解释
系统 SHALL 将多步任务失败分类为可恢复失败、需要确认、需要澄清、候选不足、权限阻断或硬失败。

#### Scenario: 中间 step 失败
- **WHEN** ReferenceResolver、工具调用、Validator、Repair 或 Persistence 任一 step 失败
- **THEN** Orchestrator MUST 记录失败类型、错误 code 和可恢复建议
- **AND** Response Writer MUST 基于该失败类型返回对应引导
- **AND** trace 写入失败 MUST NOT 导致用户可见回复丢失
