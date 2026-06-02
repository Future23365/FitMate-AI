## MODIFIED Requirements

### Requirement: 黑盒测试必须验证用户可见输出

系统 SHALL 只以最终用户可见结果作为第一版断言对象，不把内部编排字段作为测试通过条件。报告中的实际卡片类型 SHALL 表示用户可见训练卡片和明确阻断状态，不得把同一轮的普通回复状态误算成训练卡片之外的额外卡片。

#### Scenario: 普通回复可展示
- **WHEN** 任一黑盒流程轮次完成
- **THEN** 系统 MUST 验证 assistant 用户可见文本非空
- **AND** assistant 用户可见文本 MUST NOT 泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字样

#### Scenario: 预期卡片正常推送
- **WHEN** 流程轮次预期推送动作推荐、单次训练或长期训练计划卡片
- **THEN** 系统 MUST 验证最终用户可见结果包含对应的 `exercise_recommendation`、`workout_routine` 或 `workout_plan` 卡片类型
- **AND** 系统 MUST NOT 因同一轮存在普通 assistant 文本而额外记录 `answer` 卡片失败
- **AND** 系统 MUST NOT 校验卡片内动作选择、训练容量或计划内容准确性

#### Scenario: 预期不推送卡片
- **WHEN** 流程轮次预期为追问、解释、建议问答或非健身回复
- **THEN** 系统 MUST 验证最终用户可见结果不包含训练卡片类型
- **AND** 系统 MUST 验证 assistant 用户可见文本可以作为普通回复展示

#### Scenario: 第一版只验证流程
- **WHEN** 黑盒 LLM 流程测试判断单轮结果
- **THEN** 系统 MUST 只验证是否能回答、是否按预期出现或不出现卡片
- **AND** 系统 MUST NOT 因动作 ID、训练组数、训练时长精确值或计划细节不够准确而判定失败
