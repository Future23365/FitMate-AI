## ADDED Requirements

### Requirement: Runtime 必须对重复同参 tool call 提供通用 duplicate input 反馈
系统 SHALL 在生产 LangChain Agent Runtime 或 tool execution 边界中识别同一 run 内重复的同参业务 tool call。重复判定 MUST 基于稳定结构，例如 `toolName + toolVersion + normalizedInputHash`；命中后系统 MUST NOT 重复执行 handler、重复注册等价资源或依赖总预算耗尽来终止循环。反馈 MUST 使用 `duplicate_tool_input`、`duplicate_input` 或等价中性命名，只表达事实已存在和重复调用不会产生新事实，不得替模型选择业务下一步，也不得使用 `success` / `satisfied` 表达业务目标已经满足。

#### Scenario: 重复同参调用不重复执行 handler
- **WHEN** 同一 LangChain Agent run 中某个业务 tool 已使用相同 `toolName`、相同 `toolVersion` 和等价归一化 input 执行并产生 tool result
- **AND** 模型再次请求同一 tool 和同一归一化 input
- **THEN** Runtime MUST NOT 再次执行该 tool handler
- **AND** Runtime MUST NOT 重复注册等价业务 resource、validated visible output 或事实桥记录
- **AND** Runtime MUST 记录该次请求命中 duplicate input 或等价稳定诊断
- **AND** Runtime MUST NOT 将该诊断命名为 `duplicate_tool_success`、`duplicate-success` 或其他暗示业务目标已成功的名称

#### Scenario: duplicate input 反馈不承载业务下一步
- **WHEN** Runtime 向模型返回重复同参成功调用的可恢复反馈
- **THEN** 反馈 MUST 表达该同参调用已经产生过 tool result 或事实摘要
- **AND** 反馈 MAY 提供有限事实摘要或指示模型可继续基于当前可见事实推理
- **AND** 反馈 MUST NOT 使用 `success`、`satisfied`、`unsatisfied` 或等价词表达用户业务目标已经满足或未满足
- **AND** 反馈 MUST NOT 包含固定用户短语、关键词、正则、同义词表或具体 phrasing
- **AND** 反馈 MUST NOT 根据具体业务 `toolName`、字段组合或业务 section 指导模型调用某个下一步 tool
- **AND** 反馈 MUST NOT 暴露内部 `resourceId`、`toolResultId`、`factRef`、`messageId` 或 trace id 作为模型需要复制的合同

#### Scenario: duplicate input 不依赖预算耗尽收场
- **WHEN** 模型连续重复请求已经成功的同参业务 tool call
- **THEN** Runtime MUST 在重复调用处提供稳定反馈
- **AND** handler 执行次数 MUST 保持为一次
- **AND** Runtime MUST NOT 让同一重复同参请求持续消耗到 `maxModelCalls`、整轮业务 tool 总预算或 terminal failure finalizer 才结束
- **AND** per-tool limit 和整轮总预算 MAY 继续作为安全熔断保留

#### Scenario: duplicate input 机制不写业务 toolName 语义分支
- **WHEN** Runtime 构造 duplicate input key 或处理重复命中
- **THEN** Runtime MUST 使用通用 tool wrapper metadata、tool version 和归一化 input
- **AND** Runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`submitVisibleTrainingProposal` 或未来业务 tool 编写语义特判
- **AND** Runtime MUST NOT 根据用户自然语言、关键词、短句模板或业务字段组合决定是否复用事实

### Requirement: Runtime 不得把成功空结果归类为 repair failure
系统 SHALL 区分 tool 执行失败与成功事实为空。只要 LangChain tool wrapper 返回 `ok = true` 或等价成功执行状态，且 handler output / output schema / 权限 / 执行合同均通过，0 条结果、空候选、空 `facts[]` 或候选不足 diagnostics MUST 作为 current-run 事实材料进入模型可见边界；Runtime MUST NOT 因业务目标未满足、候选数量不足或 section 覆盖不足而把该结果归类为 repair failure、terminal failure 或业务失败。

#### Scenario: 0 条动作查询是成功事实
- **WHEN** `searchExerciseResources` 或等价查询 tool 成功执行
- **AND** output 表达 `totalMatches = 0`、空候选或候选不足 diagnostics
- **THEN** Runtime MUST 将该结果作为 current-run 事实材料提供给模型
- **AND** 模型 MAY 基于该事实输出普通文本解释、澄清、放宽条件建议或继续调用其他合法工具
- **AND** Runtime MUST NOT 因中间结果为空而强制进入 repair failure 或 terminal failure finalizer

#### Scenario: 空历史事实是成功状态查询
- **WHEN** `inspectVisibleTrainingProposals` 或等价历史事实读取 tool 成功执行
- **AND** output 表达当前 actor / conversation 下空 `facts[]`
- **THEN** Runtime MUST 将该空事实集合作为 current-run 事实材料提供给模型
- **AND** Runtime MUST NOT 把空 `facts[]` 伪装成已导入历史方案事实
- **AND** Runtime MUST NOT 因空结果强制改写用户意图、生成新方案或进入固定 answer 模板

#### Scenario: 结构化输出失败只归因于 finalization 或 validator
- **WHEN** 模型基于空结果或候选不足事实提交结构化训练输出
- **AND** finalization tool、terminal validator 或业务 validator 判定该结构不满足数据库事实、section、prescription、schedule 或可渲染边界
- **THEN** Runtime MUST 将失败归因于 finalization / validator
- **AND** Runtime MUST NOT 把中间 tool result 的空结果或候选不足 diagnostics 当作结构化输出失败的替代判定
