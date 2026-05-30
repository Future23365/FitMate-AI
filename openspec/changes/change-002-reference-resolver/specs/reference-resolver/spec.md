## ADDED Requirements

### Requirement: ReferenceResolver 必须输出受控解析结果
系统 SHALL 使用 `ReferenceResolver` 将用户引用表达解析为明确 artifact、歧义候选或未找到结果。

#### Scenario: 高置信度解析成功
- **WHEN** 用户消息引用当前会话中唯一匹配的 artifact
- **THEN** ReferenceResolver MUST 返回 `status = "resolved"`
- **AND** 结果 MUST 包含 `artifactId`
- **AND** 结果 MUST 包含 `confidence = "high"` 或 `confidence = "medium"`
- **AND** 结果 MUST 包含可解释的 `reason`

#### Scenario: 引用存在多个相近候选
- **WHEN** 用户消息可能引用多个 artifact 且无法高置信度区分
- **THEN** ReferenceResolver MUST 返回 `status = "ambiguous"`
- **AND** 结果 MUST 包含候选 artifact 的标题、摘要、类型和创建时间
- **AND** 结果 MUST 包含面向用户的 `clarificationQuestion`
- **AND** 系统 MUST NOT 在用户确认前修改任一候选 artifact

#### Scenario: 引用目标不存在
- **WHEN** 当前用户可访问范围内没有匹配 artifact
- **THEN** ReferenceResolver MUST 返回 `status = "not_found"`
- **AND** 结果 MUST 包含未找到原因
- **AND** 系统 MUST NOT 凭空构造历史卡片或 artifactId

### Requirement: 近指引用必须优先使用当前会话 recent artifacts
系统 SHALL 对“这个”“刚才那个”“上一个”等近指引用优先使用当前会话 recent artifacts 的展示顺序和时间顺序定位。

#### Scenario: 用户引用刚推送的卡片
- **WHEN** 用户在聊天中输入“这个三周都练”
- **AND** 当前会话最近一张 active artifact 类型符合训练生成或重复语义
- **THEN** ReferenceResolver MUST 优先解析到该 artifact
- **AND** 解析过程 MUST NOT 依赖 `conversationSummary` 反推完整卡片内容

#### Scenario: 同一轮存在多个可引用卡片
- **WHEN** 最近上下文中存在多个 active artifact 且用户只说“这个”
- **THEN** ReferenceResolver MUST 返回 `ambiguous`
- **AND** 候选列表 MUST 按 UI 展示顺序或时间顺序排列

### Requirement: 语义引用必须在候选集合内选择
系统 SHALL 对“之前练胸那套”“上次长期计划”等语义引用先召回候选，再在候选集合内解析。

#### Scenario: 用户引用历史语义对象
- **WHEN** 用户输入“按之前那套练胸的改成一周四练”
- **THEN** ReferenceResolver MUST 使用 artifact index 过滤当前用户可访问的候选
- **AND** 候选过滤 SHOULD 使用 kind、标题、摘要、目标、肌群、器械和时间信号
- **AND** 最终 resolved 结果的 `artifactId` MUST 来自候选集合

#### Scenario: LLM 输出候选外 artifactId
- **WHEN** 受控 LLM 辅助解析返回不在候选集合内的 artifactId
- **THEN** 系统 MUST 拒绝该结果
- **AND** ReferenceResolver MUST 返回 `ambiguous` 或 `not_found`

### Requirement: getArtifactPayload 必须执行权限校验
系统 SHALL 通过受控工具读取 artifact 完整 payload，不得让 LLM 或客户端绕过权限过滤直接访问 artifact。

#### Scenario: 读取已解析 artifact
- **WHEN** 后续编排需要读取 `ReferenceResolution` 指向的 artifact payload
- **THEN** 系统 MUST 调用 `getArtifactPayload`
- **AND** 工具 MUST 校验 artifact 归属于当前 `userId`
- **AND** 工具 MUST 拒绝读取其他用户 artifact
- **AND** 工具 MUST 返回服务端校验后的 payload 结构
