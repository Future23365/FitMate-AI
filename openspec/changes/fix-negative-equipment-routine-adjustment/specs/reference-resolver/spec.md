## ADDED Requirements

### Requirement: 调整类短指令必须优先解析当前会话唯一 recent artifact

系统 SHALL 在用户对已有训练内容发出调整类短指令时，优先使用当前会话 recent artifacts 定位目标，避免无谓扩大到当前用户历史 artifact 搜索。

#### Scenario: 当前会话只有一个可调整 routine
- **WHEN** resolved intent 表达 `workout_patch`、`exercise_replacement`、routine 重新生成或等价调整动作
- **AND** 当前会话 recent artifacts 中只有一个 active `routine` 符合该动作允许的 artifact kind
- **AND** 用户消息没有明确指向其他历史 artifact
- **THEN** ReferenceResolver MUST 返回 `status = "resolved"`
- **AND** `artifactId` MUST 指向该当前会话 recent routine
- **AND** `confidence` MUST 为 `high`
- **AND** 系统 MUST NOT 先使用 `current_user` 范围语义检索覆盖该结果

#### Scenario: 当前会话存在多个可调整 artifact
- **WHEN** resolved intent 表达调整动作
- **AND** 当前会话 recent artifacts 中存在多个同等可调整候选
- **THEN** ReferenceResolver MUST 返回 `ambiguous`
- **AND** 候选 MUST 优先来自当前会话 recent artifacts
- **AND** 系统 MUST NOT 用跨会话候选排在当前会话候选之前

#### Scenario: 用户明确引用历史对象
- **WHEN** 用户消息明确描述非当前 recent artifact 的历史目标
- **THEN** ReferenceResolver MAY 使用语义检索查找当前用户可访问历史候选
- **AND** 最终 resolved artifactId 仍 MUST 来自受控候选集合

### Requirement: 引用澄清必须可读且受当前约束过滤

系统 SHALL 在引用解析歧义时返回可读候选确认内容，并优先展示符合当前用户约束的候选。

#### Scenario: 返回多候选澄清
- **WHEN** ReferenceResolver 返回 `ambiguous`
- **THEN** `clarificationQuestion` MUST 使用短引导语加多行列表、编号列表或等价可读结构
- **AND** 每个候选 MUST 保持标题和必要摘要分离
- **AND** 用户回复中 MUST NOT 将多个长候选拼接成一整段难以阅读的文本

#### Scenario: 当前消息包含否定器械约束
- **WHEN** ReferenceResolver 需要返回候选澄清
- **AND** 当前消息表达不用某器械或等价否定约束
- **THEN** 候选排序 MUST 优先展示不违反该约束的 artifact
- **AND** 明显违反该约束的 artifact MUST 被降权、过滤或标记为不优先
- **AND** 如果没有符合约束的候选，系统 MUST 引导用户生成新的符合约束训练，而不是优先确认旧的违规候选

