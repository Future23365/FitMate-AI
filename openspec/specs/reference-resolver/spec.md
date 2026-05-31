# reference-resolver Specification

## Purpose
TBD - created by archiving change change-002-reference-resolver. Update Purpose after archive.
## Requirements
### Requirement: ReferenceResolver 必须输出受控解析结果
系统 SHALL 使用 `ReferenceResolver` 将用户引用表达解析为明确 artifact、歧义候选或未找到结果。

#### Scenario: 解析结果结构统一
- **WHEN** ReferenceResolver 完成一次解析
- **THEN** 结果 MUST 包含 `status`
- **AND** `status` MUST 是 `resolved`、`ambiguous` 或 `not_found`
- **AND** 结果 MUST 包含可解释的 `reason`
- **AND** 结果 MUST NOT 包含完整 artifact payload

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

### Requirement: searchArtifacts 必须只返回当前用户可访问候选
系统 SHALL 通过 `searchArtifacts` 召回 artifact 候选摘要，作为语义引用解析的候选集合。

#### Scenario: 按用户和会话范围检索候选
- **WHEN** ReferenceResolver 需要根据语义引用检索 artifact
- **THEN** `searchArtifacts` MUST 按当前 `userId` 过滤候选
- **AND** `searchArtifacts` MUST 支持按 `sessionScope` 限制当前会话或当前用户可访问范围
- **AND** `searchArtifacts` MUST 支持按 `kind`、`query` 和 `limit` 过滤候选
- **AND** 返回结果 MUST 只包含候选摘要，不包含完整 payload

#### Scenario: 检索结果排序
- **WHEN** `searchArtifacts` 返回多个候选
- **THEN** 当前会话 active artifact SHOULD 优先于跨会话候选
- **AND** 标题、摘要、目标、肌群或器械匹配的候选 SHOULD 优先于仅时间匹配候选
- **AND** 最近更新的候选 SHOULD 在同等匹配分数下优先返回

### Requirement: getArtifactPayload 必须执行权限校验
系统 SHALL 通过受控工具读取 artifact 完整 payload，不得让 LLM 或客户端绕过权限过滤直接访问 artifact。

#### Scenario: 读取已解析 artifact
- **WHEN** 后续编排需要读取 `ReferenceResolution` 指向的 artifact payload
- **THEN** 系统 MUST 调用 `getArtifactPayload`
- **AND** 工具 MUST 校验 artifact 归属于当前 `userId`
- **AND** 工具 MUST 拒绝读取其他用户 artifact
- **AND** 工具 MUST 返回服务端校验后的 payload 结构

#### Scenario: payload 校验失败
- **WHEN** artifact 存在但 payload 不符合对应 kind 和 schema version
- **THEN** `getArtifactPayload` MUST 返回失败结果
- **AND** 系统 MUST NOT 将未校验 payload 交给 AI 编排或客户端动作执行

### Requirement: 聊天流程必须消费引用解析分支
系统 SHALL 在 `/api/chat` 意图解析后消费 ReferenceResolver 结果，并据此决定继续执行、澄清或重新生成。

#### Scenario: resolved 结果继续后续流程
- **WHEN** ReferenceResolver 返回 `resolved`
- **THEN** `/api/chat` MUST 将已解析 artifactId 传递给解释、重复生成或后续 Patch 流程
- **AND** 后续流程需要完整内容时 MUST 通过 `getArtifactPayload` 读取

#### Scenario: ambiguous 结果停止修改动作
- **WHEN** ReferenceResolver 返回 `ambiguous`
- **THEN** `/api/chat` MUST 返回面向用户的候选确认问题
- **AND** 系统 MUST NOT 在用户确认前执行修改、替换或重复生成动作

#### Scenario: not_found 结果不伪造历史对象
- **WHEN** ReferenceResolver 返回 `not_found`
- **THEN** `/api/chat` MUST 引导用户重新说明或进入新生成流程
- **AND** 系统 MUST NOT 使用 `conversationSummary` 反向构造历史 artifact

### Requirement: resolved artifact 必须能解析到当前 active revision
系统 SHALL 在后续服务端流程消费 `ReferenceResolution` 时，将当前用户可访问的旧 revision artifactId 解析到同一 lineage 的当前 active artifact。

#### Scenario: 旧 revision 被自动保存替换
- **WHEN** `ReferenceResolution` 指向的 artifact 属于当前用户且状态为 `superseded`
- **AND** 同一用户、同一会话、同一 kind 下存在可追溯到该 artifact 的 active revision
- **THEN** 受控 artifact payload 读取 MUST 使用当前 active revision
- **AND** 结果 MUST 保留原始 artifactId 与最终 active artifactId 的诊断信息

#### Scenario: 旧 revision 无法追溯到 active artifact
- **WHEN** `ReferenceResolution` 指向的 artifact 不存在、属于其他用户、已归档，或无法追溯到同一 lineage 的 active revision
- **THEN** 受控 artifact payload 读取 MUST 返回失败结果
- **AND** 系统 MUST NOT 使用 conversationSummary、recent artifact 摘要或候选摘要重建完整 payload

#### Scenario: active artifact 直接读取
- **WHEN** `ReferenceResolution` 指向的 artifact 属于当前用户且状态为 `active`
- **THEN** 受控 artifact payload 读取 MUST 直接校验并返回该 artifact payload
- **AND** 系统 MUST NOT 额外切换到其他同类 artifact

### Requirement: 只读 tool loop 必须遵守 ReferenceResolver 候选边界
系统 SHALL 保证 LLM 通过只读工具补查 artifact 时不能绕过 ReferenceResolver 已建立的候选边界。

#### Scenario: 引用解析已 resolved
- **WHEN** ReferenceResolver 返回 `resolved`
- **AND** tool loop 需要读取该 artifact 的详情
- **THEN** tool loop MUST 只能通过 `getArtifactPayload` 读取当前用户可访问的已解析 artifact 或其 active revision
- **AND** tool loop MUST NOT 接受模型凭空指定的候选外 artifactId 作为事实

#### Scenario: 引用解析为 ambiguous
- **WHEN** ReferenceResolver 返回 `ambiguous`
- **AND** 用户尚未确认候选
- **THEN** tool loop MUST NOT 读取任一候选的完整 payload 来替用户决定目标
- **AND** 系统 MUST 继续返回候选澄清问题

#### Scenario: 引用解析为 not_found
- **WHEN** ReferenceResolver 返回 `not_found`
- **THEN** tool loop MUST NOT 使用 conversationSummary、recent artifact 摘要或模型猜测构造 artifactId
- **AND** 系统 MUST 进入澄清或新生成流程

### Requirement: LLM 触发 artifact 搜索必须使用受控检索工具
系统 SHALL 只允许 LLM 通过受控 `searchArtifacts` 工具检索 artifact 候选摘要。

#### Scenario: LLM 需要查找历史 artifact
- **WHEN** LLM 需要根据用户描述查找历史训练内容
- **THEN** 系统 MUST 执行受控 `searchArtifacts` 工具
- **AND** 工具 MUST 按当前 `userId`、`sessionScope`、`kind`、`query` 和 `limit` 过滤
- **AND** 返回给模型的内容 MUST 是候选摘要而不是完整 payload

#### Scenario: LLM 搜索结果不唯一
- **WHEN** `searchArtifacts` 返回多个相近候选且用户意图依赖唯一目标
- **THEN** 系统 MUST 生成候选澄清
- **AND** 系统 MUST NOT 让 LLM 在没有用户确认时执行修改、替换或重复生成动作

