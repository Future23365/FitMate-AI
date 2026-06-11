## ADDED Requirements

### Requirement: Runtime 必须对重复成功的同参 tool call 提供通用可恢复反馈
系统 SHALL 在生产 LangChain Agent Runtime 或 tool execution 边界中识别同一 run 内重复成功的同参业务 tool call。重复判定 MUST 基于稳定结构，例如 `toolName + toolVersion + normalizedInputHash`；命中后系统 MUST NOT 重复执行 handler、重复注册等价资源或依赖总预算耗尽来终止循环。反馈 MUST 只表达事实已存在和重复调用不会产生新事实，不得替模型选择业务下一步。

#### Scenario: 重复同参成功调用不重复执行 handler
- **WHEN** 同一 LangChain Agent run 中某个业务 tool 已使用相同 `toolName`、相同 `toolVersion` 和等价归一化 input 成功执行
- **AND** 模型再次请求同一 tool 和同一归一化 input
- **THEN** Runtime MUST NOT 再次执行该 tool handler
- **AND** Runtime MUST NOT 重复注册等价业务 resource、validated visible output 或事实桥记录
- **AND** Runtime MUST 记录该次请求命中 duplicate-success 或等价稳定诊断

#### Scenario: duplicate-success 反馈不承载业务下一步
- **WHEN** Runtime 向模型返回重复同参成功调用的可恢复反馈
- **THEN** 反馈 MUST 表达该同参调用已经产生过成功事实
- **AND** 反馈 MAY 提供有限事实摘要或指示模型可继续基于当前可见事实推理
- **AND** 反馈 MUST NOT 包含固定用户短语、关键词、正则、同义词表或具体 phrasing
- **AND** 反馈 MUST NOT 根据具体业务 `toolName`、字段组合或业务 section 指导模型调用某个下一步 tool
- **AND** 反馈 MUST NOT 暴露内部 `resourceId`、`toolResultId`、`factRef`、`messageId` 或 trace id 作为模型需要复制的合同

#### Scenario: duplicate-success 不依赖预算耗尽收场
- **WHEN** 模型连续重复请求已经成功的同参业务 tool call
- **THEN** Runtime MUST 在重复调用处提供稳定反馈
- **AND** handler 执行次数 MUST 保持为一次
- **AND** Runtime MUST NOT 让同一重复同参请求持续消耗到 `maxModelCalls`、整轮业务 tool 总预算或 terminal failure finalizer 才结束
- **AND** per-tool limit 和整轮总预算 MAY 继续作为安全熔断保留

#### Scenario: duplicate-success 机制不写业务 toolName 语义分支
- **WHEN** Runtime 构造 duplicate-success key 或处理重复命中
- **THEN** Runtime MUST 使用通用 tool wrapper metadata、tool version 和归一化 input
- **AND** Runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`submitVisibleTrainingProposal` 或未来业务 tool 编写语义特判
- **AND** Runtime MUST NOT 根据用户自然语言、关键词、短句模板或业务字段组合决定是否复用事实
