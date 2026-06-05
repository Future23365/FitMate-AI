## ADDED Requirements

### Requirement: 默认 prompt 必须表达明确 routine 请求的正向组合路径
系统 SHALL 在默认 Agent LLM prompt 中表达：当模型判断用户目标需要一次可执行 `routine`，且当前 run 已具备主训练 `training` 动作事实并可通过可见 tool 获取缺失 section 时，模型 MUST 优先继续获取 `warmup` / `stretch` 动作事实并输出完整三段式 `routine`。该合同 MUST NOT 使用固定用户短语、关键词、正则、同义词表或服务端语义分流替代模型判断。

#### Scenario: Prompt 引导候选足够时生成完整 routine
- **WHEN** 默认 prompt 配置生成 system message
- **AND** system message 描述 `payload.kind = "routine"` 的输出边界
- **THEN** system message MUST 说明明确 routine 目标在已有 `training` 动作事实且可继续查询缺失 section 时，应继续获取 `warmup` / `stretch` 动作事实
- **AND** system message MUST 说明候选足够后最终输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** system message MUST 说明 `routine` 必须包含 `warmup`、`training`、`stretch` 三类 `exerciseItems`，并为每个动作项绑定 `prescription`

#### Scenario: Prompt 禁止 routine 目标降级为动作列表
- **WHEN** 默认 prompt 描述明确 routine 目标的终态
- **THEN** system message MUST 说明不得因为只先查到 `training` 动作事实，就输出 `payload.kind = "exercise_selection"`、正文动作列表或“用户自行组合”的说明来替代 `routine`
- **AND** system message MUST 说明如果候选不足、tool 不可用或关键约束不足，合法收口是 `ask_user` 或不带 `visibleOutputs` 的 `final_answer`，说明缺口和可恢复下一步

#### Scenario: Prompt 不新增服务端语义分流
- **WHEN** 实现本 change
- **THEN** 默认 prompt MUST NOT 写入 F04、F17、F18 或等价测试编号
- **AND** 默认 prompt MUST NOT 写入“当用户说 X 时必须调用 Y”这类固定短语规则
- **AND** `/api/chat`、Agent runtime、tool handler、validator 和 renderer MUST NOT 根据用户原文改写 `toolName`、action 或 `payload.kind`
