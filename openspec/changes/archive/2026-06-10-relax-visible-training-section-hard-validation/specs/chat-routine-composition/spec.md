## MODIFIED Requirements

### Requirement: 聊天推送 routine 使用三段式草稿结构
聊天页面推送单次训练编排时，系统 SHALL 使用 routine 专用结构化草稿表达已生成的训练 section，不得继续用单日长期计划结构代表 routine。草稿 MUST 至少包含 `training` section；`warmup` 和 `stretch` 若由模型生成则 MUST 以结构化 section 展示，若缺失则系统 MUST NOT 伪造动作补齐。

#### Scenario: AI 生成单次训练编排
- **WHEN** 用户请求生成本次训练、动作组或训练流程，并且意图解析结果为 `routine`
- **THEN** 系统 MUST 生成 `kind = "routine"` 的 routine 草稿
- **AND** 草稿 MUST 至少包含 `training` section
- **AND** 草稿 MAY 包含模型实际生成的 `warmup` 或 `stretch` section
- **AND** 草稿 MUST NOT 依赖 `WorkoutPlanDraft.days[0]` 表达单次训练编排

#### Scenario: training 结构缺失
- **WHEN** AI routine 草稿缺少 `training` section
- **THEN** 服务端 MUST 判定草稿校验失败
- **AND** 系统 MUST NOT 将缺少主训练 section 的草稿发送给聊天卡片保存

#### Scenario: support section 缺失
- **WHEN** AI routine 草稿包含合法 `training` section
- **AND** 草稿缺少 `warmup`、`stretch` 或两者
- **THEN** routine 草稿 schema MUST 接受该结构
- **AND** 聊天卡片 MUST 展示已存在的 section
- **AND** 系统 MUST NOT 自动生成或插入缺失 support section 的动作

#### Scenario: Routine section 顺序
- **WHEN** 系统展示、保存或转换 routine 草稿
- **THEN** 系统 MUST 按 `warmup`、`training`、`stretch` 的相对顺序处理已存在的 section
- **AND** 系统 MUST NOT 让主训练循环重复热身或拉伸 section
