## ADDED Requirements

### Requirement: 模型可见 Planner Policy 必须前置泛化训练请求范围判定

模型可见 Planner Policy SHALL 在首次动作库查询前表达泛化训练请求的范围判定。该判定 MUST 让模型区分单次 `routine`、周期 `plan`、动作集合和普通文本回答，并明确未指定具体肌群不得被解释为全身主要肌群或细分肌群的隐含硬约束。系统 MUST NOT 通过服务端关键词、正则、同义词表、固定用户短句或具体 tool result 字段组合替模型决定查询范围。

#### Scenario: 单次属性请求默认交付 routine

- **WHEN** 用户目标只包含训练目标、单次时长、场地、器械或强度条件
- **AND** 用户没有表达周期、多天、每周、训练日、休息日、分化训练、全身覆盖或具体目标肌群
- **THEN** 模型可见 Planner Policy MUST 引导模型优先交付 `payload.kind = "routine"`
- **AND** 模型可见 Planner Policy MUST 表达该请求不要求模型补齐周期 `schedule`
- **AND** 模型可见 Planner Policy MUST 表达该请求不要求模型补齐全身所有主要肌群或细分肌群

#### Scenario: 未指定肌群不是全肌群待补齐列表

- **WHEN** 用户没有指定具体目标肌群或身体部位
- **THEN** 模型可见 Planner Policy MUST 表达未指定肌群只是缺少该硬约束
- **AND** 模型可见 Planner Policy MUST NOT 把未指定肌群表达成胸、背、腿、肩、手臂、核心或等价全身肌群清单的待补齐任务
- **AND** 模型可见 Planner Policy MUST 引导模型围绕当前 `routine` 的目标、时长、器械和可执行性收敛动作选择

#### Scenario: 明确覆盖要求允许拆分肌群查询

- **WHEN** 用户明确要求全身覆盖、指定身体部位、指定分化训练、指定目标肌群，或当前可见候选无法组成任何可执行训练主体
- **THEN** 模型可见 Planner Policy MAY 允许模型把明确范围拆成动作库查询条件
- **AND** 拆分查询 MUST 以获取交付结构必需的数据库动作事实为目的
- **AND** 拆分查询 MUST NOT 为了获得更完整、更理想或更纯净的候选 inventory 而无限扩大范围

#### Scenario: 交付判定不得变成服务端语义分流

- **WHEN** 实现本范围判定
- **THEN** `/api/chat`、LangChain runtime、tool handler、validator、policy、response adapter 和 renderer MUST NOT 新增基于用户原文短语、关键词、正则或同义词表的条件分支
- **AND** 系统 MUST NOT 根据具体 `toolName` 或 tool result 字段组合替模型改写 provider `tool_calls`、`payload.kind` 或最终回答策略
