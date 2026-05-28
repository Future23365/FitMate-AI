## ADDED Requirements

### Requirement: 长期计划三段式推送必须有自动化测试
项目 MUST 为长期计划推送的三段式草稿、计划层编排、保存转换和排期生成补充自动化测试。

#### Scenario: 测试长期计划草稿结构
- **WHEN** 测试 `WorkoutPlanDraft` schema 和 AI 草稿解析
- **THEN** 测试 MUST 覆盖合法三段式长期计划草稿
- **AND** 测试 MUST 覆盖缺少 `warmup`、缺少 `training`、缺少 `stretch`、动作项 section 与父 section 不一致、`days.length` 与 `weeklyFrequency` 不一致的失败场景

#### Scenario: 测试长期计划服务端校验
- **WHEN** 测试 workout plan validation
- **THEN** 测试 MUST 覆盖动作 ID 不存在、动作 ID 不在候选集合、训练日缺少差异、训练日时长超出用户单次时长、新手训练量偏高和伤病限制缺少安全提示

#### Scenario: 测试计划转换和保存
- **WHEN** 测试长期计划草稿转换为持久化 routine
- **THEN** 测试 MUST 验证每个训练日会转换为独立 `WorkoutRoutine`
- **AND** 测试 MUST 验证转换后的 `WorkoutRoutine.items` 保留 `warmup`、`training`、`stretch` section
- **AND** 测试 MUST 验证主训练循环配置只影响 training section

#### Scenario: 测试计划排期
- **WHEN** 测试长期计划导入日历
- **THEN** 测试 MUST 覆盖未来 1 周和未来 4 周导入
- **AND** 测试 MUST 覆盖 `weeklyFrequency` 1 到 7 的训练日与休息日生成
- **AND** 测试 MUST 验证重复导入只替换同一计划来源、同一日期范围内的 schedule

#### Scenario: 测试长期计划卡片渲染
- **WHEN** 测试聊天长期计划卡片
- **THEN** 测试 MUST 覆盖计划层摘要、训练日切换、三段式 section 展示、动作详情入口和导入按钮状态
- **AND** 测试 MUST 覆盖缺少动作详情快照时的兜底展示

#### Scenario: 测试手工 LLM 一致性用例
- **WHEN** 运行 manual LLM consistency tests
- **THEN** 长期计划用例 MUST 校验输出 `kind = "plan"`
- **AND** 长期计划用例 MUST 校验每个训练日包含 `warmup`、`training`、`stretch`
- **AND** 单次训练用例 MUST 继续校验输出 `kind = "routine"`，不得被误生成为长期计划
