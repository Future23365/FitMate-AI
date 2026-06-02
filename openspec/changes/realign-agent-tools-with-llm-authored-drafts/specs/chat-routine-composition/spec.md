## ADDED Requirements

### Requirement: Routine draft 必须由 LLM 输出完整 sections

聊天 routine 生成 SHALL 要求 LLM 输出完整的 routine draft sections。`generateRoutineDraft` MUST 接收并登记该 structured draft，而不得根据候选动作自行决定热身、主训练、拉伸分段。

#### Scenario: LLM 提交完整 routine draft
- **WHEN** Agent 调用 `generateRoutineDraft`
- **THEN** 输入 MUST 包含 `WorkoutRoutineDraft` 或等价 structured sections
- **AND** 输入 MUST 包含 `exerciseSourceIds`
- **AND** draft MUST 包含 `warmup`、`training`、`stretch` section，除非用户明确要求跳过某个 section
- **AND** draft 中每个 item MUST 包含可校验的 `exerciseId` 和执行参数

#### Scenario: 服务端校验 routine draft
- **WHEN** `generateRoutineDraft` 收到 LLM-authored routine draft
- **THEN** 服务端 MUST 校验所有 `exerciseId` 来自 `exerciseSourceIds`、source artifact 或其他本轮合法来源
- **AND** 服务端 MUST 校验 required exercise 覆盖
- **AND** 服务端 MUST 校验 routine schema、时长和确定性边界
- **AND** 服务端 MUST NOT 修改 LLM 输出的 section 归属

#### Scenario: 热身和拉伸动作搜索
- **WHEN** 用户请求生成包含热身或拉伸的 routine
- **THEN** LLM SHOULD 分别调用 `searchExercises` 搜索热身、主训练和拉伸动作
- **AND** 热身搜索 SHOULD 使用 `filters.allowedSections=["warmup"]`
- **AND** 拉伸搜索 SHOULD 使用 `filters.allowedSections=["stretch"]`
- **AND** 如果用户没有明确要求器械热身或器械拉伸，热身和拉伸搜索 MUST 使用或被 Tool 确定性补入 no-equipment 过滤
- **AND** `searchExercises` MUST 只返回 `exerciseSearchResultId` 和动作列表，不返回 routine 覆盖状态

### Requirement: Routine 自动补齐只能作为 LLM repair 输入

当 routine draft 缺少热身、主训练或拉伸时，系统 SHALL 让 LLM repair draft 或重新搜索动作。服务端 MUST NOT 自动补动作后把结果当成已生成 routine。

#### Scenario: LLM draft 缺少 warmup
- **WHEN** LLM-authored routine draft 缺少 `warmup` section 或 warmup item
- **THEN** validation 或 generate 工具 MUST 返回结构化失败
- **AND** recovery MUST 要求 LLM 基于搜索结果补写 draft 或重新搜索动作
- **AND** 服务端 MUST NOT 自动插入 warmup 动作形成成功 draft

#### Scenario: LLM draft 使用来源外动作
- **WHEN** LLM-authored routine draft 引用动作来源外的 `exerciseId`
- **THEN** generate 工具 MUST 返回 `exercise_source_mismatch` 或等价失败
- **AND** 服务端 MUST NOT 用合法来源内的其他动作静默替换该动作
