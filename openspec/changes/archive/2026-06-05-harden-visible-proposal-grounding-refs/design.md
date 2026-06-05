## 背景

这次错误链路里有三个不同层级的 id：

1. 历史业务事实 id，例如 `factRef`。
2. 历史消息 id，例如 `messageId`。
3. 当前 run 内由 `ResourceStore` 登记的 `resourceId`。

前两者可以帮助 tool handler 在受控权限边界内读取上一轮用户可见事实；第三个才是 terminal action 的 resource grounding id。把三者同时暴露在 metadata、tool output、resource summary 和 prompt 中，却没有清晰区分用途，就会诱导模型把业务引用当成当前 run resource。

## 设计方向

### 1. metadata 只做状态摘要

`recentVisibleTrainingProposals` 保留“最近是否有用户可见训练方案、方案强度、section 摘要、可复用 training 数量”等轻量状态，但不再包含 `factRef` 或 `messageId`。这样模型可以知道存在相关上下文，却不能直接复制历史业务 id。

如需具体引用，模型必须通过本轮 `inspectVisibleTrainingProposals(operation = "list_recent")` 获取当前 run 可见索引。

### 2. read_recent 只消费本轮索引

`read_recent` 的 `ref.value` 只允许来自本轮 `list_recent` observation/tool result，或该调用登记的 `visible_training_proposal_fact_index` diagnostic resource。handler 不再检查 metadata，因此“上一轮对话里确实生成过卡片”和“当前 run 已经注册可消费 resource”会保持分离。

### 3. tool observation 区分源引用和 grounding 引用

`list_recent` 可以暴露 `factRef/messageId`，但必须说明它们只用于本轮 `read_recent.ref.value`。`read_recent` 成功后，模型可见 observation 不再把源业务引用作为主要字段重复暴露，而是强调：

- 最稳妥的 terminal grounding 是引用本次 satisfied `tool_result`。
- 若使用 resource grounding，必须使用 `fulfillment.producedResources[].resourceId`。
- 源业务引用和历史消息 id 不能写入 `final_answer.usedRefs.resource.id`。

### 4. 通用 repair feedback 不写业务分支

`resource_missing` 属于 agent-core 的通用资源合同错误，不应写 `inspectVisibleTrainingProposals`、`factRef` 或任何业务 toolName 分支。validator 只表达：

- 错误路径：`usedRefs.resource.id`
- 实际引用：模型提交的 resource ref 安全摘要
- 期望来源：当前 run registered `resourceId`、satisfied `tool_result` 或合法 `visibleOutputs`
- 通用修复方向：不要把业务对象 id、历史消息 id、示例 id 或正文 id 当成 `resourceId`

### 5. examples 只展示安全分支

引用型 tool 的 example 不能放假 `factRef`。本 change 保留 `list_recent` 示例，让模型先学会获取本轮索引；`read_recent` 的输入关系通过 schema description、manifest 和 observation 表达。

## 非目标

- 不根据用户原文或固定短语强制调用 `inspectVisibleTrainingProposals`。
- 不在服务端自动把 metadata 中的历史业务 id 转成当前 run resource。
- 不绕过 `ResourceStore`、Resource Contract Validator 或 terminal grounding validator。
- 不把某次 trace 的具体 `factRef` 写成生产规则。

## 验证策略

- 单元测试验证 metadata summary 不包含 `factRef/messageId`。
- Tool runtime 测试验证 metadata-only `read_recent` 会失败，`list_recent` 后的 diagnostic resource 可以支撑 `read_recent`。
- Manifest / prompt 测试验证 examples 无假引用，模型可见说明区分 `factRef/messageId` 和 `resourceId`。
- Validator 测试验证 `resource_missing` 返回通用 `domain_validation_failed` facts。
- Chat service replay 测试验证真实刷新链路走 `list_recent -> read_recent -> 后续 tool/final_answer`。
