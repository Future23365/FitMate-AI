## ADDED Requirements

### Requirement: Routine draft 必须由 LLM 输出完整 sections

聊天 routine 生成 SHALL 要求 LLM 输出完整的 routine draft sections。`generateRoutineDraft` MUST 接收并登记该 structured draft，而不得根据候选动作自行决定热身、主训练、拉伸分段。

#### Scenario: LLM 提交完整 routine draft
- **WHEN** Agent 调用 `generateRoutineDraft`
- **THEN** 输入 MUST 包含 `WorkoutRoutineDraft` 或等价 structured sections
- **AND** draft MUST 包含 `warmup`、`training`、`stretch` section
- **AND** draft 中每个 item MUST 包含可校验的 `exerciseId` 和执行参数

#### Scenario: 服务端校验 routine draft
- **WHEN** `generateRoutineDraft` 收到 LLM-authored routine draft
- **THEN** 服务端 MUST 校验所有 `exerciseId` 来自本轮 `candidateSetId`
- **AND** 服务端 MUST 校验 required exercise 覆盖
- **AND** 服务端 MUST 校验 routine schema、时长和确定性边界
- **AND** 服务端 MUST NOT 修改 LLM 输出的 section 归属

#### Scenario: 热身和拉伸候选
- **WHEN** `searchExercises` 为 routine 返回 warmup 或 stretch 适用性候选池
- **THEN** 这些候选池 MUST 作为 LLM 编排提示和服务端校验证据
- **AND** 系统 MUST NOT 将候选池直接当成最终 section 编排

### Requirement: Routine 自动补齐只能作为 LLM repair 输入

当 routine draft 缺少热身、主训练或拉伸时，系统 SHALL 让 LLM repair draft 或重新查询候选。服务端 MUST NOT 自动补动作后把结果当成已生成 routine。

#### Scenario: LLM draft 缺少 warmup
- **WHEN** LLM-authored routine draft 缺少 `warmup` section 或 warmup item
- **THEN** validation 或 generate 工具 MUST 返回结构化失败
- **AND** recovery MUST 要求 LLM 基于候选补写 draft 或重新查询候选
- **AND** 服务端 MUST NOT 自动插入 warmup 动作形成成功 draft

#### Scenario: LLM draft 使用候选外动作
- **WHEN** LLM-authored routine draft 引用候选集合外的 `exerciseId`
- **THEN** generate 工具 MUST 返回 `candidate_set_mismatch` 或等价失败
- **AND** 服务端 MUST NOT 用候选内动作静默替换该动作
