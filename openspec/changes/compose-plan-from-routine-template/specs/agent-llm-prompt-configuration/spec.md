## ADDED Requirements

### Requirement: Agent prompt 必须表达 composition-first plan 收口
默认 LangChain Agent prompt SHALL 表达多天或周期 `plan` 的 composition-first 收口规则：模型先基于当前可见动作候选事实构造一套可重复 routine template，再补 `schedule.assignments`，然后通过 `submitVisibleTrainingProposal(payload.kind="plan")` 提交结构化训练结果。该规则 MUST 作为 Planner Policy 和 flow example 暴露给模型；系统 MUST NOT 在服务端 route、runtime、tool wrapper、validator 或 response adapter 中基于用户原文固定选择工具、固定输出结构或改写 provider tool call。

#### Scenario: plan 候选事实足够时进入结构化收口
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** prompt MUST 表达当用户目标需要一周、多天、周期或训练日 / 休息日安排，且当前可见动作事实足以构造 routine template 时，模型应先调用 `submitVisibleTrainingProposal` 提交 `payload.kind = "plan"`
- **AND** prompt MUST 表达 `fitmate_final_response.content` 只解释已校验 plan，不能替代结构化 plan
- **AND** prompt MUST NOT 根据固定用户短语、关键词、正则或业务 `toolName` 分支规定服务端行为

#### Scenario: plan flow example 使用 routine template 加 schedule
- **WHEN** 默认 prompt 暴露计划生成 flow example
- **THEN** example MUST 表达 `exerciseItems[]` 先组成同一套可重复 routine template
- **AND** example MUST 表达 `schedule.assignments` 再表达周期内 `training` / `rest` 日
- **AND** example MUST 表达 `submitVisibleTrainingProposal` 承载 `payload.kind = "plan"`
- **AND** example MUST NOT 要求模型先向用户展示 `payload.kind = "routine"` 再等待下一轮生成 plan

#### Scenario: ordinary advice 不被误升级为 plan
- **WHEN** 用户只请求普通训练知识、动作要点、热身方法或非结构化建议
- **THEN** prompt MAY 允许模型通过 `fitmate_final_response.content` 直接回答
- **AND** prompt MUST NOT 因文本中出现“一周”“每天”以外的无关词语而固定要求 `payload.kind = "plan"`
- **AND** prompt MUST NOT 让服务端用关键词判断是否生成 plan
