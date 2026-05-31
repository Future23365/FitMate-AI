## ADDED Requirements

### Requirement: 聊天主链路必须产出唯一 resolved intent
系统 SHALL 在每轮 `/api/chat` 请求中产出一个唯一的 resolved intent，作为用户回复、内部动作事件、卡片生成、trace 和持久化的共同执行契约。

#### Scenario: 用户请求可执行训练结果
- **WHEN** 用户提出动作推荐、单次 routine、长期 plan 或已有 artifact 调整请求
- **THEN** 系统 MUST 产出一个 resolved intent
- **AND** resolved intent MUST 同时表达 `type`、`action.kind`、`action.shouldTrigger`、`responseMode`、训练意图字段、缺失字段和用户可见建议
- **AND** 后续回复生成和卡片生成 MUST 使用该 resolved intent

#### Scenario: 系统存在旧版 intent 字段
- **WHEN** 系统仍需要兼容旧的 `type`、`workoutIntent`、`canTriggerAction` 或 `suggestedReplies`
- **THEN** 这些字段 MUST 从 resolved intent 派生
- **AND** 系统 MUST NOT 让旧字段成为另一个可独立触发卡片的事实来源

### Requirement: resolved intent 必须区分澄清回复和生成后调整建议
系统 SHALL 将缺信息澄清和生成后可选调整建议拆成不同语义，避免建议阻断用户明确可执行需求。

#### Scenario: 用户请求可执行计划且条件足够
- **WHEN** 用户明确请求可执行训练结果
- **AND** resolved intent 具备生成所需核心字段
- **THEN** `action.shouldTrigger` MUST 为 `true`
- **AND** `responseMode` MUST 为 `generate_directly` 或 `generate_with_suggestions`
- **AND** 系统 MUST 使用 `adjustmentReplies` 或等价字段表达生成后的可选调整建议
- **AND** 系统 MUST NOT 使用澄清回复阻断本次生成

#### Scenario: 用户请求缺少必要信息
- **WHEN** 用户请求训练结果但缺少目标、引用对象、器械/场地、时长、频率或其他当前动作必需字段
- **THEN** `action.shouldTrigger` MUST 为 `false`
- **AND** `responseMode` MUST 为 `ask_clarification`
- **AND** 系统 MUST 使用 `clarificationReplies` 或等价字段给出用户可直接发送的补充选项
- **AND** 系统 MUST NOT 同时触发训练卡片生成

### Requirement: 服务端必须校验 resolved intent 内部一致性
系统 SHALL 在触发任何内部动作前校验 resolved intent 的结构化字段是否自洽。

#### Scenario: 回复模式和触发状态冲突
- **WHEN** resolved intent 的 `responseMode` 为 `ask_clarification`
- **AND** `action.shouldTrigger` 为 `true`
- **THEN** 系统 MUST 判定该 resolved intent 存在冲突
- **AND** 系统 MUST NOT 直接触发任何卡片生成

#### Scenario: 缺失字段和触发状态冲突
- **WHEN** resolved intent 的 `missingActionFields` 非空
- **AND** `action.shouldTrigger` 为 `true`
- **THEN** 系统 MUST 判定该 resolved intent 存在冲突
- **AND** 系统 MUST NOT 直接触发任何卡片生成

#### Scenario: 意图类型和动作类型冲突
- **WHEN** resolved intent 的 `type`、`workoutIntent.intentType` 和 `action.kind` 表达不同训练结果类型
- **THEN** 系统 MUST 判定该 resolved intent 存在冲突
- **AND** 系统 MUST NOT 在冲突修复前调用下游 artifact generator

#### Scenario: 引用对象不可用但动作依赖引用
- **WHEN** resolved intent 的 action 需要基于历史 artifact 生成、修改或讲解
- **AND** ReferenceResolver 返回 `not_found` 或 `ambiguous`
- **THEN** 系统 MUST 将该结果视为不可执行
- **AND** 系统 MUST 进入澄清回复或引用选择流程

### Requirement: 冲突 resolved intent 必须经过一次 repair 或降级为澄清
系统 SHALL 在 resolved intent 出现结构冲突时调用一次 LLM repair，并在 repair 失败后停止卡片生成。

#### Scenario: repair 后 resolved intent 通过门控
- **WHEN** 初始 resolved intent 未通过一致性门控
- **AND** LLM repair 返回的 resolved intent 通过一致性门控
- **THEN** 系统 MUST 使用 repair 后的 resolved intent 继续执行
- **AND** trace MUST 记录原始冲突、repair 请求和 repair 结果

#### Scenario: repair 后仍冲突
- **WHEN** 初始 resolved intent 未通过一致性门控
- **AND** LLM repair 返回的 resolved intent 仍未通过一致性门控
- **THEN** 系统 MUST 将本轮降级为 `action.shouldTrigger = false`
- **AND** `responseMode` MUST 为 `ask_clarification`
- **AND** 系统 MUST NOT 触发任何卡片生成

### Requirement: 用户回复必须基于 resolved intent 和 artifact 结果生成
系统 SHALL 使用最终 resolved intent 和 artifact 生成结果产出用户可见回复，避免回复内容与内部动作不一致。

#### Scenario: artifact 生成成功
- **WHEN** resolved intent 要求触发卡片生成
- **AND** artifact generator 返回通过校验的推荐、routine、plan 或 patch 结果
- **THEN** 用户回复 MUST 描述已经按 resolved intent 处理的结果
- **AND** 用户回复 MAY 提供 `adjustmentReplies` 对应的可选调整方向
- **AND** 用户回复 MUST NOT 再询问用户是否要生成同一个结果

#### Scenario: artifact 生成失败
- **WHEN** resolved intent 要求触发卡片生成
- **AND** artifact generator 返回失败或可恢复错误
- **THEN** 用户回复 MUST 基于失败结果给出恢复引导或澄清选项
- **AND** 用户回复 MUST NOT 承诺已经生成成功

#### Scenario: resolved intent 要求澄清
- **WHEN** resolved intent 的 `responseMode` 为 `ask_clarification`
- **THEN** 用户回复 MUST 只追问缺失信息或引用对象
- **AND** 系统 MUST NOT 在同一轮返回训练卡片

### Requirement: 前端不得从自然语言回复正文二次提取卡片触发
聊天前端 SHALL 只根据服务端返回的 resolved action 或等价结构化事件触发卡片生成。

#### Scenario: 回复正文包含类似生成承诺的文字
- **WHEN** 服务端自然语言回复中出现“安排”、“整理”、“生成”或等价表达
- **AND** 服务端 resolved action 未要求触发卡片
- **THEN** 前端 MUST NOT 仅凭回复正文调用训练卡片生成接口

#### Scenario: 服务端返回 resolved action
- **WHEN** 服务端返回 `action.shouldTrigger = true`
- **THEN** 前端 MUST 使用该 action、resolved intent 和 referenceResolution 调用对应生成流程
- **AND** 前端 MUST NOT 重新解析回复正文来决定 action 类型
