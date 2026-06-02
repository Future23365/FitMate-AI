# reference-resolver Specification

## Purpose
记录聊天中 artifact 引用解析的受控边界。当前生产实现不再保留独立 `ReferenceResolver` service；引用定位、候选召回和 payload 读取 SHALL 通过 Tool-first Agent 的 `listRecentArtifacts`、`searchArtifacts` 与 `getArtifactPayload` 工具完成。

## Requirements
### Requirement: Artifact 引用定位必须使用 Agent 受控工具
系统 SHALL 使用 Tool-first Agent artifact tools 将用户引用表达收敛为候选摘要、可读取 payload 或澄清问题，而不是调用独立 legacy reference resolver。

#### Scenario: 近指引用优先使用最近 artifact
- **WHEN** 用户使用“这个”“刚才那个”“上一个”等近指表达
- **THEN** Agent SHOULD 先调用 `listRecentArtifacts`
- **AND** 候选 MUST 限制在当前 `userId` 可访问范围内
- **AND** 工具结果 MUST 只包含候选摘要，不包含完整 payload
- **AND** 系统 MUST NOT 使用 `conversationSummary` 反推完整训练内容

#### Scenario: 语义引用使用候选集合
- **WHEN** 用户使用“之前练胸那套”“上次长期计划”等语义引用
- **THEN** Agent MUST 调用 `searchArtifacts` 召回候选集合
- **AND** 候选过滤 SHOULD 使用 kind、标题、摘要、目标、肌群、器械和时间信号
- **AND** 后续可执行工具引用的 artifactId MUST 来自该候选集合或该候选的当前 active revision

#### Scenario: 候选不唯一时必须澄清
- **WHEN** `listRecentArtifacts` 或 `searchArtifacts` 返回多个相近候选且用户意图依赖唯一目标
- **THEN** Agent MUST 通过 `askClarification` 或等价回复生成候选确认问题
- **AND** 系统 MUST NOT 在用户确认前读取任一候选的完整 payload 来替用户决定目标
- **AND** 系统 MUST NOT 在用户确认前执行修改、替换或重复生成动作

#### Scenario: 引用目标不存在
- **WHEN** 当前用户可访问范围内没有匹配 artifact
- **THEN** tool result MUST 表达 `not_found` 或等价失败摘要
- **AND** 系统 MUST 引导用户重新说明或进入新生成流程
- **AND** 系统 MUST NOT 凭空构造历史卡片或 artifactId

### Requirement: Artifact payload 读取必须执行权限和结构校验
系统 SHALL 只通过 `getArtifactPayload` 读取完整 artifact payload，不得让 LLM 或客户端绕过权限过滤直接访问 artifact。

#### Scenario: 读取候选内 artifact
- **WHEN** 后续编排需要读取完整 artifact payload
- **THEN** 系统 MUST 调用 `getArtifactPayload`
- **AND** 工具 MUST 校验 artifact 归属于当前 `userId`
- **AND** 工具 MUST 拒绝读取其他用户 artifact
- **AND** 工具 MUST 返回服务端校验后的 payload 结构

#### Scenario: payload 校验失败
- **WHEN** artifact 存在但 payload 不符合对应 kind 和 schema version
- **THEN** `getArtifactPayload` MUST 返回失败结果
- **AND** 系统 MUST NOT 将未校验 payload 交给 AI 编排或客户端动作执行

#### Scenario: 旧 revision 被自动保存替换
- **WHEN** 工具读取的 artifact 属于当前用户且状态为 `superseded`
- **AND** 同一用户、同一会话、同一 kind 下存在可追溯到该 artifact 的 active revision
- **THEN** `getArtifactPayload` MUST 返回当前 active revision 的 payload
- **AND** 结果 MUST 保留原始 artifactId 与最终 active artifactId 的诊断信息

### Requirement: 只读 tool loop 必须遵守候选边界
系统 SHALL 保证 LLM 通过只读工具补查 artifact 时不能绕过本轮工具结果建立的候选边界。

#### Scenario: 已有候选集合
- **WHEN** Agent 已通过 `searchArtifacts` 或 `listRecentArtifacts` 得到候选集合
- **AND** 后续工具需要读取详情或提出编辑计划
- **THEN** 后续工具 MUST 只能引用该候选集合内 artifact 或其 active revision
- **AND** 系统 MUST NOT 接受模型凭空指定的候选外 artifactId 作为事实

#### Scenario: 缺少目标 artifact
- **WHEN** 用户请求修改、重复生成或解释历史 artifact
- **AND** Agent 未能建立唯一候选或读取 payload
- **THEN** 系统 MUST 返回澄清或可恢复失败
- **AND** 系统 MUST NOT 使用 `conversationSummary`、recent artifact 摘要或模型猜测构造完整 payload

### Requirement: Patch 和长期计划必须消费 Agent tool result
系统 SHALL 让 Patch、重复生成和长期计划工具消费 Agent artifact tool result，而不是消费旧 `referenceResolution` 合同。

#### Scenario: Patch 目标来自已读取 payload
- **WHEN** Agent 请求提出 WorkoutPatch
- **THEN** `proposeWorkoutEditPlan` MUST 引用 `getArtifactPayload` 返回的 `sourceArtifactPayloadId`
- **AND** `proposeWorkoutPatch` MUST 引用已登记 `WorkoutEditPlan` 和候选集合
- **AND** 系统 MUST NOT 读取旧 `referenceResolution` 字段或独立 reference resolver 输出

#### Scenario: 长期计划基于历史训练内容
- **WHEN** Agent 请求基于历史 routine 或 plan 生成长期计划
- **THEN** `generatePlanDraft` MUST 使用已读取并校验的 artifact payload 或本轮候选集合
- **AND** `DomainPlanEngine` MUST NOT 从 `conversationSummary` 或旧 `referenceResolution` 重建完整训练内容

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
