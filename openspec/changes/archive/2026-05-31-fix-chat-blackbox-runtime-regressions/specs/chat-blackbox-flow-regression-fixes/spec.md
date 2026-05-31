## MODIFIED Requirements

### Requirement: 黑盒失败样例必须被自动化回归覆盖

系统 SHALL 为最新手动 LLM 黑盒报告中暴露的聊天主路径失败增加自动化回归测试，覆盖服务端确定性边界，而不是只依赖真实模型手测。

#### Scenario: 胸部目标触发动作推荐

- **WHEN** 用户输入“今天我想练胸”或“今天想练胸”
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `exercise_recommendation`
- **AND** 系统 MUST NOT 触发 `workout_routine`

#### Scenario: 只补充长期计划频率和时长时继续追问

- **WHEN** 用户上一轮输入“给我一个每周训练计划”
- **AND** 系统没有可继承的具体训练目标或器械条件
- **AND** 用户输入“每周4练，每次45分钟”
- **THEN** 系统 MUST 保持长期计划补齐流程
- **AND** 系统 MUST NOT 触发 `workout_plan`
- **AND** 系统 MUST 继续请求用户补充训练目标或器械条件

#### Scenario: 只记录器械条件

- **WHEN** 用户输入“我有哑铃”
- **THEN** 系统 MUST NOT 触发 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **AND** 后续完整训练请求 MUST 能继承“哑铃”条件

#### Scenario: 已有 routine 后调整时长

- **WHEN** 会话最近已生成居家背部 30 分钟 `workout_routine`
- **AND** 用户输入“改成45分钟”
- **THEN** 系统 MUST 触发新的 `workout_routine`
- **AND** 新意图 MUST 保留背部目标和居家条件
- **AND** 新意图 MUST 将 `sessionMinutes` 更新为 45

#### Scenario: 非健身后切回训练推荐

- **WHEN** 用户上一轮是非健身问题
- **AND** 用户输入“那我今天练胸”
- **THEN** 系统 MUST 重新进入健身意图解析
- **AND** 系统 MUST 触发 `exercise_recommendation`

#### Scenario: 长期计划短语触发 plan

- **WHEN** 用户输入“给我一个6天训练计划”
- **THEN** 系统 MUST 识别为 `workout_plan`
- **AND** 系统 MUST NOT 因缺少器械或经验阻断计划生成
